import concurrent.futures
import os
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
ENGINE_TIMEOUT = 40  # seconds for one engine call
AGENT_TIMEOUT = 70   # seconds for the whole run_agent call


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


def run_engine(fn, *args, timeout=ENGINE_TIMEOUT, **kwargs):
    future = _pool.submit(fn, *args, **kwargs)
    try:
        return future.result(timeout=timeout)
    except concurrent.futures.TimeoutError:
        raise HTTPException(504, "This is taking longer than expected. Please try again in a moment.")
    except Exception:
        raise HTTPException(502, "Something went wrong while gathering their story. Please try again.")


def polish_enabled() -> bool:
    return os.environ.get("WISH_POLISH", "0") == "1"


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


def store_portrait(person_id, raw_items, qloo_log=None, step="portrait", allow_empty=False) -> int:
    items = []
    for raw in raw_items or []:
        try:
            items.append(PortraitItemIn(**raw))
        except Exception:
            continue  # skip an item the database would not accept
    if not items and not allow_empty:
        return 0  # an empty engine result must never wipe a saved portrait
    with get_conn() as conn:
        require_person(conn, person_id)
        saved = replace_portrait(conn, person_id, items)
        if qloo_log is not None:
            conn.execute(
                "insert into agent_log (person_id, step, log) values (%s, %s, %s)",
                (person_id, step, Jsonb(qloo_log)),
            )
    return saved


def store_wishes(person_id, raw_wishes, qloo_log=None, step="wishes"):
    wishes = []
    for raw in raw_wishes or []:
        try:
            wishes.append(WishIn(**raw))
        except Exception:
            continue
    if not wishes:
        return []  # never delete earlier wishes when the engine returned none
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
        if qloo_log is not None:
            conn.execute(
                "insert into agent_log (person_id, step, log) values (%s, %s, %s)",
                (person_id, step, Jsonb(qloo_log)),
            )
    return saved


@router.post("/{person_id}/portrait/build")
def build_person_portrait(person_id: UUID, body: BuildIn):
    engine = load_engine()
    person, inputs = read_build_inputs(person_id, body)
    result = run_engine(engine.build_portrait, person, inputs) or {}
    items = result.get("items") or []
    qloo_log = result.get("qloo_log") or []
    saved = store_portrait(person_id, items, qloo_log)
    in_qloo = sum(1 for i in items if i.get("qloo_entity_id"))
    summary = (
        f"Gathered {len(items)} favourites. {in_qloo} found in Qloo, "
        f"{len(items) - in_qloo} kept and labelled."
    )
    return {"saved": saved, "items": items, "qloo_log": qloo_log, "summary": summary}


@router.post("/{person_id}/wishes/generate")
def generate_person_wishes(person_id: UUID):
    engine = load_engine()
    person, rows = read_portrait(person_id)
    if not rows:
        raise HTTPException(409, "Build the Taste Portrait before generating wishes")
    result = run_engine(engine.generate_wishes, rows, person, use_llm=polish_enabled()) or {}
    qloo_log = result.get("qloo_log") or []
    saved = store_wishes(person_id, result.get("wishes"), qloo_log)
    discovery = sum(1 for w in saved if w.get("kind") == "discovery")
    summary = (
        f"Wrote {len(saved)} wishes. {discovery} came from Qloo's taste graph and is labelled a guess."
        if saved else "No wishes were written this time."
    )
    return {"wishes": saved, "follow_up": result.get("follow_up"), "qloo_log": qloo_log, "summary": summary}


@router.post("/{person_id}/agent/run")
def run_whole_agent(person_id: UUID, body: BuildIn):
    """Portrait, wishes, and matching in one call, with the engine's real steps and timings."""
    engine = load_engine()
    started = time.monotonic()
    person, inputs = read_build_inputs(person_id, body)
    result = run_engine(engine.run_agent, person, inputs, timeout=AGENT_TIMEOUT) or {}

    store_portrait(person_id, result.get("items"))
    saved_wishes = store_wishes(person_id, result.get("wishes"))

    t = time.monotonic()
    matches = []
    if saved_wishes:
        with get_conn() as conn:
            person_row, portrait_rows, makers = load_context(conn, person_id)
            wish_rows = conn.execute(
                f"select {WISH_COLS} from wish where person_id = %s order by created_at",
                (person_id,),
            ).fetchall()
            matches = [match_one(conn, person_row, w, portrait_rows, makers, 5) for w in wish_rows]
    matching_ms = elapsed_ms(t)

    counts = {"qloo": 0, "text": 0, "type": 0}
    with_match = 0
    for m in matches:
        if m["matches"]:
            with_match += 1
        for x in m["matches"]:
            counts[x["basis"]] = counts.get(x["basis"], 0) + 1
    if matches:
        summary = (
            f"Looked for Wish Makers for {len(matches)} wishes and found someone for {with_match}. "
            f"{counts['qloo']} matches came through Qloo's taste graph, {counts['text']} by name, "
            f"and {counts['type']} by what the maker offers."
        )
    else:
        summary = "There were no wishes to match yet."
    steps = list(result.get("steps") or [])
    steps.append({
        "id": "match", "title": "Find Wish Makers", "summary": summary,
        "qloo_calls": None, "cached": None, "errors": 0,
    })

    timings = dict(result.get("timings") or {})
    timings["matching_ms"] = matching_ms
    timings["request_ms"] = elapsed_ms(started)
    qloo_log = result.get("qloo_log") or []
    with get_conn() as conn:
        require_person(conn, person_id)
        conn.execute(
            "insert into agent_log (person_id, step, log) values (%s, 'agent', %s)",
            (person_id, Jsonb({"steps": steps, "timings": timings, "qloo_log": qloo_log})),
        )
    return {
        "steps": steps,
        "timings": timings,
        "portrait": result.get("items") or [],
        "wishes": saved_wishes,
        "follow_up": result.get("follow_up"),
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