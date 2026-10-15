from db import get_conn


def purge_expired() -> int:
    with get_conn() as conn:
        cur = conn.execute("delete from person where expires_at < now()")
        return cur.rowcount