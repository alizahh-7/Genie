from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field, field_validator

from db import get_conn
from util import clean_list, hash_token

router = APIRouter(prefix="/maker-portal", tags=["maker portal"])

OWN_COLS = (
    "id, name, type, bio, tags, city, country, languages, remote_ok, "
    "application_status, verification_status, review_note, applied_at, reviewed_at"
)


def load_maker(conn, token: str):
    row = conn.execute(
        f"select {OWN_COLS} from wish_maker where manage_token_hash = %s",
        (hash_token(token),),
    ).fetchone()
    if not row:
        raise HTTPException(404, "This link is not valid")
    return row


class PortalUpdate(BaseModel):
    bio: Optional[str] = Field(default=None, min_length=20, max_length=600)
    tags: Optional[list[str]] = None
    city: Optional[str] = Field(default=None, min_length=1, max_length=80)
    languages: Optional[list[str]] = None
    remote_ok: Optional[bool] = None
    paused: Optional[bool] = None

    @field_validator("tags")
    @classmethod
    def check_tags(cls, v):
        if v is None:
            return v
        out = clean_list(v, 12, 60, "tag")
        if not out:
            raise ValueError("Keep at least one tag")
        return out

    @field_validator("languages")
    @classmethod
    def check_languages(cls, v):
        return None if v is None else clean_list(v, 8, 30, "language")


class RespondIn(BaseModel):
    decision: Literal["accept", "decline"]
    note: Optional[str] = Field(default=None, max_length=500)


@router.get("/{token}")
def view_portal(token: str):
    with get_conn() as conn:
        maker = load_maker(conn, token)
        requests = conn.execute(
            """
            select m.wish_id, m.status, m.request_message, m.maker_note,
                   m.requested_at, m.responded_at,
                   case when m.status in ('accepted', 'done') then m.family_contact end as family_contact,
                   w.title, w.description, w.mode, p.first_name as person_first_name
            from wish_match m
            join wish w on w.id = m.wish_id
            join person p on p.id = w.person_id
            where m.maker_id = %s and m.status in ('requested', 'accepted', 'declined', 'done')
            order by m.requested_at desc nulls last
            """,
            (maker["id"],),
        ).fetchall()
    return {"profile": maker, "requests": requests}


@router.patch("/{token}")
def update_profile(token: str, body: PortalUpdate):
    with get_conn() as conn:
        maker = load_maker(conn, token)
        status = maker["application_status"]
        if status in ("rejected", "suspended"):
            raise HTTPException(403, "This profile cannot be edited. Please contact the Genie team.")

        sets, vals = [], []
        needs_review = False
        if body.bio is not None:
            sets.append("bio = %s"); vals.append(body.bio.strip()); needs_review = True
        if body.tags is not None:
            sets.append("tags = %s"); vals.append(Jsonb(body.tags)); needs_review = True
        if body.city is not None:
            sets.append("city = %s"); vals.append(body.city.strip()); needs_review = True
        if body.languages is not None:
            sets.append("languages = %s"); vals.append(Jsonb(body.languages))
        if body.remote_ok is not None:
            sets.append("remote_ok = %s"); vals.append(body.remote_ok)

        new_status = status
        if body.paused is not None and status in ("approved", "paused"):
            new_status = "paused" if body.paused else "approved"
        if needs_review and status in ("approved", "paused"):
            new_status = "pending"  # changes to bio, tags, or city need a fresh review
        if new_status != status:
            sets.append("application_status = %s"); vals.append(new_status)
            if new_status == "pending":
                sets.append("verification_status = 'pending'")

        if not sets:
            raise HTTPException(400, "Nothing to update")
        vals.append(maker["id"])
        conn.execute(f"update wish_maker set {', '.join(sets)} where id = %s", vals)
    return {"status": new_status}


@router.post("/{token}/requests/{wish_id}/respond")
def respond(token: str, wish_id: UUID, body: RespondIn):
    with get_conn() as conn:
        maker = load_maker(conn, token)
        if maker["application_status"] != "approved":
            raise HTTPException(403, "Your profile must be approved and active to respond")
        row = conn.execute(
            "select status from wish_match where wish_id = %s and maker_id = %s",
            (wish_id, maker["id"]),
        ).fetchone()
        if not row or row["status"] != "requested":
            raise HTTPException(409, "There is no open request for this wish")
        new_status = "accepted" if body.decision == "accept" else "declined"
        conn.execute(
            "update wish_match set status = %s, maker_note = %s, responded_at = now() "
            "where wish_id = %s and maker_id = %s",
            (new_status, body.note, wish_id, maker["id"]),
        )
    return {"status": new_status}


@router.delete("/{token}")
def withdraw(token: str):
    with get_conn() as conn:
        cur = conn.execute(
            "delete from wish_maker where manage_token_hash = %s and is_sample = false",
            (hash_token(token),),
        )
        deleted = cur.rowcount
    if deleted == 0:
        raise HTTPException(404, "This link is not valid")
    return {"deleted": True}