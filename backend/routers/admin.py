import os
import secrets
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from db import get_conn
from mailer import review_text, send_email


def require_admin(x_admin_token: str = Header(default="")):
    expected = os.environ.get("ADMIN_TOKEN", "")
    if not expected:
        raise HTTPException(503, "Admin access is not configured")
    if not secrets.compare_digest(x_admin_token.encode(), expected.encode()):
        raise HTTPException(401, "Not allowed")


router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])

ADMIN_COLS = (
    "id, name, type, bio, tags, city, country, languages, remote_ok, contact_email, "
    "application_status, verification_status, review_note, applied_at, reviewed_at, "
    "conduct_accepted_at, listing_consent_at"
)


class ReviewIn(BaseModel):
    decision: Literal["approve", "reject", "suspend"]
    reference_checked: bool = False
    note: Optional[str] = Field(default=None, max_length=500)


@router.get("/makers")
def list_applications(status: str = "pending"):
    with get_conn() as conn:
        return conn.execute(
            f"select {ADMIN_COLS} from wish_maker "
            "where is_sample = false and application_status = %s order by applied_at",
            (status,),
        ).fetchall()


@router.post("/makers/{maker_id}/review")
def review(maker_id: str, body: ReviewIn, background: BackgroundTasks):
    if body.decision == "approve":
        app_status = "approved"
        ver_status = "verified" if body.reference_checked else "reviewed"
    elif body.decision == "reject":
        app_status, ver_status = "rejected", "rejected"
    else:
        app_status, ver_status = "suspended", None
    with get_conn() as conn:
        row = conn.execute(
            "select is_sample, verification_status, contact_email, name "
            "from wish_maker where id = %s",
            (maker_id,),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Maker not found")
        if row["is_sample"]:
            raise HTTPException(400, "Sample makers cannot be reviewed")
        conn.execute(
            "update wish_maker set application_status = %s, verification_status = %s, "
            "review_note = %s, reviewed_at = now() where id = %s",
            (app_status, ver_status or row["verification_status"], body.note, maker_id),
        )
    if row["contact_email"]:
        background.add_task(
            send_email, row["contact_email"], "An update on your Genie profile",
            review_text(row["name"], body.decision),
        )
    return {"application_status": app_status, "verification_status": ver_status}


@router.get("/concerns")
def list_concerns():
    with get_conn() as conn:
        return conn.execute(
            """
            select m.wish_id, m.maker_id, mk.name as maker_name, mk.application_status,
                   m.feedback_note, m.responded_at
            from wish_match m join wish_maker mk on mk.id = m.maker_id
            where m.concern_flagged = true
            order by m.responded_at desc nulls last
            """
        ).fetchall()