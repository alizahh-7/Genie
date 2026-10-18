import concurrent.futures
import time
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field

from db import get_conn, require_person
from routers.matching import WISH_COLS, load_context, match_one
from routers.portrait import PortraitItemIn, replace_portrait
from routers.wishes import WishIn, insert_wish

router = APIRouter(prefix="/persons", tags=["agent"])

_pool = concurrent.futures.ThreadPoolExecutor(max_workers=4)
ENGINE_TIMEOUT = 40  # seconds per engine call


class QuickFact(BaseModel):
    domain: Literal["music", "food", "place", "film", "other"]
    name: str = Field(min_length=1, max_length=200)
    hint: Optional[str] = Field(default=None, max_length=100)


class BuildIn(BaseModel):
    quick_facts: list[QuickFact] = Field(default_factory=list, max_length=30)


def load_engine():
    try:
        import engine
    except Exception:
        raise HTTPException(503, "Genie's agent is not available on this server")
    return engine


def run_engine(fn, *args):
    future = _pool.submit(fn, *args)
    try:
        return future.result(timeout=ENGINE_TIMEOUT)
    except concurrent.futures.TimeoutError:
        raise HTTPException(504, "This is taking longer than expected. Please try again in a moment.")
    except Exception:
        raise HTTPException(502, "Something went wrong while gathering their story. Please try again.")


def elapsed_ms(start) -> int:
    return int((time.monotonic() - start) * 1000)


def person_dict(conn, person_id) -> dict:
    row = conn.execute(
        "select first_name, birth_year, region, language from person where id = %s", (person_id,)
    ).fetchone()
    return dict(row)


def read_build_inputs(person_id, body):
    with get_conn() as conn:  # released before the slow engine call
        require_person(conn, person_id)
        person = person_dict(conn, person_id)
        circle = conn.execute(
            "select contributor_first_name, answers from circle_response "
            "where person_id = %s order by created_at",
            (person_id,),
        ).fetchall()
    inputs = {
        "quick_facts": [q.model_dump(exclude_none=True) for q in body.quick_facts],
        "circle_answers": [
            {"contributor": c["contributor_first_name"], "answers": c["answers"]} for c in circle
        ],
    }
    return person, inputs


def store_portrait(person_id, result) -> int:
    items = []
    for raw in result.get("items") or []:
        try:
            items.append(PortraitItemIn(**raw))
        except Exception:
            continue  # skip an item the database would not accept
    with get_conn() as conn:
        require_person(conn, person_id)
        saved = replace_portrait(conn, person_id, items)
        conn.execute(
            "insert into agent_log (person_id, step, log) values (%s, 'portrait', %s)",
            (person_id, Jsonb(result.get("qloo_log") or [])),
        )
    return saved


def read_portrait(person_id):
    with get_conn() as conn:
        require_person(conn, person_id)
        person = person_dict(conn, person_id)
        rows = conn.execute(
            """
            select domain, name, qloo_entity_id, qloo_tags as tags, source_label,
                   confidence, resolution_level, matched_name
            from portrait_item where person_id = %s order by created_at, name
            """,
            (person_id,),
        ).fetchall()
    return person, [dict(r) for r in rows]


def store_wishes(person_id, result):
    wishes = []
    for raw in result.get("wishes") or []:
        try:
            wishes.append(WishIn(**raw))
        except Exception:
            continue
    with get_conn() as conn:
        require_person(conn, person_id)
        # Replace earlier generated wishes, but keep any wish that already has a request in progress.
        conn.execute(
            """
            delete from wish w
            where w.person_id = %s and w.kind is not null
              and not exists (
                select 1 from wish_match m
                where m.wish_id = w.id and m.status in ('requested', 'accepted', 'done')
              )
            """,
            (person_id,),
        )
        saved = [insert_wish(conn, person_id, w) for w in wishes]
        conn.execute(
            "insert into agent_log (person_id, step, log) values (%s, 'wishes', %s)",
            (person_id, Jsonb(result.get("qloo_log") or [])),
        )
    return saved


@router.post("/{person_id}/portrait/build")
def build_person_portrait(person_id: UUID, body: BuildIn):
    engine = load_engine()
    person, inputs = read_build_inputs(person_id, body)
    result = run_engine(engine.build_portrait, person, inputs) or {}
    saved = store_portrait(person_id, result)
    return {
        "saved": saved,
        "items": result.get("items") or [],
        "qloo_log": result.get("qloo_log") or [],
    }


@router.post("/{person_id}/wishes/generate")
def generate_person_wishes(person_id: UUID):
    engine = load_engine()
    person, rows = read_portrait(person_id)
    if not rows:
        raise HTTPException(409, "Build the Taste Portrait before generating wishes")
    result = run_engine(engine.generate_wishes, rows, person) or {}
    saved = store_wishes(person_id, result)
    return {
        "wishes": saved,
        "follow_up": result.get("follow_up"),
        "qloo_log": result.get("qloo_log") or [],
    }


@router.post("/{person_id}/agent/run")
def run_whole_agent(person_id: UUID, body: BuildIn):
    """Portrait, then wishes, then matching, in one call, with steps and timings."""
    engine = load_engine()
    started = time.monotonic()
    steps, timings, qloo_log = [], {}, []

    t = time.monotonic()
    person, inputs = read_build_inputs(person_id, body)
    portrait_result = run_engine(engine.build_portrait, person, inputs) or {}
    saved_items = store_portrait(person_id, portrait_result)
    timings["portrait"] = elapsed_ms(t)
    steps.append({"name": "portrait", "status": "ok", "ms": timings["portrait"], "items": saved_items})
    qloo_log += portrait_result.get("qloo_log") or []

    wishes, matches, follow_up = [], [], None
    if saved_items:
        t = time.monotonic()
        person, rows = read_portrait(person_id)
        wishes_result = run_engine(engine.generate_wishes, rows, person) or {}
        wishes = store_wishes(person_id, wishes_result)
        follow_up = wishes_result.get("follow_up")
        timings["wishes"] = elapsed_ms(t)
        steps.append({"name": "wishes", "status": "ok", "ms": timings["wishes"], "wishes": len(wishes)})
        qloo_log += wishes_result.get("qloo_log") or []

        t = time.monotonic()
        with get_conn() as conn:
            person_row, portrait_rows, makers = load_context(conn, person_id)
            wish_rows = conn.execute(
                f"select {WISH_COLS} from wish where person_id = %s order by created_at", (person_id,)
            ).fetchall()
            matches = [match_one(conn, person_row, w, portrait_rows, makers, 5) for w in wish_rows]
        timings["matching"] = elapsed_ms(t)
        steps.append({"name": "matching", "status": "ok", "ms": timings["matching"], "wishes": len(matches)})
    else:
        steps.append({"name": "wishes", "status": "skipped", "ms": 0})
        steps.append({"name": "matching", "status": "skipped", "ms": 0})

    timings["total"] = elapsed_ms(started)
    return {
        "steps": steps,
        "timings_ms": timings,
        "portrait": portrait_result.get("items") or [],
        "wishes": wishes,
        "follow_up": follow_up,
        "matches": matches,
        "qloo_log": qloo_log,
    }


@router.get("/{person_id}/agent-log")
def get_agent_log(person_id: UUID):
    with get_conn() as conn:
        require_person(conn, person_id)
        return conn.execute(
            "select step, log, created_at from agent_log where person_id = %s order by created_at",
            (person_id,),
        ).fetchall()