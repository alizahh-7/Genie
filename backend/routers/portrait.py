from typing import Any, Literal, Optional
from uuid import UUID

from fastapi import APIRouter
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field

from db import get_conn, require_person

router = APIRouter(prefix="/persons", tags=["portrait"])


class PortraitItemIn(BaseModel):
    domain: Literal["music", "food", "place", "film", "other"]
    name: str = Field(min_length=1, max_length=200)
    qloo_entity_id: Optional[str] = Field(default=None, max_length=200)
    tags: list[dict[str, Any]] = Field(default_factory=list)
    source_label: Literal["told", "likely", "reacted", "ai-only"] = "told"
    confidence: Optional[float] = Field(default=None, ge=0, le=1)
    resolution_level: Optional[int] = Field(default=None, ge=1, le=6)


class PortraitIn(BaseModel):
    items: list[PortraitItemIn] = Field(max_length=60)


@router.post("/{person_id}/portrait")
def save_portrait(person_id: UUID, body: PortraitIn):
    rows = [
        (
            person_id,
            i.domain,
            i.name.strip(),
            i.qloo_entity_id,
            Jsonb(i.tags),
            i.source_label,
            i.confidence,
            i.resolution_level,
        )
        for i in body.items
    ]
    with get_conn() as conn:
        require_person(conn, person_id)
        conn.execute("delete from portrait_item where person_id = %s", (person_id,))
        if rows:
            with conn.cursor() as cur:
                cur.executemany(
                    """
                    insert into portrait_item
                      (person_id, domain, name, qloo_entity_id, qloo_tags,
                       source_label, confidence, resolution_level)
                    values (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    rows,
                )
    return {"saved": len(rows)}


@router.get("/{person_id}/portrait")
def get_portrait(person_id: UUID):
    with get_conn() as conn:
        require_person(conn, person_id)
        rows = conn.execute(
            """
            select id, domain, name, qloo_entity_id, qloo_tags as tags,
                   source_label, confidence, resolution_level
            from portrait_item where person_id = %s order by created_at, name
            """,
            (person_id,),
        ).fetchall()
    return {"items": rows}