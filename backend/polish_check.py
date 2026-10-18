"""How often is the LLM polish accepted? Run from backend/:  python polish_check.py
Uses fictional personas only. Output is printed, nothing is written."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "engine"))
import llm
from agent import run_agent
import wishes as W

PEOPLE = [
    ("Nani (Hindi, Hyderabad)", {"first_name": "Nani", "birth_year": 1948, "region": "Hyderabad", "language": "Hindi"},
     [("music", "Lag Jaa Gale"), ("music", "Kishore Kumar"), ("music", "Mohammed Rafi"), ("food", "haleem"),
      ("place", "Charminar"), ("film", "Mughal-e-Azam")]),
    ("Minji (K-pop and the ocean)", {"first_name": "Minji", "birth_year": 1992, "region": "Busan", "language": "Korean"},
     [("music", "BTS"), ("music", "BLACKPINK"), ("place", "Jeju Island"), ("food", "ramen"), ("film", "Crash Landing on You")]),
    ("Appa (Telugu, Hyderabad)", {"first_name": "Appa", "birth_year": 1945, "region": "Hyderabad", "language": "Telugu"},
     [("music", "Ghantasala"), ("music", "S. P. Balasubrahmanyam"), ("film", "Mayabazar"), ("food", "pesarattu"), ("place", "Tirupati")]),
    ("Amma (Tamil, Chennai)", {"first_name": "Amma", "birth_year": 1950, "region": "Chennai", "language": "Tamil"},
     [("music", "Ilaiyaraaja"), ("music", "A. R. Rahman"), ("music", "Why This Kolaveri Di"), ("place", "Marina Beach"), ("food", "masala dosa")]),
    ("Sam (classic rock, Edinburgh)", {"first_name": "Sam", "birth_year": 1952, "region": "Edinburgh", "language": "English"},
     [("music", "Queen"), ("music", "The Beatles"), ("music", "Hotel California"), ("place", "Edinburgh"), ("food", "tacos")]),
    ("Layla (Arabic)", {"first_name": "Layla", "birth_year": 1944, "region": "Cairo", "language": "Arabic"},
     [("music", "Fairuz"), ("music", "Umm Kulthum"), ("film", "Titanic")]),
    ("Thin (one item)", {"first_name": "Ravi", "birth_year": 1950, "region": "Mumbai", "language": "Hindi"},
     [("music", "Lata Mangeshkar")]),
]

tot_ok = tot_all = 0
for label, person, facts in PEOPLE:
    llm._down_until = 0.0   # do not let one slow call hide the next
    out = run_agent(person, {"quick_facts": [{"domain": d, "name": n} for d, n in facts]}, use_llm=False)
    ws = out["wishes"]
    polished, ok, reasons = W._polish_checked(ws)
    tot_ok += ok
    tot_all += len(ws)
    print(f"\n{label}: {ok} of {len(ws)} rewrites accepted")
    for r in reasons:
        print(f"   rejected: {r}")
    for before, after in zip(ws, polished):
        if after["title"] != before["title"] or after["description"] != before["description"]:
            print(f"   [{after['mode']}] {after['title']}\n      {after['description']}")
print(f"\nTOTAL: {tot_ok} of {tot_all} wish rewrites accepted")