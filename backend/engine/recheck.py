"""
Genie - recheck the suspicious rows of the coverage test (Umaima)
Save as backend/engine/recheck.py and run from backend/:

    python engine\\recheck.py

It prints (to the screen only, no files) the top results for the rows that need a human look,
so you can decide what the fallback ladder should do. Nothing here is saved or committed.
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import coverage_test_v2 as c  # reuses get(), as_list(), the key and the base URL

# (what we are checking, queries to try, entity types to search)
CASES = [
    ("Umm Kulthum: spelling variants (tests fallback level 2)",
     ["Umm Kulthum", "Umm Kalthum", "Oum Kalthoum", "Um Kulthum", "Oum Kalsoum"],
     ["urn:entity:artist"]),
    ("Kolaveri Di: which route reaches the artist? (level 3)",
     ["Why This Kolaveri Di", "Kolaveri Di", "Dhanush", "Anirudh Ravichander"],
     ["urn:entity:artist", "urn:entity:person"]),
    ("Hotel California: is the 'found' result the Eagles, or something else?",
     ["Hotel California", "Eagles"],
     ["urn:entity:artist"]),
    ("Tirupati: the first hit was a railway station. What else exists?",
     ["Tirupati", "Tirumala", "Tirumala Venkateswara Temple", "Tirupati Balaji"],
     ["urn:entity:place", "urn:entity:destination"]),
    ("Goa and Jeju: place or destination?",
     ["Goa", "Jeju Island"],
     ["urn:entity:place", "urn:entity:destination"]),
    ("The two level-3 artists we picked by hand",
     ["Armaan Malik", "M. M. Keeravani"],
     ["urn:entity:artist"]),
]


def short(hit, n=70):
    props = hit.get("properties") or {}
    geo = props.get("geocode") or {}
    city = geo.get("city") or ""
    desc = (props.get("short_description") or props.get("description") or "")[:n]
    types = ",".join(t.replace("urn:entity:", "") for t in (hit.get("types") or [hit.get("subtype", "")]))
    pop = hit.get("popularity")
    pop = f"{pop:.2f}" if isinstance(pop, (int, float)) else "-"
    return f"{c.name_of(hit)[:34]:34s} [{types}] pop={pop} city={city or '-':14s} {desc}"


def main():
    if not c.KEY:
        sys.exit("QLOO_API_KEY not found in backend/.env")
    for title, queries, types in CASES:
        print("\n" + "=" * 100 + f"\n{title}")
        for q in queries:
            for t in types:
                data, err = c.get("/search", {"query": q, "types": t, "take": 4})
                hits = c.as_list(data) if data else []
                print(f"\n  query='{q}'  type={t.replace('urn:entity:', '')}  "
                      f"{'(no results)' if err == 'no results' else ('(error: ' + str(err) + ')' if err else '')}")
                for h in hits[:4]:
                    print("    - " + short(h))
                time.sleep(0.25)


if __name__ == "__main__":
    main()