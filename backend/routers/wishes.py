from typing import Any, Literal, Optional
from uuid import UUID

from fastapi import APIRouter
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field

from db import get_conn, require_person

router = APIRouter(prefix="/persons", tags=["wishes"])


class WishIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    mode: Literal["in-person", "remote"] = "remote"
    source_items: list[Any] = Field(default_factory=list, max_length=30)
    kind: Optional[str] = Field(default=None, max_length=30)
    maker_type: Optional[str] = Field(default=None, max_length=30)
    tags: list[Any] = Field(default_factory=list, max_length=60)
    basis: Optional[str] = Field(default=None, max_length=20)
    why: Optional[str] = Field(default=None, max_length=600)
    affinity: Optional[float] = Field(default=None, ge=0, le=1)
    # The item a discovery wish points at. The engine may send it. If it does not, it is read
    # from the "why" sentence, which always has the form "... with <item> (match score ...)".
    discovered: Optional[str] = Field(default=None, max_length=200)


def discovered_from_why(why) -> Optional[str]:
    if not why or " with " not in why or " (match score" not in why:
        return None
    head = why.split(" (match score")[0]
    name = head.rsplit(" with ", 1)[-1].strip()
    return name[:200] or None


def insert_wish(conn, person_id, body: WishIn):
    discovered = body.discovered
    if not discovered and body.kind == "discovery":
        discovered = discovered_from_why(body.why)
    return conn.execute(
        """
        insert into wish
          (person_id, title, description, mode, source_items,
           kind, maker_type, tags, basis, why, affinity, discovered, created_at)
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, clock_timestamp())
        returning *
        """,
        (
            person_id, body.title.strip(), body.description, body.mode,
            Jsonb(body.source_items), body.kind, body.maker_type, Jsonb(body.tags),
            body.basis, body.why, body.affinity, discovered,
        ),
    ).fetchone()


@router.post("/{person_id}/wishes")
def create_wish(person_id: UUID, body: WishIn):
    with get_conn() as conn:
        require_person(conn, person_id)
        return insert_wish(conn, person_id, body)


@router.get("/{person_id}/wishes")
def list_wishes(person_id: UUID):
    with get_conn() as conn:
        require_person(conn, person_id)
        rows = conn.execute(
            "select * from wish where person_id = %s order by created_at", (person_id,)
        ).fetchall()
    return rows