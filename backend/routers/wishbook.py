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
    "music": "on music", "food": "on a taste", "place": "on a place",
    "film": "on a story", "joy": "on what made them light up",
}
HTML_HEADERS = {
    "X-Robots-Tag": "noindex",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
}
CSS = """
body{font-family:Georgia,'Times New Roman',serif;color:#2b2b2b;background:#faf7f2;margin:0;line-height:1.65}
main{max-width:720px;margin:0 auto;padding:48px 24px 72px}
.cover{text-align:center;padding:48px 0 40px;border-bottom:1px solid #e3dccf;margin-bottom:8px}
.eyebrow{letter-spacing:.22em;text-transform:uppercase;font-size:.72rem;color:#9a8c7c;margin:0 0 18px}
h1{font-weight:normal;font-size:2.4rem;margin:0 0 10px;line-height:1.2}
.tag{color:#7a6f63;font-style:italic;margin:0 0 6px;font-size:1.05rem}
.facts{color:#9a8c7c;font-size:.95rem;margin:8px 0 0}
h2{font-weight:normal;font-size:1.25rem;border-bottom:1px solid #e3dccf;padding-bottom:6px;margin-top:44px;color:#5b5046}
h3{font-size:1.05rem;margin:20px 0 4px}
.muted{color:#7a6f63;font-size:.9rem}
ul{padding-left:20px}
li{margin:6px 0}
blockquote{margin:22px 0;padding:2px 0 2px 18px;border-left:3px solid #d9cdb8;font-size:1.18rem;font-style:italic;color:#3d352d}
blockquote cite{display:block;margin-top:6px;font-size:.85rem;font-style:normal;color:#9a8c7c}
.wish{break-inside:avoid;margin-bottom:6px}
.maybe{margin-top:44px;padding:4px 20px 14px;background:#f3eee5;border-radius:8px}
.maybe h2{border:none;margin-top:18px}
.notice{margin-top:56px;font-size:.85rem;color:#7a6f63;border-top:1px solid #e3dccf;padding-top:12px}
button{font:inherit;padding:8px 16px;border:1px solid #b9ad9c;background:#fff;border-radius:6px;cursor:pointer}
h2,h3{break-after:avoid}
@media print{body{background:#fff}.noprint{display:none}main{padding:0}.maybe{background:#fff;border:1px solid #e3dccf}}
"""

TAG_LIMIT = 5


class CompileIn(BaseModel):
    include_voices: bool = True


def _tag_rank(tag: dict):
    """0 = what something is (genre, dish, kind of place), 1 = where or how it sits,
    None = mood words and other detail that read as filler in a keepsake."""
    kind = str(tag.get("type") or tag.get("id") or "").lower()
    if "influenced_by" in kind:
        return None
    if "genre" in kind or "specialty_dish" in kind:
        return 0
    if "setting" in kind or "category" in kind or "influence" in kind:
        return 1
    return None


def headline_tags(tags, limit: int = TAG_LIMIT) -> list:
    """The few tag names worth printing for one item."""
    ranked, seen, plain = [], set(), []
    for i, t in enumerate(tags or []):
        if not isinstance(t, dict):
            continue
        name = str(t.get("name") or "").strip()
        if not name:
            continue
        plain.append(name)
        rank = _tag_rank(t)
        key = name.casefold()
        if rank is None or key in seen:
            continue
        seen.add(key)
        ranked.append((rank, i, name))
    ranked.sort()
    names = [n for _, _, n in ranked][:limit]
    return names or plain[:3]


def _join(names) -> str:
    names = [n for n in names if n]
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + " and " + names[-1]


def _top_tags(items, limit: int) -> list:
    """The tag names that come up most often across items, keeping first-seen order for ties."""
    counts, order = Counter(), {}
    for p in items:
        for name in headline_tags(p["tags"]):
            counts[name] += 1
            order.setdefault(name, len(order))
    return sorted(counts, key=lambda n: (-counts[n], order[n]))[:limit]


def learned_lines(first_name: str, portrait, voices) -> list:
    """Plain sentences about the person. Only what the family told us, or what they reacted to."""
    known = [p for p in portrait if p["source_label"] in ("told", "reacted")]
    lines = []

    music = [p for p in known if p["domain"] == "music"]
    if music:
        tags = _top_tags(music, 3)
        if tags:
            lines.append(f"{first_name}'s music leans towards {_join(tags)}.")

    food = [p for p in known if p["domain"] == "food"]
    if food:
        lines.append(f"A taste that mattered to {first_name}: {_join([p['name'] for p in food])}.")

    place = [p for p in known if p["domain"] == "place"]
    if place:
        tags = [t.lower() for t in _top_tags(place, 3)]
        names = _join([p["name"] for p in place])
        if tags:
            lines.append(f"{names} mattered to {first_name}. It reads as {_join(tags)}.")
        else:
            lines.append(f"{names} mattered to {first_name}.")

    film = [p for p in known if p["domain"] == "film"]
    if film:
        lines.append(f"Stories {first_name} enjoyed: {_join([p['name'] for p in film])}.")

    return lines


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
        "select id, title, description, mode, kind, basis from wish "
        "where person_id = %s order by created_at",
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

    known = [p for p in portrait if p["source_label"] in ("told", "reacted")]
    themes = Counter()
    for p in known:
        for name in headline_tags(p["tags"]):
            themes[name] += 1

    items = []
    for p in portrait:
        names = [t["name"] for t in (p["tags"] or []) if isinstance(t, dict) and t.get("name")]
        items.append({
            "domain": p["domain"],
            "name": p["name"],
            "tags": headline_tags(p["tags"]),
            "tag_count": len(names),
            "label": SOURCE_LABELS.get(p["source_label"], ""),
            "source": p["source_label"],
        })

    return {
        "title": f"{person['first_name']}: a Wish Book",
        "tagline": "Everyone deserves to be known before they go.",
        "person": {
            "first_name": person["first_name"],
            "birth_year": person["birth_year"],
            "region": person["region"],
        },
        "portrait": items,
        "themes": [{"name": n, "count": c} for n, c in themes.most_common(5)],
        "learned": learned_lines(person["first_name"], portrait, voices),
        "wishes": [
            {
                "title": w["title"],
                "description": w["description"],
                "mode": w["mode"],
                "kind": w["kind"],
                "basis": w["basis"],
                "makers": by_wish.get(str(w["id"]), []),
            }
            for w in wishes
        ],
        "voices": [{"from": v["contributor_first_name"], "answers": v["answers"]} for v in voices],
        "notice": DISCLAIMER,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def _is_guess(item: dict) -> bool:
    if item.get("source") in ("likely", "ai-only"):
        return True
    # Books compiled before the `source` field existed carry only the label text.
    return item.get("label") in (SOURCE_LABELS["likely"], SOURCE_LABELS["ai-only"])


def render_html(c: dict) -> str:
    e = html.escape
    person = c.get("person") or {}

    facts = []
    if person.get("birth_year"):
        facts.append(f"Born {e(str(person['birth_year']))}")
    if person.get("region"):
        facts.append(e(person["region"]))
    out = [
        "<header class='cover'><p class='eyebrow'>A Genie keepsake</p>"
        f"<h1>{e(c.get('title', ''))}</h1><p class='tag'>{e(c.get('tagline', ''))}</p>"
        + (f"<p class='facts'>{', '.join(facts)}</p>" if facts else "")
        + "</header>"
    ]

    portrait = c.get("portrait") or []
    known = [i for i in portrait if not _is_guess(i)]
    guesses = [i for i in portrait if _is_guess(i)]

    groups = defaultdict(list)
    for item in known:
        groups[item.get("domain") or "other"].append(item)
    if groups:
        out.append("<h2>Who they were</h2>")
        for domain in ("music", "food", "place", "film", "other"):
            if domain not in groups:
                continue
            out.append(f"<h3>{e(DOMAIN_LABELS[domain])}</h3><ul>")
            for item in groups[domain]:
                tags = ", ".join(e(t) for t in (item.get("tags") or [])[:TAG_LIMIT])
                note = e(item.get("label") or "")
                if tags:
                    note = f"{note}; {tags}" if note else tags
                out.append(
                    f"<li>{e(item.get('name', ''))}"
                    + (f" <span class='muted'>({note})</span>" if note else "")
                    + "</li>"
                )
            out.append("</ul>")

    if c.get("learned"):
        out.append("<h2>What we learned about them</h2><ul>")
        out += [f"<li>{e(t)}</li>" for t in c["learned"]]
        out.append("</ul>")

    voices = c.get("voices") or []
    if voices:
        out.append("<h2>In their own words</h2>")
        for v in voices:
            who = e(v.get("from", ""))
            answers = v.get("answers") or {}
            ordered = [k for k in QUESTION_LABELS if k in answers] + [k for k in answers if k not in QUESTION_LABELS]
            for key in ordered:
                text = answers[key]
                about = e(QUESTION_LABELS.get(key, key))
                out.append(f"<blockquote>{e(str(text))}<cite>{who}, {about}</cite></blockquote>")

    has_sample = False
    wishes = c.get("wishes") or []
    if wishes:
        out.append("<h2>Wishes</h2>")
        for w in wishes:
            mode = "In person" if w.get("mode") == "in-person" else "From anywhere"
            if w.get("basis") == "likely":
                mode += " · A guess, the family decides"
            out.append(f"<div class='wish'><h3>{e(w.get('title', ''))}</h3><p class='muted'>{e(mode)}</p>")
            if w.get("description"):
                out.append(f"<p>{e(w['description'])}</p>")
            for m in w.get("makers") or []:
                tag = ""
                if m.get("is_sample"):
                    has_sample = True
                    tag = " (sample)"
                out.append(f"<p class='muted'>With {e(m.get('name', ''))}, {e(m.get('type', ''))}{tag}</p>")
            out.append("</div>")

    if guesses:
        out.append("<section class='maybe'><h2>Maybe, from their era and region</h2>")
        out.append("<p class='muted'>These are guesses, not things the family told us. The family decides.</p><ul>")
        for item in guesses:
            tags = ", ".join(e(t) for t in (item.get("tags") or [])[:3])
            out.append(
                f"<li>{e(item.get('name', ''))}"
                + (f" <span class='muted'>({tags})</span>" if tags else "")
                + "</li>"
            )
        out.append("</ul></section>")

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