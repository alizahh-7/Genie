"""Run from backend/:  python engine/test_engine.py
Runs the 5 coverage misses/suspects, then builds the 'Nani' demo portrait."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from qloo_client import QlooClient
from resolve import resolve
from portrait import build_portrait

c = QlooClient()
print("=== ladder checks (expect level in brackets) ===")
for name, dom, expect in [("Lag Jaa Gale", "music", 3), ("Umm Kulthum", "music", 2),
                          ("Why This Kolaveri Di", "music", "2-3"), ("Hotel California", "music", "3 ideally"),
                          ("Tirupati", "place", "1 via destination, or 5"), ("A. R. Rahman", "music", 1),
                          ("haleem", "food", 1), ("zzzz qqqq", "music", 5)]:
    r = resolve(name, dom, client=c)
    print(f"{name:24s} found={r['found']} level={r['resolution_level']} (expect {expect}) "
          f"-> {r['entity']['name'] if r['entity'] else None}  tags={len(r['tags'])}")

print("\n=== Nani portrait ===")
person = {"first_name": "Nani", "birth_year": 1948, "region": "Hyderabad", "language": "Hindi"}
inputs = {"quick_facts": [{"domain": "music", "name": "Lag Jaa Gale"}, {"domain": "music", "name": "Mohammed Rafi"},
                          {"domain": "food", "name": "haleem"}, {"domain": "place", "name": "Charminar"},
                          {"domain": "film", "name": "Mughal-e-Azam"}],
          "circle_answers": [{"contributor": "Ayesha", "answers": {"music": "Kishore Kumar and Lata Mangeshkar", "food": "irani chai"}}]}
out = build_portrait(person, inputs)
for it in out["items"]:
    print(f"{it['domain']:6s} {it['name']:22s} {it['source_label']:7s} L{it['resolution_level']} conf={it['confidence']} tags={len(it['tags'])} -> {it['matched_name']}")
print(f"\nqloo calls logged: {len(out['qloo_log'])}")
Path(__file__).with_name("_nani_portrait.json").write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
print("saved engine/_nani_portrait.json")