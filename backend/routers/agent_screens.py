from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field

from db import get_conn, require_person
from routers.agent import load_engine, person_dict, read_portrait, run_engine, store_portrait

router = APIRouter(prefix="/persons", tags=["agent screens"])

COMPARE_TIMEOUT = 70


class CardsIn(BaseModel):
    tried: list[str] = Field(default_factory=list, max_length=60)
    n: int = Field(default=4, ge=1, le=5)


class ReactionIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    domain: Optional[Literal["music", "food", "place", "film", "other"]] = None
    reaction: Literal["lit_up", "no_reaction"]


class ApplyIn(BaseModel):
    reactions: list[ReactionIn] = Field(min_length=1, max_length=10)
    tried: list[str] = Field(default_factory=list, max_length=60)


@router.post("/{person_id}/reaction/cards")
def reaction_cards(person_id: UUID, body: CardsIn):
    engine = load_engine()
    _, rows = read_portrait(person_id)
    if not rows:
        raise HTTPException(409, "Build the Taste Portrait first")
    return run_engine(engine.pick_reaction_cards, rows, body.tried, body.n) or {
        "cards": [], "remaining": 0, "done": True,
    }


@router.post("/{person_id}/reaction/apply")
def reaction_apply(person_id: UUID, body: ApplyIn):
    engine = load_engine()
    person, rows = read_portrait(person_id)
    if not rows:
        raise HTTPException(409, "Build the Taste Portrait first")
    reactions = [r.model_dump(exclude_none=True) for r in body.reactions]
    result = run_engine(engine.apply_reactions, person, rows, reactions, body.tried) or {}
    saved = store_portrait(
        person_id, result.get("items"), result.get("qloo_log") or [], "reaction", allow_empty=True
    )
    return {
        "saved": saved,
        "added": result.get("added") or [],
        "removed": result.get("removed") or [],
        "tried": result.get("tried") or body.tried,
        "message": result.get("message"),
        "next": result.get("next"),
        "qloo_log": result.get("qloo_log") or [],
    }


@router.post("/{person_id}/compare")
def compare_with_general_ai(person_id: UUID):
    engine = load_engine()
    with get_conn() as conn:
        require_person(conn, person_id)
        person = person_dict(conn, person_id)
        told = conn.execute(
            "select domain, name from portrait_item "
            "where person_id = %s and source_label in ('told', 'reacted') order by created_at, name",
            (person_id,),
        ).fetchall()
        circle = conn.execute(
            "select contributor_first_name, answers from circle_response "
            "where person_id = %s order by created_at",
            (person_id,),
        ).fetchall()
    if not told and not circle:
        raise HTTPException(409, "Add some favorites before comparing")
    inputs = {
        "quick_facts": [{"domain": r["domain"], "name": r["name"]} for r in told],
        "circle_answers": [
            {"contributor": c["contributor_first_name"], "answers": c["answers"]} for c in circle
        ],
    }
    result = run_engine(engine.side_by_side, person, inputs, timeout=COMPARE_TIMEOUT) or {}
    with get_conn() as conn:
        require_person(conn, person_id)
        conn.execute(
            "insert into agent_log (person_id, step, log) values (%s, 'compare', %s)",
            (person_id, Jsonb(result)),
        )
    return result


@router.get("/{person_id}/compare")
def last_comparison(person_id: UUID):
    with get_conn() as conn:
        require_person(conn, person_id)
        row = conn.execute(
            "select log from agent_log where person_id = %s and step = 'compare' "
            "order by created_at desc limit 1",
            (person_id,),
        ).fetchone()
    if not row:
        raise HTTPException(404, "No comparison has been run yet")
    return row["log"]


@router.get("/{person_id}/bedside-kit")
def bedside_kit(person_id: UUID):
    engine = load_engine()
    person, rows = read_portrait(person_id)
    return run_engine(engine.generate_bedside_kit, person, rows, timeout=15) or {}