import html
import secrets
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
from psycopg.types.json import Jsonb
from pydantic import BaseModel

from db import get_conn, require_person
from notices import DISCLAIMER, SAMPLE_LABEL, SOURCE_LABELS

owner = APIRouter(prefix="/persons", tags=["wish book"])
public = APIRouter(prefix="/book", tags=["wish book"])

DOMAIN_LABELS = {
    "music": "Music", "food": "Tastes and food", "place": "Places",
    "film": "Films and stories", "other": "Other",
}
QUESTION_LABELS = {
    "music": "Music", "food": "A taste", "place": "A place",
    "film": "A story", "joy": "What made them light up",
}
HTML_HEADERS = {
    "X-Robots-Tag": "noindex",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
}
CSS = """
body{font-family:Georgia,'Times New Roman',serif;color:#2b2b2b;background:#faf7f2;margin:0;line-height:1.6}
main{max-width:720px;margin:0 auto;padding:40px 24px 64px}
h1{font-weight:normal;font-size:2rem;margin:0 0 4px}
.tag{color:#7a6f63;font-style:italic;margin:0 0 32px}
h2{font-weight:normal;font-size:1.2rem;border-bottom:1px solid #e3dccf;padding-bottom:6px;margin-top:40px;color:#5b5046}
h3{font-size:1.05rem;margin:18px 0 4px}
.muted{color:#7a6f63;font-size:.9rem}
li{margin:4px 0}
.notice{margin-top:48px;font-size:.85rem;color:#7a6f63;border-top:1px solid #e3dccf;padding-top:12px}
button{font:inherit;padding:8px 16px;border:1px solid #b9ad9c;background:#fff;border-radius:6px;cursor:pointer}
@media print{body{background:#fff}.noprint{display:none}main{padding:0}}
"""


class CompileIn(BaseModel):
    include_voices: bool = True


def build_content(conn, person_id, include_voices: bool) -> dict:
    person = conn.execute(
        "select first_name, birth_year, region from person where id = %s", (person_id,)
    ).fetchone()
    portrait = conn.execute(
        "select domain, name, qloo_tags as tags, source_label from portrait_item "
        "where person_id = %s order by created_at, name",
        (person_id,),
    ).fetchall()
    wishes = conn.execute(
        "select id, title, description, mode from wish where person_id = %s order by created_at",
        (person_id,),
    ).fetchall()
    if not portrait and not wishes:
        raise HTTPException(409, "There is nothing to put in the Wish Book yet")
    matches = conn.execute(
        """
        select m.wish_id, m.status, mk.name, mk.type, mk.is_sample
        from wish_match m
        join wish_maker mk on mk.id = m.maker_id
        join wish w on w.id = m.wish_id
        where w.person_id = %s and m.status in ('accepted', 'done')
        order by m.responded_at
        """,
        (person_id,),
    ).fetchall()
    voices = []
    if include_voices:
        voices = conn.execute(
            "select contributor_first_name, answers from circle_response "
            "where person_id = %s order by created_at",
            (person_id,),
        ).fetchall()

    by_wish = defaultdict(list)
    for m in matches:
        by_wish[str(m["wish_id"])].append(
            {"name": m["name"], "type": m["type"], "status": m["status"], "is_sample": m["is_sample"]}
        )

    themes = Counter()
    for p in portrait:
        for t in p["tags"] or []:
            if isinstance(t, dict) and t.get("name"):
                themes[t["name"]] += 1

    learned = [f"Their world kept returning to {name}." for name, n in themes.most_common(3) if n >= 2]
    for v in voices:
        joy = (v["answers"] or {}).get("joy")
        if joy:
            learned.append(f"{v['contributor_first_name']} remembers: {joy}")

    return {
        "title": f"{person['first_name']}: a Wish Book",
        "tagline": "Everyone deserves to be known before they go.",
        "person": {
            "first_name": person["first_name"],
            "birth_year": person["birth_year"],
            "region": person["region"],
        },
        "portrait": [
            {
                "domain": p["domain"],
                "name": p["name"],
                "tags": [t["name"] for t in (p["tags"] or []) if isinstance(t, dict) and t.get("name")],
                "label": SOURCE_LABELS.get(p["source_label"], ""),
            }
            for p in portrait
        ],
        "themes": [{"name": n, "count": c} for n, c in themes.most_common(5)],
        "learned": learned,
        "wishes": [
            {
                "title": w["title"],
                "description": w["description"],
                "mode": w["mode"],
                "makers": by_wish.get(str(w["id"]), []),
            }
            for w in wishes
        ],
        "voices": [{"from": v["contributor_first_name"], "answers": v["answers"]} for v in voices],
        "notice": DISCLAIMER,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def render_html(c: dict) -> str:
    e = html.escape
    person = c.get("person") or {}
    out = [f"<h1>{e(c.get('title', ''))}</h1>", f"<p class='tag'>{e(c.get('tagline', ''))}</p>"]

    facts = []
    if person.get("birth_year"):
        facts.append(f"Born {e(str(person['birth_year']))}")
    if person.get("region"):
        facts.append(e(person["region"]))
    if facts:
        out.append(f"<p class='muted'>{', '.join(facts)}</p>")

    groups = defaultdict(list)
    for item in c.get("portrait") or []:
        groups[item.get("domain") or "other"].append(item)
    if groups:
        out.append("<h2>Who they were</h2>")
        for domain in ("music", "food", "place", "film", "other"):
            if domain not in groups:
                continue
            out.append(f"<h3>{e(DOMAIN_LABELS[domain])}</h3><ul>")
            for item in groups[domain]:
                note = e(item.get("label") or "")
                tags = ", ".join(e(t) for t in item.get("tags") or [])
                if tags:
                    note += f"; {tags}"
                out.append(f"<li>{e(item.get('name', ''))} <span class='muted'>({note})</span></li>")
            out.append("</ul>")

    if c.get("learned"):
        out.append("<h2>What we learned about them</h2><ul>")
        out += [f"<li>{e(t)}</li>" for t in c["learned"]]
        out.append("</ul>")

    has_sample = False
    wishes = c.get("wishes") or []
    if wishes:
        out.append("<h2>Wishes</h2>")
        for w in wishes:
            mode = "In person" if w.get("mode") == "in-person" else "From anywhere"
            out.append(f"<h3>{e(w.get('title', ''))}</h3><p class='muted'>{mode}</p>")
            if w.get("description"):
                out.append(f"<p>{e(w['description'])}</p>")
            for m in w.get("makers") or []:
                tag = ""
                if m.get("is_sample"):
                    has_sample = True
                    tag = " (sample)"
                out.append(f"<p class='muted'>With {e(m.get('name', ''))}, {e(m.get('type', ''))}{tag}</p>")

    voices = c.get("voices") or []
    if voices:
        out.append("<h2>From the people who love them</h2>")
        for v in voices:
            out.append(f"<h3>{e(v.get('from', ''))}</h3><ul>")
            for key, text in (v.get("answers") or {}).items():
                out.append(f"<li><span class='muted'>{e(QUESTION_LABELS.get(key, key))}:</span> {e(str(text))}</li>")
            out.append("</ul>")

    foot = e(c.get("notice") or DISCLAIMER)
    if has_sample:
        foot += " " + e(SAMPLE_LABEL)
    out.append(f"<p class='notice'>{foot}</p>")
    out.append("<p class='noprint'><button onclick='window.print()'>Print or save as PDF</button></p>")

    title = e(c.get("title", "Wish Book"))
    return (
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width, initial-scale=1'>"
        "<meta name='robots' content='noindex'><meta name='referrer' content='no-referrer'>"
        f"<title>{title}</title><style>{CSS}</style></head><body><main>"
        + "".join(out)
        + "</main></body></html>"
    )


def load_book(conn, person_id):
    row = conn.execute(
        "select compiled_content, share_token from wish_book where person_id = %s", (person_id,)
    ).fetchone()
    if not row or not row["compiled_content"]:
        raise HTTPException(404, "The Wish Book has not been compiled yet")
    return row


@owner.post("/{person_id}/wish-book/compile")
def compile_book(person_id: UUID, body: Optional[CompileIn] = None):
    include = True if body is None else body.include_voices
    with get_conn() as conn:
        require_person(conn, person_id)
        content = build_content(conn, person_id, include)
        row = conn.execute(
            """
            insert into wish_book (person_id, compiled_content, updated_at)
            values (%s, %s, now())
            on conflict (person_id) do update
              set compiled_content = excluded.compiled_content, updated_at = now()
            returning share_token
            """,
            (person_id, Jsonb(content)),
        ).fetchone()
    return {"content": content, "share_token": row["share_token"]}


@owner.get("/{person_id}/wish-book")
def get_book(person_id: UUID):
    with get_conn() as conn:
        require_person(conn, person_id)
        row = load_book(conn, person_id)
    return {"content": row["compiled_content"], "share_token": row["share_token"]}


@owner.get("/{person_id}/wish-book/print", response_class=HTMLResponse)
def print_own_book(person_id: UUID):
    with get_conn() as conn:
        require_person(conn, person_id)
        row = load_book(conn, person_id)
    return HTMLResponse(render_html(row["compiled_content"]), headers=HTML_HEADERS)


@owner.post("/{person_id}/wish-book/share")
def share_book(person_id: UUID):
    with get_conn() as conn:
        require_person(conn, person_id)
        row = load_book(conn, person_id)
        token = row["share_token"] or secrets.token_urlsafe(32)
        conn.execute("update wish_book set share_token = %s where person_id = %s", (token, person_id))
    return {"share_token": token, "path": f"/book/{token}"}


@owner.delete("/{person_id}/wish-book/share")
def stop_sharing(person_id: UUID):
    with get_conn() as conn:
        require_person(conn, person_id)
        conn.execute("update wish_book set share_token = null where person_id = %s", (person_id,))
    return {"shared": False}


def load_shared(conn, token):
    row = conn.execute(
        "select b.compiled_content from wish_book b join person p on p.id = b.person_id "
        "where b.share_token = %s and p.expires_at > now()",
        (token,),
    ).fetchone()
    if not row:
        raise HTTPException(404, "This Wish Book is not available")
    return row["compiled_content"]


@public.get("/{token}")
def shared_book(token: str):
    with get_conn() as conn:
        return load_shared(conn, token)


@public.get("/{token}/print", response_class=HTMLResponse)
def shared_book_print(token: str):
    with get_conn() as conn:
        content = load_shared(conn, token)
    return HTMLResponse(render_html(content), headers=HTML_HEADERS)