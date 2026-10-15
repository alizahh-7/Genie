from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from db import get_conn, require_person

router = APIRouter(prefix="/persons", tags=["wish requests"])

SAMPLE_NOTE = "This is a sample Wish Maker. In a live network, a real person would respond here."
MAX_OPEN_REQUESTS = 3


class RequestIn(BaseModel):
    maker_id: str = Field(min_length=1, max_length=40)
    message: str = Field(min_length=5, max_length=600)
    family_contact: Optional[str] = Field(default=None, max_length=120)


class FeedbackIn(BaseModel):
    completed: bool = True
    concern: bool = False
    note: Optional[str] = Field(default=None, max_length=500)


def require_wish(conn, person_id, wish_id):
    require_person(conn, person_id)
    row = conn.execute(
        "select id, mode from wish where id = %s and person_id = %s", (wish_id, person_id)
    ).fetchone()
    if not row:
        raise HTTPException(404, "Wish not found")
    return row


@router.post("/{person_id}/wishes/{wish_id}/requests")
def send_request(person_id: UUID, wish_id: UUID, body: RequestIn):
    with get_conn() as conn:
        wish = require_wish(conn, person_id, wish_id)
        maker = conn.execute(
            "select id, application_status, verification_status, remote_ok, is_sample "
            "from wish_maker where id = %s",
            (body.maker_id,),
        ).fetchone()
        if not maker or maker["application_status"] != "approved":
            raise HTTPException(404, "Maker not found")

        if not maker["is_sample"]:
            if wish["mode"] == "in-person" and maker["verification_status"] != "verified":
                raise HTTPException(400, "In-person wishes can only go to verified makers")
            if wish["mode"] == "remote" and not maker["remote_ok"]:
                raise HTTPException(400, "This maker does not offer remote wishes")

        open_count = conn.execute(
            "select count(*) as n from wish_match where wish_id = %s and status = 'requested'",
            (wish_id,),
        ).fetchone()["n"]
        if open_count >= MAX_OPEN_REQUESTS:
            raise HTTPException(429, f"Please wait for replies before sending more than {MAX_OPEN_REQUESTS} requests")

        existing = conn.execute(
            "select status from wish_match where wish_id = %s and maker_id = %s",
            (wish_id, body.maker_id),
        ).fetchone()
        if existing and existing["status"] == "declined":
            raise HTTPException(409, "This maker has declined this wish")
        if existing and existing["status"] not in ("suggested", "withdrawn"):
            raise HTTPException(409, "A request is already in progress")

        is_sample = maker["is_sample"]
        new_status = "accepted" if is_sample else "requested"
        note = SAMPLE_NOTE if is_sample else None
        if existing:
            conn.execute(
                """
                update wish_match
                set status = %s, request_message = %s, family_contact = %s, maker_note = %s,
                    requested_at = now(),
                    responded_at = case when %s then now() else null end
                where wish_id = %s and maker_id = %s
                """,
                (new_status, body.message, body.family_contact, note, is_sample, wish_id, body.maker_id),
            )
        else:
            conn.execute(
                """
                insert into wish_match
                  (wish_id, maker_id, status, request_message, family_contact,
                   maker_note, requested_at, responded_at)
                values (%s, %s, %s, %s, %s, %s, now(), case when %s then now() else null end)
                """,
                (wish_id, body.maker_id, new_status, body.message, body.family_contact, note, is_sample),
            )
    return {"status": new_status}


@router.get("/{person_id}/wishes/{wish_id}/requests")
def list_requests(person_id: UUID, wish_id: UUID):
    with get_conn() as conn:
        require_wish(conn, person_id, wish_id)
        rows = conn.execute(
            """
            select m.maker_id, m.status, m.score, m.request_message, m.maker_note,
                   m.requested_at, m.responded_at,
                   mk.name, mk.type, mk.city, mk.country, mk.is_sample, mk.verification_status,
                   case when m.status in ('accepted', 'done') then mk.contact_email end as maker_contact
            from wish_match m join wish_maker mk on mk.id = m.maker_id
            where m.wish_id = %s
            order by m.requested_at nulls last
            """,
            (wish_id,),
        ).fetchall()
    return rows


@router.post("/{person_id}/wishes/{wish_id}/requests/{maker_id}/withdraw")
def withdraw_request(person_id: UUID, wish_id: UUID, maker_id: str):
    with get_conn() as conn:
        require_wish(conn, person_id, wish_id)
        cur = conn.execute(
            "update wish_match set status = 'withdrawn' "
            "where wish_id = %s and maker_id = %s and status in ('requested', 'accepted')",
            (wish_id, maker_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(409, "Nothing to withdraw")
    return {"status": "withdrawn"}


@router.post("/{person_id}/wishes/{wish_id}/requests/{maker_id}/feedback")
def give_feedback(person_id: UUID, wish_id: UUID, maker_id: str, body: FeedbackIn):
    with get_conn() as conn:
        require_wish(conn, person_id, wish_id)
        row = conn.execute(
            "select status from wish_match where wish_id = %s and maker_id = %s",
            (wish_id, maker_id),
        ).fetchone()
        if not row or row["status"] not in ("accepted", "done"):
            raise HTTPException(409, "Feedback can be given after a request is accepted")
        new_status = "done" if body.completed else row["status"]
        conn.execute(
            "update wish_match set status = %s, concern_flagged = concern_flagged or %s, "
            "feedback_note = %s where wish_id = %s and maker_id = %s",
            (new_status, body.concern, body.note, wish_id, maker_id),
        )
        if body.concern:
            # Pause the maker right away. Samples are not affected.
            conn.execute(
                "update wish_maker set application_status = 'suspended', "
                "review_note = 'Suspended after a family concern. Needs review.' "
                "where id = %s and is_sample = false",
                (maker_id,),
            )
    return {"status": new_status, "concern_flagged": body.concern}