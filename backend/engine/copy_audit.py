"""Write every family-facing sentence to engine\\_review\\copy_review.txt for the team read-aloud.
    python engine\\copy_audit.py
The output can contain Qloo discovery names, so _review/ is git-ignored. Never commit it.
"""
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)
sys.path.insert(0, BACKEND)
from dotenv import load_dotenv
load_dotenv(os.path.join(BACKEND, ".env"))

from engine import run_agent, pick_reaction_cards, apply_reactions, generate_bedside_kit, side_by_side
from engine.personas import PERSONAS

BAD = re.compile(r"diagnos|medic|dementia|alzheimer|cancer|terminal|dying|\bdeath\b|therap|"
                 r"treatment|\bcure\b|\bpain\b|hospice|palliative|illness|patient|journey|passed away", re.I)
THIN = {"person": {"first_name": "Sam", "birth_year": 1950, "region": "Hyderabad", "language": "Hindi"},
        "inputs": {"quick_facts": [{"domain": "music", "name": "Kishore Kumar"}]}}
EMPTY = {"person": {"first_name": "Sam"}, "inputs": {}}
SCENES = dict(PERSONAS, thin=THIN, empty=EMPTY)

lines, flags = [], 0


def add(label, text):
    global flags
    if not isinstance(text, str) or not text.strip():
        return
    bad = label != "kit note" and (BAD.search(text) is not None or "!" in text)
    if bad: flags += 1
    lines.append(f"{'**FLAG** ' if bad else ''}[{label}] {text}")


for name, s in SCENES.items():
    p, i = s["person"], s["inputs"]
    lines.append(f"\n########## {name} ##########")
    r = run_agent(p, i)
    add("follow_up", r.get("follow_up"))
    for st in r.get("steps", []): add(f"step:{st.get('id')}", st.get("summary"))
    for w in r.get("wishes", []):
        add(f"wish:{w.get('mode')}", f"{w.get('title')} | {w.get('description')}")
        add("wish why", w.get("why"))
    cards = pick_reaction_cards(r.get("items", []), tried=[])
    for c in cards.get("cards", []): add("reaction card", c.get("prompt"))
    if cards.get("cards"):
        c0 = cards["cards"][0]
        for kind in ("lit_up", "no_reaction"):
            u = apply_reactions(p, r["items"], [{"name": c0["name"], "domain": c0["domain"], "reaction": kind}], tried=[])
            add(f"reaction message ({kind})", u.get("message"))
    k = generate_bedside_kit(p, r.get("items", []))
    add("kit title", k.get("title")); add("kit intro", k.get("intro"))
    add("kit playlist how_to", k["playlist"].get("how_to")); add("kit empty_note", k["playlist"].get("empty_note"))
    for t in k["playlist"]["tracks"]: add("kit track label", t.get("label"))
    for x in k["small_changes"]: add("kit small change", x.get("text"))
    for x in k["visitors"]: add("kit visitor", x.get("text"))
    add("kit note", k.get("note"))
    if name in ("nani", "jun"):
        c = side_by_side(p, i)
        add("compare note", c.get("note"))
        add("compare generic message", c["generic"].get("message"))
        for w in c["generic"].get("wishes", []): add("generic wish", f"{w.get('title')} | {w.get('description')}")

os.makedirs(os.path.join(HERE, "_review"), exist_ok=True)
out = os.path.join(HERE, "_review", "copy_review.txt")
with open(out, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
print(f"Wrote {out}: {len(lines)} lines, {flags} flagged")