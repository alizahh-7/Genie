import os
import secrets
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException
from psycopg.types.json import Jsonb
from pydantic import BaseModel, EmailStr, Field, field_validator

from db import get_conn
from mailer import (
    admin_new_application_text,
    application_text,
    frontend_url,
    mail_enabled,
    recovery_text,
    send_email,
)
from util import clean_list, hash_token, new_token

router = APIRouter(prefix="/makers", tags=["makers"])

# Public columns only. Never expose contact_email or manage_token_hash.
PUBLIC_COLS = (
    "id, name, type, bio, tags, qloo_entity_ids, city, country, languages, "
    "remote_ok, is_sample, verification_status"
)

TERMS = {
    "conduct": [
        "I am 18 or older.",
        "I will only offer what I can truly do, and I will be honest about it.",
        "I will treat the person and their family with dignity and respect, and I will never ask for money, gifts, or personal details.",
        "I will keep private anything I learn about the person or their family, and use it only for the wish.",
        "I understand Genie is not a medical service, and I will not give medical advice.",
        "I understand I can decline, pause, or withdraw at any time.",
    ],
    "what_is_public": "Your display name, what you offer, your short bio, tags, city, country, and languages are shown to families.",
    "what_is_private": "Your email is never shown publicly. It is shared with a family only after you accept their request, and the Genie team may use it to contact you for a reference check.",
}


class MakerApplication(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    type: Literal["musician", "home cook", "cafe", "storyteller", "volunteer", "other"]
    bio: str = Field(min_length=20, max_length=600)
    tags: list[str]
    city: str = Field(min_length=1, max_length=80)
    country: str = Field(min_length=2, max_length=80)
    languages: list[str] = Field(default_factory=list)
    remote_ok: bool = True
    contact_email: EmailStr
    conduct_accepted: bool
    listing_consent: bool
    website: str = ""  # honeypot: hidden field, real people leave it empty

    @field_validator("tags")
    @classmethod
    def check_tags(cls, v):
        out = clean_list(v, 12, 60, "tag")
        if not out:
            raise ValueError("Add at least one tag, such as an artist, a dish, or a style")
        return out

    @field_validator("languages")
    @classmethod
    def check_languages(cls, v):
        return clean_list(v, 8, 30, "language")


class RecoverIn(BaseModel):
    contact_email: EmailStr


@router.get("/apply/terms")
def apply_terms():
    return TERMS


@router.post("/apply")
def apply(body: MakerApplication, background: BackgroundTasks):
    if body.website.strip():
        # A bot filled the hidden field. Pretend success, store nothing.
        return {"maker_id": "pending", "manage_token": new_token(), "status": "pending"}
    if not (body.conduct_accepted and body.listing_consent):
        raise HTTPException(400, "Please accept the code of conduct and the listing consent")

    email = body.contact_email.lower()
    name = body.name.strip()
    with get_conn() as conn:
        recent = conn.execute(
            "select count(*) as n from wish_maker "
            "where lower(contact_email) = %s and applied_at > now() - interval '1 day'",
            (email,),
        ).fetchone()["n"]
        if recent >= 3:
            raise HTTPException(429, "Too many applications from this email today")
        pending = conn.execute(
            "select count(*) as n from wish_maker where application_status = 'pending'"
        ).fetchone()["n"]
        if pending >= 300:
            raise HTTPException(503, "Applications are paused while we review the queue")

        maker_id = "mk_" + secrets.token_hex(6)
        token = new_token()
        conn.execute(
            """
            insert into wish_maker
              (id, name, type, bio, tags, city, country, languages, remote_ok,
               is_sample, verification_status, application_status, contact_email,
               manage_token_hash, conduct_accepted_at, listing_consent_at, applied_at)
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s,
                    false, 'pending', 'pending', %s, %s, now(), now(), now())
            """,
            (
                maker_id, name, body.type, body.bio.strip(),
                Jsonb(body.tags), body.city.strip(), body.country.strip(),
                Jsonb(body.languages), body.remote_ok, email, hash_token(token),
            ),
        )

    link = f"{frontend_url()}/maker/{token}"
    background.add_task(
        send_email, email, "Your Genie Wish Maker application", application_text(name, link)
    )
    admin_email = os.environ.get("ADMIN_EMAIL")
    if admin_email:
        background.add_task(
            send_email, admin_email, "New Wish Maker application",
            admin_new_application_text(name, maker_id),
        )
    return {
        "maker_id": maker_id,
        "manage_token": token,
        "status": "pending",
        "message": "Thank you. Save your private link now. It is shown only once and is how you manage your profile.",
    }


@router.post("/recover")
def recover_link(body: RecoverIn, background: BackgroundTasks):
    generic = {"message": "If this email has a Wish Maker profile, a new private link has been sent."}
    if not mail_enabled():
        # Never replace a link when we cannot deliver the new one.
        return generic
    email = body.contact_email.lower()
    links = []
    with get_conn() as conn:
        rows = conn.execute(
            "select id, name from wish_maker "
            "where lower(contact_email) = %s and is_sample = false "
            "and (last_recovery_at is null or last_recovery_at < now() - interval '10 minutes')",
            (email,),
        ).fetchall()
        for r in rows:
            token = new_token()
            conn.execute(
                "update wish_maker set manage_token_hash = %s, last_recovery_at = now() where id = %s",
                (hash_token(token), r["id"]),
            )
            links.append((r["name"], f"{frontend_url()}/maker/{token}"))
    if links:
        background.add_task(send_email, email, "Your new Genie private link", recovery_text(links))
    return generic


@router.get("")
def list_makers(remote_only: bool = False, include_samples: bool = True):
    sql = f"select {PUBLIC_COLS} from wish_maker where application_status = 'approved'"
    if remote_only:
        sql += " and remote_ok = true"
    if not include_samples:
        sql += " and is_sample = false"
    sql += " order by is_sample, id"
    with get_conn() as conn:
        return conn.execute(sql).fetchall()


@router.get("/{maker_id}")
def get_maker(maker_id: str):
    with get_conn() as conn:
        row = conn.execute(
            f"select {PUBLIC_COLS} from wish_maker where id = %s and application_status = 'approved'",
            (maker_id,),
        ).fetchone()
    if not row:
        raise HTTPException(404, "Maker not found")
    return row