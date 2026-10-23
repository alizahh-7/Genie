import os
import secrets
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import get_conn
from routers.admin import require_admin
from util import hash_token, new_token

# People opened by an organisation are kept longer than a family demo, because a care
# team needs the story for the whole stay.
ORG_CASE_TTL_DAYS = int(os.environ.get("ORG_CASE_TTL_DAYS", "90"))

portal = APIRouter(prefix="/org-portal", tags=["organisation portal"])
admin_router = APIRouter(prefix="/admin", tags=["organisations"], dependencies=[Depends(require_admin)])

ROLES = ("coordinator", "volunteer", "viewer")


class OrgIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    kind: Literal["hospice", "hospital", "care home", "charity"] = "hospice"
    city: Optional[str] = Field(default=None, max_length=80)
    country: Optional[str] = Field(default=None, max_length=80)
    is_sample: bool = False
    coordinator_name: str = Field(min_length=1, max_length=60)


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


class CasePatch(BaseModel):
    status: Optional[Literal["open", "paused", "closed"]] = None
    reference: Optional[str] = Field(default=None, max_length=60)


class MemberIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=60)
    role: Literal["coordinator", "volunteer", "viewer"]


def _id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(6)}"


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


def require_case(conn, org_id: str, person_id) -> dict:
    row = conn.execute(
        """
        select c.reference, c.status, c.created_at, p.first_name, p.birth_year, p.region,
               p.language, p.expires_at
        from org_case c join person p on p.id = c.person_id
        where c.org_id = %s and c.person_id = %s and p.expires_at > now()
        """,
        (org_id, person_id),
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


# ---------------------------------------------------------------- admin

@admin_router.post("/orgs")
def create_org(body: OrgIn):
    """Creates an organisation and its first coordinator. The private link is shown once."""
    org_id, member_id, token = _id("org"), _id("mem"), new_token()
    with get_conn() as conn:
        conn.execute(
            "insert into organisation (id, name, kind, city, country, is_sample) "
            "values (%s, %s, %s, %s, %s, %s)",
            (org_id, body.name.strip(), body.kind, body.city, body.country, body.is_sample),
        )
        conn.execute(
            "insert into org_member (id, org_id, display_name, role, token_hash) "
            "values (%s, %s, %s, 'coordinator', %s)",
            (member_id, org_id, body.coordinator_name.strip(), hash_token(token)),
        )
    return {
        "org_id": org_id, "member_id": member_id, "role": "coordinator",
        "manage_token": token, "path": f"/org/{token}",
        "message": "Save this private link now. It is shown only once.",
    }


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
            "insert into org_case (org_id, person_id, reference) values (%s, %s, %s) "
            "on conflict (org_id, person_id) do update set reference = excluded.reference",
            (org_id, body.person_id, body.reference),
        )
    return {"attached": True}


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
            select c.person_id, c.reference, c.status, c.created_at,
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
            group by c.person_id, c.reference, c.status, c.created_at,
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
            "person_id": str(s["person_id"]), "first_name": s["first_name"], "region": s["region"],
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
            "insert into org_case (org_id, person_id, reference, created_by) values (%s, %s, %s, %s)",
            (member["org_id"], person["id"], body.reference, member["member_id"]),
        )
        audit(conn, member, "case.created", str(person["id"]))
    return {"person_id": str(person["id"]), "person": person, "family_page": f"/person/{person['id']}"}


@portal.get("/{token}/cases/{person_id}")
def case_detail(token: str, person_id: UUID):
    with get_conn() as conn:
        member = get_member(conn, token)
        case = require_case(conn, member["org_id"], person_id)
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
            (person_id,),
        ).fetchall()
        audit(conn, member, "case.viewed", str(person_id))

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
        elif best:
            w["stage"] = "not asked yet"

    return {
        "person_id": str(person_id),
        "story": {
            "first_name": case["first_name"], "birth_year": case["birth_year"],
            "region": case["region"], "language": case["language"],
            "reference": case["reference"], "status": case["status"],
            "expires_at": case["expires_at"],
        },
        "wishes": wishes,
        "family_page": f"/person/{person_id}",
    }


@portal.patch("/{token}/cases/{person_id}")
def update_case(token: str, person_id: UUID, body: CasePatch):
    with get_conn() as conn:
        member = get_member(conn, token)
        need(member, "coordinator")
        require_case(conn, member["org_id"], person_id)
        if body.status is not None:
            conn.execute(
                "update org_case set status = %s where org_id = %s and person_id = %s",
                (body.status, member["org_id"], person_id),
            )
        if body.reference is not None:
            conn.execute(
                "update org_case set reference = %s where org_id = %s and person_id = %s",
                (body.reference, member["org_id"], person_id),
            )
        audit(conn, member, "case.updated", str(person_id))
    return {"updated": True}


@portal.post("/{token}/members")
def add_member(token: str, body: MemberIn):
    """A coordinator adds a colleague, or a read-only viewer link. The link is shown once."""
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
    return {
        "member_id": member_id, "role": body.role, "manage_token": new, "path": f"/org/{new}",
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