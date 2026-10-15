import os

import psycopg
from dotenv import load_dotenv

load_dotenv()
url = os.environ.get("DATABASE_URL")
if not url:
    raise SystemExit("DATABASE_URL is missing. Check backend/.env")

with psycopg.connect(url, connect_timeout=10) as conn:
    rows = conn.execute(
        "select table_name from information_schema.tables "
        "where table_schema = 'public' order by table_name"
    ).fetchall()
    print("Connected. Tables found:")
    for (name,) in rows:
        print(" -", name)