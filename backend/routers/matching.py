from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from psycopg.types.json import Jsonb

from db import get_conn, require_person
from matcher import is_eligible, rank_makers, select_items

router = APIRouter(prefix="/persons", tags=["matching"])

MAKER_COLS = (
    "id, name, type, city, country, languages, remote_ok, is_sample, "
    "verification_status, application_status, tags, qloo_entity_ids, qloo_tags"
)
WISH_COLS = "id, mode, source_items, tags, maker_type"


def load_context(conn, person_id):
    require_person(conn, person_id)
    person = conn.execute(
        "select first_name, region, language from person where id = %s", (person_id,)
    ).fetchone()
    portrait = conn.execute(
        "select domain, name, qloo_entity_id, qloo_tags as tags, confidence, matched_name "
        "from portrait_item where person_id = %s",
        (person_id,),
    ).fetchall()
    if not portrait:
        raise HTTPException(409, "Build the Taste Portrait before matching")
    makers = conn.execute(
        f"select {MAKER_COLS} from wish_maker where application_status = 'approved'"
    ).fetchall()
    return person, portrait, makers


def match_one(conn, person, wish, portrait, makers, limit):
    wish_id = wish["id"]
    blocked = {
        r["maker_id"]
        for r in conn.execute(
            "select maker_id from wish_match where wish_id = %s and status = 'declined'",
            (wish_id,),
        ).fetchall()
    }
    items = select_items(portrait, wish["source_items"], wish["tags"])
    eligible = [
        m for m in makers
        if m["id"] not in blocked and is_eligible(m, wish["mode"], person, wish["maker_type"])
    ]
    ranked = rank_makers(
        items, makers, wish["mode"], person,
        blocked=blocked, limit=limit, wish_type=wish["maker_type"],
    )

    # Replace old suggestions. Requests already in progress are never touched.
    conn.execute("delete from wish_match where wish_id = %s and status = 'suggested'", (wish_id,))
    for r in ranked:
        conn.execute(
            """
            insert into wish_match (wish_id, maker_id, status, score, reasons, basis)
            values (%s, %s, 'suggested', %s, %s, %s)
            on conflict (wish_id, maker_id) do update
              set status = 'suggested', score = excluded.score,
                  reasons = excluded.reasons, basis = excluded.basis
              where wish_match.status in ('suggested', 'withdrawn')
            """,
            (wish_id, r["maker_id"], r["score"], Jsonb(r["reasons"]), r["basis"]),
        )

    by_id = {m["id"]: m for m in makers}
    matches = []
    for r in ranked:
        m = by_id[r["maker_id"]]
        matches.append({
            "maker_id": m["id"], "name": m["name"], "type": m["type"],
            "city": m["city"], "country": m["country"], "is_sample": m["is_sample"],
            "verification_status": m["verification_status"],
            "score": r["score"], "reasons": r["reasons"], "basis": r["basis"],
        })

    if matches:
        message = None
    elif wish["mode"] == "in-person" and not (person["region"] or "").strip():
        message = "Add where they live so Genie can look for in-person Wish Makers nearby."
    elif not eligible:
        if wish["mode"] == "in-person":
            message = f"No verified Wish Makers near {person['region']} yet. A remote wish can reach makers anywhere."
        else:
            message = "No Wish Makers are offering remote wishes right now."
    else:
        message = "No Wish Maker matches these favorites yet. Real makers can apply from anywhere."

    return {
        "wish_id": str(wish_id),
        "matches": matches,
        "message": message,
        "explain": {
            "mode": wish["mode"],
            "person_region": person["region"],
            "items_used": [i["name"] for i in items],
            "approved_makers": len(makers),
            "eligible_makers": len(eligible),
        },
    }


@router.post("/{person_id}/wishes/{wish_id}/match")
def run_matching(person_id: UUID, wish_id: UUID, limit: int = Query(default=5, ge=1, le=10)):
    with get_conn() as conn:
        person, portrait, makers = load_context(conn, person_id)
        wish = conn.execute(
            f"select {WISH_COLS} from wish where id = %s and person_id = %s",
            (wish_id, person_id),
        ).fetchone()
        if not wish:
            raise HTTPException(404, "Wish not found")
        return match_one(conn, person, wish, portrait, makers, limit)


@router.post("/{person_id}/match-all")
def match_all(person_id: UUID, limit: int = Query(default=5, ge=1, le=10)):
    with get_conn() as conn:
        person, portrait, makers = load_context(conn, person_id)
        wishes = conn.execute(
            f"select {WISH_COLS} from wish where person_id = %s order by created_at",
            (person_id,),
        ).fetchall()
        return {"results": [match_one(conn, person, w, portrait, makers, limit) for w in wishes]}