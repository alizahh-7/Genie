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
    source_items: list[Any] = Field(default_factory=list)


@router.post("/{person_id}/wishes")
def create_wish(person_id: UUID, body: WishIn):
    with get_conn() as conn:
        require_person(conn, person_id)
        row = conn.execute(
            """
            insert into wish (person_id, title, description, mode, source_items)
            values (%s, %s, %s, %s, %s)
            returning *
            """,
            (person_id, body.title.strip(), body.description, body.mode, Jsonb(body.source_items)),
        ).fetchone()
    return row


@router.get("/{person_id}/wishes")
def list_wishes(person_id: UUID):
    with get_conn() as conn:
        require_person(conn, person_id)
        rows = conn.execute(
            "select * from wish where person_id = %s order by created_at", (person_id,)
        ).fetchall()
    return rows