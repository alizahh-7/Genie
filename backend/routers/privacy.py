from uuid import UUID

from fastapi import APIRouter, HTTPException

from db import get_conn

router = APIRouter(prefix="/persons", tags=["privacy"])


@router.delete("/{person_id}")
def delete_everything(person_id: UUID):
    with get_conn() as conn:
        cur = conn.execute("delete from person where id = %s", (person_id,))
        deleted = cur.rowcount
    if deleted == 0:
        raise HTTPException(404, "Person not found")
    return {"deleted": True}