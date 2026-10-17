import os
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from db import get_conn

router = APIRouter(prefix="/persons", tags=["persons"])

TTL_DAYS = int(os.environ.get("DEMO_TTL_DAYS", "7"))


class PersonIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=40)
    birth_year: Optional[int] = Field(default=None, ge=1900, le=2026)
    region: Optional[str] = Field(default=None, max_length=80)
    language: Optional[str] = Field(default=None, max_length=40)


@router.post("")
def create_person(body: PersonIn):
    with get_conn() as conn:
        row = conn.execute(
            """
            insert into person (first_name, birth_year, region, language, expires_at)
            values (%s, %s, %s, %s, now() + make_interval(days => %s))
            returning *
            """,
            (body.first_name.strip(), body.birth_year, body.region, body.language, TTL_DAYS),
        ).fetchone()
    return row


@router.get("/{person_id}")
def get_person(person_id: UUID):
    with get_conn() as conn:
        row = conn.execute(
            "select * from person where id = %s and expires_at > now()", (person_id,)
        ).fetchone()
    if not row:
        raise HTTPException(404, "Person not found")
    return row