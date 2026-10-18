from psycopg.types.json import Jsonb

from db import get_conn

DOMAIN_BY_TYPE = {
    "musician": "music", "home cook": "food", "cafe": "place",
    "storyteller": "place", "volunteer": "place", "other": "other",
}


def main():
    try:
        from engine import resolve
    except Exception as exc:
        print("The engine could not be imported:", exc)
        return

    with get_conn() as conn:
        makers = conn.execute(
            "select id, name, type, tags from wish_maker "
            "where application_status in ('approved', 'pending') and qloo_tags = '[]'::jsonb"
        ).fetchall()

    for m in makers:
        domain = DOMAIN_BY_TYPE.get(m["type"], "other")
        entity_ids, tags, ok = [], {}, 0
        for text in m["tags"]:
            res = resolve(str(text), domain) or {}
            entity = res.get("entity")
            # Makers keep only exact matches (levels 1 and 2), never a parent or a guess.
            if not (res.get("found") and entity) or res.get("resolution_level") not in (1, 2):
                continue
            ok += 1
            if entity.get("type") == "tag":
                tags[entity["id"]] = entity.get("name") or str(text)
            else:
                if entity["id"] not in entity_ids:
                    entity_ids.append(entity["id"])
                for t in res.get("tags") or []:
                    tags[t["id"]] = t.get("name", "")
        stored_tags = [{"id": k, "name": v} for k, v in list(tags.items())[:60]]
        with get_conn() as conn:
            conn.execute(
                "update wish_maker set qloo_entity_ids = %s, qloo_tags = %s where id = %s",
                (Jsonb(entity_ids), Jsonb(stored_tags), m["id"]),
            )
        print(f"{m['name']}: {ok} of {len(m['tags'])} tags matched exactly")


if __name__ == "__main__":
    main()