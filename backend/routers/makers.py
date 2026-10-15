from fastapi import APIRouter, HTTPException

from db import get_conn

router = APIRouter(prefix="/makers", tags=["makers"])


@router.get("")
def list_makers(remote_only: bool = False):
    sql = "select * from wish_maker"
    if remote_only:
        sql += " where remote_ok = true"
    sql += " order by id"
    with get_conn() as conn:
        rows = conn.execute(sql).fetchall()
    return rows


@router.get("/{maker_id}")
def get_maker(maker_id: str):
    with get_conn() as conn:
        row = conn.execute("select * from wish_maker where id = %s", (maker_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Maker not found")
    return row