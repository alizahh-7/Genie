from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from db import get_conn
from notices import RETENTION_OPTIONS
from routers.admin import require_admin

owner = APIRouter(prefix="/persons", tags=["privacy"])
admin_router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


class RetentionIn(BaseModel):
    days: int

    @field_validator("days")
    @classmethod
    def allowed(cls, v):
        if v not in RETENTION_OPTIONS:
            raise ValueError(f"Choose one of {list(RETENTION_OPTIONS)} days")
        return v


@owner.patch("/{person_id}/retention")
def set_retention(person_id: UUID, body: RetentionIn):
    with get_conn() as conn:
        row = conn.execute(
            "update person set expires_at = now() + make_interval(days => %s) "
            "where id = %s and expires_at > now() returning id, expires_at",
            (body.days, person_id),
        ).fetchone()
    if not row:
        raise HTTPException(404, "Person not found")
    return row


@admin_router.post("/persons/{person_id}/pin")
def pin_person(person_id: UUID):
    """Keeps a demo persona alive for five years."""
    with get_conn() as conn:
        row = conn.execute(
            "update person set expires_at = now() + interval '5 years' "
            "where id = %s returning id, expires_at",
            (person_id,),
        ).fetchone()
    if not row:
        raise HTTPException(404, "Person not found")
    return row