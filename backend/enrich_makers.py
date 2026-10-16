from psycopg.types.json import Jsonb

from db import get_conn

DOMAIN_BY_TYPE = {
    "musician": "music", "home cook": "food", "cafe": "place",
    "storyteller": "other", "volunteer": "place", "other": "other",
}


def main():
    try:
        from engine import resolve
    except Exception:
        print("The engine's resolve() is not available yet. Nothing was changed.")
        return

    with get_conn() as conn:
        makers = conn.execute(
            "select id, name, type, tags from wish_maker "
            "where application_status in ('approved', 'pending') "
            "and qloo_entity_ids = '[]'::jsonb"
        ).fetchall()
        for m in makers:
            domain = DOMAIN_BY_TYPE.get(m["type"], "other")
            entity_ids, tag_map, ok = [], {}, 0
            for tag in m["tags"]:
                res = resolve(tag, domain) or {}
                entity = res.get("entity")
                if res.get("found") and entity:
                    ok += 1
                    if entity["id"] not in entity_ids:
                        entity_ids.append(entity["id"])
                    for t in res.get("tags") or []:
                        tag_map[t["id"]] = t.get("name", "")
            conn.execute(
                "update wish_maker set qloo_entity_ids = %s, qloo_tags = %s where id = %s",
                (Jsonb(entity_ids), Jsonb([{"id": k, "name": v} for k, v in tag_map.items()]), m["id"]),
            )
            print(f"{m['name']}: {ok} of {len(m['tags'])} tags found in Qloo")


if __name__ == "__main__":
    main()