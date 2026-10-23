import os
import re
import secrets
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field

import org_mail
from db import get_conn
from routers.admin import require_admin
from util import hash_token, new_token

# People opened by an organisation are kept longer than a family demo, because a care
# team needs the story for the whole stay.
ORG_CASE_TTL_DAYS = int(os.environ.get("ORG_CASE_TTL_DAYS", "90"))

portal = APIRouter(prefix="/org-portal", tags=["organisation portal"])
admin_router = APIRouter(prefix="/admin", tags=["organisations"], dependencies=[Depends(require_admin)])

Kind = Literal["hospice", "hospital", "care home", "charity"]
_LONG_NUMBER = re.compile(r"\d{5,}")
_EMAIL = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class OrgIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    kind: Kind = "hospice"
    city: Optional[str] = Field(default=None, max_length=80)
    country: Optional[str] = Field(default=None, max_length=80)
    is_sample: bool = False
    coordinator_name: str = Field(min_length=1, max_length=60)


class ApplyIn(BaseModel):
    org_name: str = Field(min_length=2, max_length=120)
    kind: Kind = "hospice"
    city: Optional[str] = Field(default=None, max_length=80)
    country: Optional[str] = Field(default=None, max_length=80)
    contact_name: str = Field(min_length=1, max_length=80)
    contact_email: str = Field(min_length=5, max_length=160, pattern=_EMAIL)
    message: Optional[str] = Field(default=None, max_length=1000)


class AttachIn(BaseModel):
    person_id: UUID
    reference: Optional[str] = Field(default=None, max_length=60)


class CaseIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=40)
    birth_year: Optional[int] = Field(default=None, ge=1900, le=2026)
    region: Optional[str] = Field(default=None, max_length=80)
    language: Optional[str] = Field(default=None, max_length=40)
    # The organisation's own label. Never a medical record number.
    reference: Optional[str] = Field(default=None, max_length=60)
    # The organisation confirms that the person, or their family or guardian, agreed.
    consent_confirmed: bool
    consent_by: Literal["the person", "their family or guardian"]


class CasePatch(BaseModel):
    status: Optional[Literal["open", "paused", "closed"]] = None
    reference: Optional[str] = Field(default=None, max_length=60)


class MemberIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=60)
    role: Literal["coordinator", "volunteer", "viewer"]
    # Optional. If given, the private link is emailed to this address. It is never stored.
    email: Optional[str] = Field(default=None, max_length=160, pattern=_EMAIL)


def _id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(6)}"


def clean_reference(ref: Optional[str]) -> Optional[str]:
    """A simple label such as 'Story A'. Long numbers look like record numbers, so they are refused."""
    if ref is None:
        return None
    ref = ref.strip()
    if not ref:
        return None
    if _LONG_NUMBER.search(re.sub(r"[\s\-]", "", ref)):
        raise HTTPException(422, "Use a simple label like 'Story A'. Please do not use a medical record number.")
    return ref


def get_member(conn, token: str) -> dict:
    row = conn.execute(
        """
        select m.id as member_id, m.display_name, m.role, m.org_id,
               o.name as org_name, o.kind, o.city, o.country, o.is_sample
        from org_member m join organisation o on o.id = m.org_id
        where m.token_hash = %s and m.revoked_at is null
        """,
        (hash_token(token),),
    ).fetchone()
    if not row:
        raise HTTPException(404, "This link is not valid")
    return row


def need(member: dict, *roles: str) -> None:
    if member["role"] not in roles:
        raise HTTPException(403, "Your role cannot do this")


def audit(conn, member: dict, action: str, target: Optional[str] = None) -> None:
    conn.execute(
        "insert into org_audit (org_id, member_id, action, target) values (%s, %s, %s, %s)",
        (member["org_id"], member["member_id"], action, target),
    )


def require_case(conn, org_id: str, case_key: str) -> dict:
    row = conn.execute(
        """
        select c.person_id, c.case_key, c.reference, c.status, c.created_at,
               c.consent_confirmed_at, c.consent_by,
               p.first_name, p.birth_year, p.region, p.language, p.expires_at
        from org_case c join person p on p.id = c.person_id
        where c.org_id = %s and c.case_key = %s and p.expires_at > now()
        """,
        (org_id, case_key),
    ).fetchone()
    if not row:
        raise HTTPException(404, "Case not found")
    return row


def next_step(s: dict) -> str:
    if s["concerns"]:
        return "Review a concern"
    if s["requested"]:
        return "Waiting for a Wish Maker to reply"
    if s["accepted"]:
        return "A wish is agreed. Help it happen"
    if not s["wishes"]:
        return "Gather their story"
    return "Choose a wish and ask a Wish Maker"


def _num(v):
    return None if v is None else float(v)


def _org_view(member: dict) -> dict:
    return {
        "id": member["org_id"], "name": member["org_name"], "kind": member["kind"],
        "city": member["city"], "country": member["country"], "is_sample": member["is_sample"],
    }


def _make_org(conn, name, kind, city, country, is_sample, coordinator_name) -> dict:
    org_id, member_id, token = _id("org"), _id("mem"), new_token()
    conn.execute(
        "insert into organisation (id, name, kind, city, country, is_sample) "
        "values (%s, %s, %s, %s, %s, %s)",
        (org_id, name.strip(), kind, city, country, is_sample),
    )
    conn.execute(
        "insert into org_member (id, org_id, display_name, role, token_hash) "
        "values (%s, %s, %s, 'coordinator', %s)",
        (member_id, org_id, coordinator_name.strip(), hash_token(token)),
    )
    return {
        "org_id": org_id, "member_id": member_id, "role": "coordinator",
        "manage_token": token, "path": f"/org/{token}",
        "message": "Save this private link now. It is shown only once.",
    }


# ---------------------------------------------------------------- apply (public)

@portal.post("/apply")
def apply(body: ApplyIn, background: BackgroundTasks):
    """An organisation asks to join. Nothing is created until an admin approves it."""
    with get_conn() as conn:
        recent = conn.execute(
            "select count(*) as n from org_application "
            "where lower(contact_email) = lower(%s) and created_at > now() - interval '1 day'",
            (body.contact_email,),
        ).fetchone()["n"]
        if recent >= 3:
            raise HTTPException(429, "We already have your application. We will be in touch.")
        conn.execute(
            """
            insert into org_application
              (id, org_name, kind, city, country, contact_name, contact_email, message)
            values (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (_id("app"), body.org_name.strip(), body.kind, body.city, body.country,
             body.contact_name.strip(), body.contact_email.strip(), body.message),
        )
    # Sent after the reply, so a slow mail service never slows the form.
    background.add_task(
        org_mail.send_application_received,
        body.contact_email.strip(), body.contact_name.strip(), body.org_name.strip(),
    )
    background.add_task(
        org_mail.send_application_alert,
        body.org_name.strip(), body.kind, body.city or "", body.country or "",
        body.contact_name.strip(), body.contact_email.strip(), body.message or "",
    )
    return {"received": True, "message": "Thank you. A member of the Genie team will contact you."}


# ---------------------------------------------------------------- admin

@admin_router.post("/orgs")
def create_org(body: OrgIn):
    """Creates an organisation and its first coordinator. The private link is shown once."""
    with get_conn() as conn:
        return _make_org(conn, body.name, body.kind, body.city, body.country,
                         body.is_sample, body.coordinator_name)


@admin_router.get("/org-applications")
def list_applications(status: Literal["pending", "approved", "rejected"] = "pending"):
    with get_conn() as conn:
        return conn.execute(
            "select id, org_name, kind, city, country, contact_name, contact_email, message, "
            "status, org_id, created_at, reviewed_at from org_application "
            "where status = %s order by created_at",
            (status,),
        ).fetchall()


@admin_router.post("/org-applications/{app_id}/approve")
def approve_application(app_id: str):
    """Creates the organisation and emails the coordinator link to the contact."""
    with get_conn() as conn:
        app = conn.execute(
            "select * from org_application where id = %s and status = 'pending'", (app_id,)
        ).fetchone()
        if not app:
            raise HTTPException(404, "Application not found or already reviewed")
        out = _make_org(conn, app["org_name"], app["kind"], app["city"], app["country"],
                        False, app["contact_name"])
        conn.execute(
            "update org_application set status = 'approved', org_id = %s, reviewed_at = now() "
            "where id = %s",
            (out["org_id"], app_id),
        )
    # After the database work is saved, so a slow email never holds a connection open.
    sent = org_mail.send_approved(
        app["contact_email"], app["contact_name"], app["org_name"], out["path"]
    )
    out["contact_email"] = app["contact_email"]
    out["email_sent"] = sent
    out["message"] = (
        "The private link was emailed to the contact. It is also shown here once, as a backup."
        if sent else
        "The email did not send. Send this private link to the contact yourself. It is shown only once."
    )
    return out


@admin_router.post("/org-applications/{app_id}/reject")
def reject_application(app_id: str):
    with get_conn() as conn:
        row = conn.execute(
            "update org_application set status = 'rejected', reviewed_at = now() "
            "where id = %s and status = 'pending' returning id",
            (app_id,),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Application not found or already reviewed")
    return {"rejected": True}


@admin_router.post("/orgs/{org_id}/cases")
def attach_case(org_id: str, body: AttachIn):
    """Attaches an existing person to an organisation. Used to seed a sample organisation."""
    with get_conn() as conn:
        if not conn.execute("select 1 from organisation where id = %s", (org_id,)).fetchone():
            raise HTTPException(404, "Organisation not found")
        if not conn.execute(
            "select 1 from person where id = %s and expires_at > now()", (body.person_id,)
        ).fetchone():
            raise HTTPException(404, "Person not found")
        conn.execute(
            "insert into org_case (org_id, person_id, case_key, reference, consent_confirmed_at, consent_by) "
            "values (%s, %s, %s, %s, now(), 'sample or admin') "
            "on conflict (org_id, person_id) do update set reference = excluded.reference",
            (org_id, body.person_id, _id("case"), clean_reference(body.reference)),
        )
        row = conn.execute(
            "select case_key from org_case where org_id = %s and person_id = %s",
            (org_id, body.person_id),
        ).fetchone()
    return {"attached": True, "case_key": row["case_key"]}


# ---------------------------------------------------------------- portal

@portal.get("/{token}")
def whoami(token: str):
    with get_conn() as conn:
        member = get_member(conn, token)
    return {
        "organisation": _org_view(member),
        "member": {"id": member["member_id"], "display_name": member["display_name"], "role": member["role"]},
    }


@portal.get("/{token}/dashboard")
def dashboard(token: str):
    with get_conn() as conn:
        member = get_member(conn, token)
        org_id = member["org_id"]

        stories = conn.execute(
            """
            select c.case_key, c.reference, c.status, c.created_at,
                   p.first_name, p.region, p.expires_at,
                   count(distinct w.id) as wishes,
                   count(m.maker_id) filter (where m.status = 'requested') as requested,
                   count(m.maker_id) filter (where m.status = 'accepted') as accepted,
                   count(m.maker_id) filter (where m.status = 'done') as done,
                   count(m.maker_id) filter (where m.concern_flagged) as concerns
            from org_case c
            join person p on p.id = c.person_id and p.expires_at > now()
            left join wish w on w.person_id = c.person_id
            left join wish_match m on m.wish_id = w.id
            where c.org_id = %s
            group by c.case_key, c.reference, c.status, c.created_at,
                     p.first_name, p.region, p.expires_at
            order by c.created_at desc
            """,
            (org_id,),
        ).fetchall()

        declined = conn.execute(
            """
            select count(m.maker_id) as n
            from org_case c
            join person p on p.id = c.person_id and p.expires_at > now()
            join wish w on w.person_id = c.person_id
            join wish_match m on m.wish_id = w.id
            where c.org_id = %s and m.status = 'declined'
            """,
            (org_id,),
        ).fetchone()["n"]

        # Reply time is measured only for real Wish Makers. Sample makers reply instantly.
        reply = conn.execute(
            """
            select avg(extract(epoch from (m.responded_at - m.requested_at)) / 3600.0) as hours
            from org_case c
            join person p on p.id = c.person_id and p.expires_at > now()
            join wish w on w.person_id = c.person_id
            join wish_match m on m.wish_id = w.id
            join wish_maker mk on mk.id = m.maker_id
            where c.org_id = %s and mk.is_sample = false
              and m.responded_at is not null and m.requested_at is not null
            """,
            (org_id,),
        ).fetchone()["hours"]

        makers = conn.execute(
            "select count(*) as n from wish_maker where application_status = 'approved'"
        ).fetchone()["n"]

    out_stories = []
    for s in stories:
        item = {
            "case_key": s["case_key"], "first_name": s["first_name"], "region": s["region"],
            "reference": s["reference"], "status": s["status"], "expires_at": s["expires_at"],
            "wishes": s["wishes"], "requested": s["requested"], "accepted": s["accepted"],
            "done": s["done"], "concerns": s["concerns"],
        }
        item["next_step"] = next_step(item)
        out_stories.append(item)

    totals = {
        "stories_open": sum(1 for s in stories if s["status"] == "open"),
        "stories_paused": sum(1 for s in stories if s["status"] == "paused"),
        "stories_closed": sum(1 for s in stories if s["status"] == "closed"),
        "wishes": sum(s["wishes"] for s in stories),
        "awaiting_maker_reply": sum(s["requested"] for s in stories),
        "accepted": sum(s["accepted"] for s in stories),
        "done": sum(s["done"] for s in stories),
        "declined": declined,
        "concerns": sum(s["concerns"] for s in stories),
        "avg_hours_to_maker_reply": _num(reply),
    }
    return {
        "organisation": _org_view(member),
        "role": member["role"],
        "totals": totals,
        "stories": out_stories,
        "makers_available": makers,
    }


@portal.get("/{token}/cases")
def list_cases(token: str):
    return dashboard(token)["stories"]


@portal.post("/{token}/cases")
def create_case(token: str, body: CaseIn):
    if not body.consent_confirmed:
        raise HTTPException(400, "Please confirm that the person, or their family or guardian, agreed to this")
    reference = clean_reference(body.reference)
    case_key = _id("case")
    with get_conn() as conn:
        member = get_member(conn, token)
        need(member, "coordinator", "volunteer")
        person = conn.execute(
            """
            insert into person (first_name, birth_year, region, language, expires_at)
            values (%s, %s, %s, %s, now() + make_interval(days => %s))
            returning id, first_name, birth_year, region, language, created_at, expires_at
            """,
            (body.first_name.strip(), body.birth_year, body.region, body.language, ORG_CASE_TTL_DAYS),
        ).fetchone()
        conn.execute(
            "insert into org_case "
            "(org_id, person_id, case_key, reference, created_by, consent_confirmed_at, consent_by) "
            "values (%s, %s, %s, %s, %s, now(), %s)",
            (member["org_id"], person["id"], case_key, reference, member["member_id"], body.consent_by),
        )
        audit(conn, member, "case.created", case_key)
    return {
        "case_key": case_key,
        "person_id": str(person["id"]),
        "person": person,
        "family_page": f"/person/{person['id']}",
    }


@portal.get("/{token}/cases/{case_key}")
def case_detail(token: str, case_key: str):
    with get_conn() as conn:
        member = get_member(conn, token)
        case = require_case(conn, member["org_id"], case_key)
        rows = conn.execute(
            """
            select w.id as wish_id, w.title, w.mode, w.kind, w.basis, w.created_at,
                   m.maker_id, m.status, m.requested_at, m.responded_at, m.concern_flagged,
                   mk.name as maker_name, mk.type as maker_type, mk.is_sample
            from wish w
            left join wish_match m on m.wish_id = w.id
                 and m.status in ('requested', 'accepted', 'done', 'declined', 'withdrawn')
            left join wish_maker mk on mk.id = m.maker_id
            where w.person_id = %s
            order by w.created_at, m.requested_at
            """,
            (case["person_id"],),
        ).fetchall()
        audit(conn, member, "case.viewed", case_key)

    order = {"done": 4, "accepted": 3, "requested": 2, "declined": 1, "withdrawn": 0}
    wishes, index = [], {}
    for r in rows:
        key = str(r["wish_id"])
        if key not in index:
            index[key] = {
                "wish_id": key, "title": r["title"], "mode": r["mode"], "kind": r["kind"],
                "basis": r["basis"], "stage": "not asked yet", "requests": [],
            }
            wishes.append(index[key])
        if r["maker_id"]:
            index[key]["requests"].append({
                "maker_id": r["maker_id"], "maker_name": r["maker_name"],
                "maker_type": r["maker_type"], "is_sample": r["is_sample"],
                "status": r["status"], "requested_at": r["requested_at"],
                "responded_at": r["responded_at"], "concern": r["concern_flagged"],
            })
    for w in wishes:
        best = max(w["requests"], key=lambda q: order.get(q["status"], -1), default=None)
        if best and order.get(best["status"], -1) >= 2:
            w["stage"] = best["status"]

    can_edit = member["role"] in ("coordinator", "volunteer")
    out = {
        "case_key": case_key,
        "role": member["role"],
        "can_edit": can_edit,
        "story": {
            "first_name": case["first_name"], "birth_year": case["birth_year"],
            "region": case["region"], "language": case["language"],
            "reference": case["reference"], "status": case["status"],
            "expires_at": case["expires_at"],
            "consent_confirmed_at": case["consent_confirmed_at"], "consent_by": case["consent_by"],
        },
        "wishes": wishes,
    }
    # Only people who can act get the id of the family-side page. Viewers never see it.
    if can_edit:
        out["person_id"] = str(case["person_id"])
        out["family_page"] = f"/person/{case['person_id']}"
    return out


@portal.patch("/{token}/cases/{case_key}")
def update_case(token: str, case_key: str, body: CasePatch):
    reference = clean_reference(body.reference)
    with get_conn() as conn:
        member = get_member(conn, token)
        need(member, "coordinator")
        require_case(conn, member["org_id"], case_key)
        if body.status is not None:
            conn.execute(
                "update org_case set status = %s where org_id = %s and case_key = %s",
                (body.status, member["org_id"], case_key),
            )
        if body.reference is not None:
            conn.execute(
                "update org_case set reference = %s where org_id = %s and case_key = %s",
                (reference, member["org_id"], case_key),
            )
        audit(conn, member, "case.updated", case_key)
    return {"updated": True}


@portal.post("/{token}/cases/{case_key}/extend")
def extend_case(token: str, case_key: str):
    """Keeps a story for another full period, for example when the stay is longer than planned."""
    with get_conn() as conn:
        member = get_member(conn, token)
        need(member, "coordinator", "volunteer")
        case = require_case(conn, member["org_id"], case_key)
        row = conn.execute(
            "update person set expires_at = now() + make_interval(days => %s) "
            "where id = %s returning expires_at",
            (ORG_CASE_TTL_DAYS, case["person_id"]),
        ).fetchone()
        audit(conn, member, "case.extended", case_key)
    return {"extended": True, "expires_at": row["expires_at"]}


@portal.delete("/{token}/cases/{case_key}")
def delete_case(token: str, case_key: str):
    """Permanently deletes a story and everything under it, right away."""
    with get_conn() as conn:
        member = get_member(conn, token)
        need(member, "coordinator")
        case = require_case(conn, member["org_id"], case_key)
        # The same delete the family's "Delete everything" uses. It removes the portrait, wishes,
        # requests, family memories, Wish Book and this case row by cascade.
        conn.execute("delete from person where id = %s", (case["person_id"],))
        # The audit row keeps only the opaque case key, never a name.
        audit(conn, member, "case.deleted", case_key)
    return {"deleted": True}


@portal.post("/{token}/members")
def add_member(token: str, body: MemberIn):
    """A coordinator adds a colleague, or a read-only viewer link. The link is shown once,
    and emailed if an address was given."""
    member_id, new = _id("mem"), new_token()
    with get_conn() as conn:
        member = get_member(conn, token)
        need(member, "coordinator")
        conn.execute(
            "insert into org_member (id, org_id, display_name, role, token_hash) "
            "values (%s, %s, %s, %s, %s)",
            (member_id, member["org_id"], body.display_name.strip(), body.role, hash_token(new)),
        )
        audit(conn, member, "member.added", f"{member_id} ({body.role})")
        org_name = member["org_name"]
    path = f"/org/{new}"
    sent = None
    if body.email:
        sent = org_mail.send_member_invite(
            body.email.strip(), body.display_name.strip(), org_name, body.role, path
        )
    return {
        "member_id": member_id, "role": body.role, "manage_token": new, "path": path,
        "email_sent": sent,
        "message": "Share this link only with that person. It is shown only once.",
    }


@portal.get("/{token}/members")
def list_members(token: str):
    with get_conn() as conn:
        member = get_member(conn, token)
        need(member, "coordinator")
        rows = conn.execute(
            "select id, display_name, role, created_at, revoked_at from org_member "
            "where org_id = %s order by created_at",
            (member["org_id"],),
        ).fetchall()
    return rows


@portal.delete("/{token}/members/{member_id}")
def revoke_member(token: str, member_id: str):
    with get_conn() as conn:
        member = get_member(conn, token)
        need(member, "coordinator")
        if member_id == member["member_id"]:
            raise HTTPException(409, "You cannot remove your own link")
        row = conn.execute(
            "update org_member set revoked_at = now() "
            "where id = %s and org_id = %s and revoked_at is null returning id",
            (member_id, member["org_id"]),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Member not found")
        audit(conn, member, "member.revoked", member_id)
    return {"revoked": True}


@portal.get("/{token}/audit")
def audit_log(token: str):
    with get_conn() as conn:
        member = get_member(conn, token)
        need(member, "coordinator")
        rows = conn.execute(
            """
            select a.action, a.target, a.created_at, m.display_name
            from org_audit a left join org_member m on m.id = a.member_id
            where a.org_id = %s order by a.created_at desc limit 100
            """,
            (member["org_id"],),
        ).fetchall()
    return rows