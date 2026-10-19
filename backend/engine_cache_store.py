"""Private pre-warm store for the engine's disk cache.
Qloo's terms forbid public storage, so the cache lives in the private Supabase database.
    python engine_cache_store.py snapshot | restore | stats
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(HERE, "engine", "_cache")
MAX_BYTES = 5_000_000


def safe_path(key, base):
    """Map a stored key to a file under base, or None if the key tries to escape it."""
    if not key or "\\" in key or ":" in key or key.startswith("/"):
        return None
    parts = key.split("/")
    if any(p in ("", ".", "..") for p in parts):
        return None
    base = os.path.normpath(base)
    target = os.path.normpath(os.path.join(base, *parts))
    return target if target.startswith(base + os.sep) else None


def _connect():
    import psycopg
    from dotenv import load_dotenv
    load_dotenv(os.path.join(HERE, ".env"))
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    return psycopg.connect(url, prepare_threshold=None, connect_timeout=10)

def init():
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute("create table if not exists engine_cache ("
                    "key text primary key, body text not null, updated_at timestamptz not null default now())")
        cur.execute("alter table engine_cache enable row level security")
        conn.commit()
    finally:
        conn.close()


def snapshot():
    rows = []
    for root, _dirs, files in os.walk(CACHE_DIR):
        for fn in files:
            full = os.path.join(root, fn)
            if os.path.getsize(full) > MAX_BYTES:
                continue
            key = os.path.relpath(full, CACHE_DIR).replace(os.sep, "/")
            with open(full, "r", encoding="utf-8") as f:
                rows.append((key, f.read()))
    conn = _connect()
    try:
        cur = conn.cursor()
        for key, body in rows:
            cur.execute("insert into engine_cache (key, body) values (%s, %s) "
                        "on conflict (key) do update set body = excluded.body, updated_at = now()", (key, body))
        conn.commit()
    finally:
        conn.close()
    return len(rows)


def restore():
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute("select key, body from engine_cache")
        rows = cur.fetchall()
    finally:
        conn.close()
    written = 0
    for key, body in rows:
        target = safe_path(key, CACHE_DIR)
        if not target or os.path.exists(target):
            continue
        os.makedirs(os.path.dirname(target), exist_ok=True)
        tmp = target + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(body)
        os.replace(tmp, target)
        written += 1
    return written


def restore_safely():
    """For server start-up: never raises, never blocks the app."""
    try:
        n = restore()
        print(f"[engine cache] restored {n} files")
        return n
    except Exception as e:
        print(f"[engine cache] restore skipped: {type(e).__name__}: {e}")
        return 0


def stats():
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute("select count(*), coalesce(sum(length(body)), 0) from engine_cache")
        return cur.fetchone()
    finally:
        conn.close()


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "init": init(); print("table ready")
    elif cmd == "snapshot": print("stored", snapshot(), "files")
    elif cmd == "restore": print("restored", restore(), "files")
    elif cmd == "stats": print("rows, bytes:", stats())
    else: print(__doc__)