from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from psycopg.types.json import Jsonb

from db import get_conn, require_person
from matcher import rank_makers, select_items

router = APIRouter(prefix="/persons", tags=["matching"])

MAKER_COLS = (
    "id, name, type, city, country, languages, remote_ok, is_sample, "
    "verification_status, application_status, tags, qloo_entity_ids, qloo_tags"
)


@router.post("/{person_id}/wishes/{wish_id}/match")
def run_matching(person_id: UUID, wish_id: UUID, limit: int = Query(default=5, ge=1, le=10)):
    with get_conn() as conn:
        require_person(conn, person_id)
        person = conn.execute(
            "select first_name, region, language from person where id = %s", (person_id,)
        ).fetchone()
        wish = conn.execute(
            "select id, mode, source_items from wish where id = %s and person_id = %s",
            (wish_id, person_id),
        ).fetchone()
        if not wish:
            raise HTTPException(404, "Wish not found")
        portrait = conn.execute(
            "select domain, name, qloo_entity_id, qloo_tags as tags, confidence "
            "from portrait_item where person_id = %s",
            (person_id,),
        ).fetchall()
        if not portrait:
            raise HTTPException(409, "Build the Taste Portrait before matching")

        makers = conn.execute(
            f"select {MAKER_COLS} from wish_maker where application_status = 'approved'"
        ).fetchall()
        blocked = {
            r["maker_id"]
            for r in conn.execute(
                "select maker_id from wish_match where wish_id = %s and status = 'declined'",
                (wish_id,),
            ).fetchall()
        }

        items = select_items(portrait, wish["source_items"])
        ranked = rank_makers(items, makers, wish["mode"], person, blocked=blocked, limit=limit)

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
    message = None if matches else "No matching Wish Makers yet. Real makers can apply from anywhere."
    return {"wish_id": str(wish_id), "matches": matches, "message": message}