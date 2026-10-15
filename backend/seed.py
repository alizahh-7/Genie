import json
from pathlib import Path

from psycopg.types.json import Jsonb

from db import get_conn

DATA = Path(__file__).parent / "data" / "makers.json"


def seed_makers():
    makers = json.loads(DATA.read_text(encoding="utf-8"))
    with get_conn() as conn:
        for m in makers:
            conn.execute(
                """
                insert into wish_maker
                  (id, name, type, bio, tags, city, remote_ok, is_sample, verification_status)
                values (%s, %s, %s, %s, %s, %s, %s, true, 'sample')
                on conflict (id) do update set
                  name = excluded.name,
                  type = excluded.type,
                  bio = excluded.bio,
                  tags = excluded.tags,
                  city = excluded.city,
                  remote_ok = excluded.remote_ok
                """,
                (m["id"], m["name"], m["type"], m["bio"], Jsonb(m["tags"]), m["city"], m["remote_ok"]),
            )
        count = conn.execute("select count(*) as n from wish_maker").fetchone()["n"]
    print(f"Seeded. wish_maker rows: {count}")


if __name__ == "__main__":
    seed_makers()