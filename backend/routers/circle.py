import secrets
from typing import Dict
from uuid import UUID

from fastapi import APIRouter, HTTPException
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field, field_validator

from db import get_conn, require_person

CONSENT_NOTE = (
    "Your answers will be seen by the family who invited you. They may appear in a "
    "keepsake book the family can print or share. The names in them (songs, dishes, "
    "places, films) are checked against Qloo, a taste database, and an AI service "
    "helps read what you type. Free AI services may use what they receive to improve "
    "their models, so please leave out surnames, contact details and health details. "
    "You can skip any question."
)

QUESTIONS = [
    {"key": "music", "text": "What song or kind of music did they love?"},
    {"key": "food", "text": "Is there a dish or a taste that reminds you of them?"},
    {"key": "place", "text": "Is there a place they loved, or often spoke about?"},
    {"key": "film", "text": "Was there a film, show, or story they enjoyed?"},
    {"key": "joy", "text": "What small thing made them light up?"},
]
ALLOWED_KEYS = {q["key"] for q in QUESTIONS}
MAX_RESPONSES_PER_LINK = 25

public = APIRouter(prefix="/circle", tags=["circle"])
owner = APIRouter(prefix="/persons", tags=["circle"])


class CircleResponseIn(BaseModel):
    contributor_first_name: str = Field(min_length=1, max_length=40)
    answers: Dict[str, str]
    consent_given: bool

    @field_validator("answers")
    @classmethod
    def clean_answers(cls, v):
        cleaned = {}
        for key, value in v.items():
            if key not in ALLOWED_KEYS:
                raise ValueError(f"Unknown question: {key}")
            value = value.strip()
            if len(value) > 500:
                raise ValueError("Each answer must be under 500 characters")
            if value:
                cleaned[key] = value
        if not cleaned:
            raise ValueError("Please answer at least one question")
        return cleaned


@owner.post("/{person_id}/circle")
def create_invite(person_id: UUID):
    token = secrets.token_urlsafe(32)
    with get_conn() as conn:
        require_person(conn, person_id)
        conn.execute(
            "insert into circle_invite (token, person_id) values (%s, %s)",
            (token, person_id),
        )
    return {"token": token, "path": f"/circle/{token}"}


@owner.get("/{person_id}/circle-responses")
def list_responses(person_id: UUID):
    with get_conn() as conn:
        require_person(conn, person_id)
        rows = conn.execute(
            """
            select id, contributor_first_name, answers, created_at
            from circle_response where person_id = %s order by created_at
            """,
            (person_id,),
        ).fetchall()
    return rows


@public.get("/{token}")
def open_circle(token: str):
    with get_conn() as conn:
        row = conn.execute(
            """
            select p.first_name
            from circle_invite i join person p on p.id = i.person_id
            where i.token = %s and p.expires_at > now()
            """,
            (token,),
        ).fetchone()
    if not row:
        raise HTTPException(404, "This link is not valid")
    return {
        "first_name": row["first_name"],
        "consent_note": CONSENT_NOTE,
        "questions": QUESTIONS,
    }


@public.post("/{token}/responses")
def send_response(token: str, body: CircleResponseIn):
    if not body.consent_given:
        raise HTTPException(400, "Consent is needed before answers can be sent")
    with get_conn() as conn:
        invite = conn.execute(
            "select i.person_id from circle_invite i join person p on p.id = i.person_id "
            "where i.token = %s and p.expires_at > now()",
            (token,),
        ).fetchone()
        if not invite:
            raise HTTPException(404, "This link is not valid")
        count = conn.execute(
            "select count(*) as n from circle_response where token = %s", (token,)
        ).fetchone()["n"]
        if count >= MAX_RESPONSES_PER_LINK:
            raise HTTPException(429, "This link has received the maximum number of answers")
        conn.execute(
            """
            insert into circle_response
              (token, person_id, contributor_first_name, answers, consent_given)
            values (%s, %s, %s, %s, true)
            """,
            (token, invite["person_id"], body.contributor_first_name.strip(), Jsonb(body.answers)),
        )
    return {"saved": True}