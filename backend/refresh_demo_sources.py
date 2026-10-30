"""Refreshes the pinned demo sources. Makes no Qloo or AI calls. Safe to run more than once.
  1. Checks each pinned person exists.
  2. Adds a third family memory if it is missing.
  3. Fills a friendly `label` into stored Qloo call logs that do not have one.
Run from the backend folder:  python refresh_demo_sources.py"""
import os
import re
from uuid import UUID

from dotenv import load_dotenv
from psycopg.types.json import Jsonb

load_dotenv()
from db import get_conn  # noqa: E402  (after load_dotenv so DATABASE_URL is set)

THIRD_MEMORY = {
    "Nani": ("Zoya", {
        "food": "Sheer khurma on Eid morning, with far too many almonds.",
        "joy": "The first rain of the year. She opened every window and sat on the veranda.",
    }),
    "Sana": ("Dahye", {
        "place": "Our trip to Busan. She stood at the water for an hour and said nothing, and it was the happiest I had seen her.",
        "joy": "Mornings with tea, before anyone else was awake.",
    }),
}

QUERY_RE = re.compile(r"""['"]?query['"]?\s*[:=]\s*['"]([^'"]{1,80})['"]""")
TYPE_RE = re.compile(r"urn:entity:([a-z_]+)")
KINDS = {"place": "a place", "artist": "an artist", "movie": "a film", "tv_show": "a show",
         "brand": "a brand", "book": "a book", "podcast": "a podcast"}


def make_label(row: dict) -> str:
    step = str(row.get("step") or "").lower()
    status = str(row.get("status") or "").lower()
    req = str(row.get("request") or "")
    q = QUERY_RE.search(req)
    name = q.group(1).strip() if q else None
    t = TYPE_RE.search(req)
    kind = KINDS.get(t.group(1)) if t else None

    if step == "resolve" and name:
        what = f"Looked up {name}" + (f" as {kind}" if kind else "")
    elif step == "expand":
        what = "Followed taste links" + (f" from {name}" if name else "")
    elif step == "discover":
        what = "Asked what people with similar taste also love"
    elif step == "era":
        what = "Looked for guesses from their era and region"
    else:
        what = "Asked Qloo"

    if status == "cached":
        return f"{what}. Remembered."
    if status == "no results":
        return f"{what}. Not in Qloo. Kept and labelled."
    if status in ("timeout", "network", "no key") or status.startswith("http"):
        return f"{what}. Qloo did not answer. Kept and labelled."
    return f"{what}."


def fill_rows(rows) -> int:
    n = 0
    for r in rows:
        if isinstance(r, dict) and not r.get("label"):
            r["label"] = make_label(r)
            n += 1
    return n


def fill_log(log) -> int:
    if isinstance(log, list):
        return fill_rows(log)
    if isinstance(log, dict) and isinstance(log.get("qloo_log"), list):
        return fill_rows(log["qloo_log"])
    return 0


def main():
    ids = [x.strip() for x in os.environ.get("DEMO_PERSON_IDS", "").split(",") if x.strip()]
    if not ids:
        raise SystemExit("DEMO_PERSON_IDS is empty in .env")
    with get_conn() as conn:
        for i, pid in enumerate(ids):
            try:
                UUID(pid)
            except ValueError:
                print(f"Persona {i}: not a valid id, skipped")
                continue
            person = conn.execute(
                "select first_name, expires_at from person where id = %s", (pid,)
            ).fetchone()
            if not person:
                print(f"Persona {i} ({pid[:8]}...): NOT FOUND in this database")
                continue

            added = ""
            third = THIRD_MEMORY.get(person["first_name"])
            if third:
                token = f"demo-{pid}"
                conn.execute(
                    "insert into circle_invite (token, person_id) values (%s, %s) on conflict do nothing",
                    (token, pid),
                )
                have = {
                    r["contributor_first_name"]
                    for r in conn.execute(
                        "select contributor_first_name from circle_response where person_id = %s", (pid,)
                    ).fetchall()
                }
                name, answers = third
                if name not in have:
                    conn.execute(
                        "insert into circle_response "
                        "(token, person_id, contributor_first_name, answers, consent_given, created_at) "
                        "values (%s, %s, %s, %s, true, now())",
                        (token, pid, name, Jsonb(answers)),
                    )
                    added = f", added memory from {name}"

            labelled = 0
            for row in conn.execute(
                "select ctid::text as ctid, log from agent_log where person_id = %s", (pid,)
            ).fetchall():
                log = row["log"]
                n = fill_log(log)
                if n:
                    conn.execute(
                        "update agent_log set log = %s where ctid = %s::tid", (Jsonb(log), row["ctid"])
                    )
                    labelled += n

            counts = conn.execute(
                """
                select (select count(*) from circle_response where person_id = %s) as circle,
                       (select count(*) from agent_log where person_id = %s) as logs,
                       (select count(*) from portrait_item where person_id = %s) as portrait,
                       (select count(*) from wish where person_id = %s) as wishes
                """,
                (pid, pid, pid, pid),
            ).fetchone()
            print(
                f"Persona {i} ({pid[:8]}...) {person['first_name']}: expires {person['expires_at']:%Y-%m-%d}, "
                f"{counts['circle']} memories{added}, {counts['logs']} agent logs "
                f"({labelled} call rows labelled), {counts['portrait']} portrait items, {counts['wishes']} wishes"
            )


if __name__ == "__main__":
    main()