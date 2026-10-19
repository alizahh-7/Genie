"""Fictional demo personas. Our own inputs only, no Qloo data."""

NANI = {
    "person": {"first_name": "Nani", "birth_year": 1948, "region": "Hyderabad", "language": "Hindi"},
    "inputs": {
        "quick_facts": [
            {"domain": "music", "name": "Lag Jaa Gale"},
            {"domain": "food", "name": "haleem"},
            {"domain": "place", "name": "Charminar"},
            {"domain": "film", "name": "Mughal-e-Azam"},
        ],
        "circle_answers": [
            {"contributor": "Ayesha",
             "answers": {"music": "Kishore Kumar and Lata Mangeshkar", "food": "haleem", "place": "Charminar"}},
        ],
    },
}

# Person B: 34 years old in 2026, loved K-pop and the ocean.
# region must match the city of the sample K-pop/Korean makers in data/makers.json.
JUN = {
    "person": {"first_name": "Jun", "birth_year": 1992, "region": "Seoul", "language": "Korean"},
    "inputs": {
        "quick_facts": [
            {"domain": "music", "name": "BTS"},
            {"domain": "music", "name": "IU"},
            {"domain": "food", "name": "tteokbokki"},
            {"domain": "place", "name": "Busan"},
            {"domain": "film", "name": "Descendants of the Sun"},
        ],
        "circle_answers": [
            {"contributor": "Dahye",
             "answers": {"music": "BTS and IU", "food": "tteokbokki", "place": "Haeundae Beach"}},
        ],
    },
}

PERSONAS = {"nani": NANI, "jun": JUN}