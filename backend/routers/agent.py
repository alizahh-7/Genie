"""POST /agent/run: stateless. Runs the Genie engine for one person and returns portrait items, wishes,
visible steps, the Qloo call log and timings. Nothing is stored. Written by Umaima (engine owner)."""
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from engine import run_agent, pick_reaction_cards, apply_reactions
from engine import run_agent

router = APIRouter(tags=["agent"])


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


@router.post("/agent/run")
def agent_run(body: AgentIn):
    if len(body.quick_facts) > 20 or len(body.circle_answers) > 25:
        raise HTTPException(status_code=422, detail="Too many items. Send up to 20 favourites and 25 circle answers.")
    person = {"first_name": body.person.first_name.strip(), "birth_year": body.person.birth_year,
              "region": body.person.region.strip(), "language": body.person.language.strip()}
    inputs = {
        "quick_facts": [{"domain": f.domain, "name": f.name.strip(), "hint": f.hint} for f in body.quick_facts],
        "circle_answers": [{"contributor": c.contributor,
                            "answers": {str(k)[:40]: str(v)[:500] for k, v in list(c.answers.items())[:8]}}
                           for c in body.circle_answers],
    }
    # a plain `def` endpoint runs in FastAPI's thread pool, so the engine never blocks the server
    return run_agent(person, inputs)

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
    person = {"first_name": body.person.first_name.strip(), "birth_year": body.person.birth_year,
              "region": body.person.region.strip(), "language": body.person.language.strip()}
    return apply_reactions(person, [_dump(i) for i in body.items], [_dump(r) for r in body.reactions],
                           [t[:80] for t in body.tried])