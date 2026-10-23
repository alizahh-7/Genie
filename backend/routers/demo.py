import logging
import os
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from db import get_conn
from routers.matching import WISH_COLS, load_context, match_one

log = logging.getLogger("genie.demo")
router = APIRouter(prefix="/demo", tags=["demo"])

TTL_DAYS = int(os.environ.get("DEMO_TTL_DAYS", "7"))


def demo_sources() -> list:
    """Pinned demo persona ids, from DEMO_PERSON_IDS (comma separated, private)."""
    out = []
    for raw in os.environ.get("DEMO_PERSON_IDS", "").split(","):
        raw = raw.strip()
        if not raw:
            continue
        try:
            out.append(str(UUID(raw)))
        except ValueError:
            continue
    return out


class StartIn(BaseModel):
    persona: int = Field(default=0, ge=0, le=9)


@router.get("/personas")
def list_personas():
    """Lists the demo personas by position only. Their real ids are never exposed."""
    out = []
    with get_conn() as conn:
        for i, pid in enumerate(demo_sources()):
            row = conn.execute(
                "select first_name, birth_year, region, language from person "
                "where id = %s and expires_at > now()",
                (pid,),
            ).fetchone()
            if row:
                out.append({"persona": i, **row})
    return out


@router.post("/start")
def start_demo(body: Optional[StartIn] = None):
    """Copies a pinned demo persona into a brand-new person with the normal expiry."""
    index = body.persona if body else 0
    sources = demo_sources()
    if index >= len(sources):
        raise HTTPException(404, "The demo is not available right now")
    source_id = sources[index]

    with get_conn() as conn:
        src = conn.execute(
            "select first_name, birth_year, region, language from person "
            "where id = %s and expires_at > now()",
            (source_id,),
        ).fetchone()
        if not src:
            raise HTTPException(404, "The demo is not available right now")

        person = conn.execute(
            """
            insert into person (first_name, birth_year, region, language, expires_at)
            values (%s, %s, %s, %s, now() + make_interval(days => %s))
            returning *
            """,
            (src["first_name"], src["birth_year"], src["region"], src["language"], TTL_DAYS),
        ).fetchone()
        new_id = person["id"]

        conn.execute(
            """
            insert into portrait_item
              (person_id, domain, name, qloo_entity_id, qloo_tags, source_label,
               confidence, resolution_level, matched_name, created_at)
            select %s, domain, name, qloo_entity_id, qloo_tags, source_label,
                   confidence, resolution_level, matched_name,
                   now() + row_number() over (order by created_at, name) * interval '1 millisecond'
            from portrait_item where person_id = %s
            """,
            (new_id, source_id),
        )
        conn.execute(
            """
            insert into wish
              (person_id, title, description, mode, source_items, kind, maker_type,
               tags, basis, why, affinity, discovered, created_at)
            select %s, title, description, mode, source_items, kind, maker_type,
                   tags, basis, why, affinity, discovered,
                   now() + row_number() over (order by created_at) * interval '1 millisecond'
            from wish where person_id = %s
            """,
            (new_id, source_id),
        )
        conn.execute(
            """
            insert into agent_log (person_id, step, log, created_at)
            select %s, step, log,
                   now() + row_number() over (order by created_at) * interval '1 millisecond'
            from agent_log where person_id = %s
            """,
            (new_id, source_id),
        )
        # Fictional family memories for the Wish Book. If this fails, the demo still works.
        try:
            with conn.transaction():
                conn.execute(
                    """
                    insert into circle_response
                      (token, person_id, contributor_first_name, answers, consent_given, created_at)
                    select token, %s, contributor_first_name, answers, consent_given,
                           now() + row_number() over (order by created_at) * interval '1 millisecond'
                    from circle_response where person_id = %s
                    """,
                    (new_id, source_id),
                )
        except Exception as exc:
            log.warning("Demo memories were not copied: %s", exc)

    matches = []
    try:
        with get_conn() as conn:
            person_row, portrait_rows, makers = load_context(conn, new_id)
            wish_rows = conn.execute(
                f"select {WISH_COLS} from wish where person_id = %s order by created_at",
                (new_id,),
            ).fetchall()
            matches = [match_one(conn, person_row, w, portrait_rows, makers, 5) for w in wish_rows]
    except Exception as exc:
        log.warning("Demo matching failed: %s", exc)

    return {"person_id": new_id, "person": person, "matches": matches}