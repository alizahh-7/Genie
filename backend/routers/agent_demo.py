"""Stateless routes: POST /agent/run, /agent/reaction-cards, /agent/reactions. Nothing is stored.
Powers the 'try it yourself' demo and Reaction Mode. Written by Umaima (engine owner)."""
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from engine import run_agent, pick_reaction_cards, apply_reactions, side_by_side, generate_bedside_kit

router = APIRouter(tags=["agent-demo"])


class PersonIn(BaseModel):
    first_name: str = Field("", max_length=40)
    birth_year: Optional[int] = Field(None, ge=1900, le=2026)
    region: str = Field("", max_length=80)
    language: str = Field("", max_length=40)


class FactIn(BaseModel):
    domain: Literal["music", "food", "place", "film", "other"]
    name: str = Field(..., min_length=1, max_length=80)
    hint: Optional[str] = Field(None, max_length=80)


class CircleIn(BaseModel):
    contributor: str = Field("", max_length=40)
    answers: Dict[str, str] = Field(default_factory=dict)


class AgentIn(BaseModel):
    person: PersonIn
    quick_facts: List[FactIn] = Field(default_factory=list)
    circle_answers: List[CircleIn] = Field(default_factory=list)


def _person(p):
    return {"first_name": p.first_name.strip(), "birth_year": p.birth_year,
            "region": p.region.strip(), "language": p.language.strip()}


@router.post("/agent/run")
def agent_run(body: AgentIn):
    if len(body.quick_facts) > 20 or len(body.circle_answers) > 25:
        raise HTTPException(status_code=422, detail="Too many items. Send up to 20 favourites and 25 circle answers.")
    inputs = {
        "quick_facts": [{"domain": f.domain, "name": f.name.strip(), "hint": f.hint} for f in body.quick_facts],
        "circle_answers": [{"contributor": c.contributor,
                            "answers": {str(k)[:40]: str(v)[:500] for k, v in list(c.answers.items())[:8]}}
                           for c in body.circle_answers],
    }
    # a plain `def` endpoint runs in FastAPI's thread pool, so the engine never blocks the server
    return run_agent(_person(body.person), inputs)


class ItemIn(BaseModel):
    domain: str = Field(..., max_length=20)
    name: str = Field(..., min_length=1, max_length=80)
    qloo_entity_id: Optional[str] = Field(None, max_length=80)
    tags: List[dict] = Field(default_factory=list)
    source_label: Literal["told", "likely", "reacted", "ai-only"]
    confidence: float = Field(0.5, ge=0, le=1)
    resolution_level: int = Field(6, ge=1, le=6)
    matched_name: Optional[str] = Field(None, max_length=80)


class ReactionIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    domain: Optional[str] = Field(None, max_length=20)
    reaction: Literal["lit_up", "no_reaction"]


class CardsIn(BaseModel):
    items: List[ItemIn]
    tried: List[str] = Field(default_factory=list)
    n: int = Field(4, ge=1, le=5)


class ReactionsIn(BaseModel):
    person: PersonIn
    items: List[ItemIn]
    reactions: List[ReactionIn]
    tried: List[str] = Field(default_factory=list)


def _dump(m):
    return m.model_dump() if hasattr(m, "model_dump") else m.dict()


def _limits(items, tried, reactions=()):
    if len(items) > 60 or len(tried) > 60 or len(reactions) > 10 or any(len(i.tags) > 40 for i in items):
        raise HTTPException(status_code=422, detail="Too many items.")


@router.post("/agent/reaction-cards")
def reaction_cards(body: CardsIn):
    """Which items to show next in Reaction Mode. Stateless: the caller sends the portrait and what was tried."""
    _limits(body.items, body.tried)
    return pick_reaction_cards([_dump(i) for i in body.items], [t[:80] for t in body.tried], body.n)


@router.post("/agent/reactions")
def reactions_apply(body: ReactionsIn):
    """Apply 'lit_up' / 'no_reaction' taps. Returns the updated portrait, the next cards and a kind message."""
    _limits(body.items, body.tried, body.reactions)
    return apply_reactions(_person(body.person), [_dump(i) for i in body.items], [_dump(r) for r in body.reactions],
                           [t[:80] for t in body.tried])
    
def _prepare(body: AgentIn):
    if len(body.quick_facts) > 20 or len(body.circle_answers) > 25:
        raise HTTPException(status_code=422, detail="Too many items. Send up to 20 favourites and 25 circle answers.")
    inputs = {
        "quick_facts": [{"domain": f.domain, "name": f.name.strip(), "hint": f.hint} for f in body.quick_facts],
        "circle_answers": [{"contributor": c.contributor,
                            "answers": {str(k)[:40]: str(v)[:500] for k, v in list(c.answers.items())[:8]}}
                           for c in body.circle_answers],
    }
    return _person(body.person), inputs


@router.post("/agent/compare")
def agent_compare(body: AgentIn):
    """The side-by-side screen: a general AI's wishes next to Genie's, from the same facts, with the evidence."""
    person, inputs = _prepare(body)
    return side_by_side(person, inputs)


class KitIn(BaseModel):
    person: PersonIn
    items: List[ItemIn]


@router.post("/agent/bedside-kit")
def bedside_kit(body: KitIn):
    """The Bedside Kit for in-room wishes: playlist, small changes to the room, what visitors can do."""
    _limits(body.items, [])
    return generate_bedside_kit(_person(body.person), [_dump(i) for i in body.items])