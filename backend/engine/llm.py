"""Small LLM helper (Day 2-3). Optional: if LLM_API_KEY is missing every function returns None
and the engine falls back to local rules, so the demo never depends on it."""
import hashlib
import json
import os
import re

import requests

try:
    from .qloo_client import CACHE_DIR
except ImportError:
    from qloo_client import CACHE_DIR

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


def chat_json(system, user, max_tokens=500, timeout=15):
    key = os.environ.get("LLM_API_KEY")
    if not key:
        return None
    ck = hashlib.sha1((system + user).encode()).hexdigest()
    f = CACHE_DIR / f"llm_{ck}.json"
    if f.exists():
        try:
            return json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            pass
    try:
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": key, "anthropic-version": "2023-06-01",
                     "content-type": "application/json"},
            json={"model": os.environ.get("LLM_MODEL", "claude-haiku-5-5"),
                  "max_tokens": max_tokens, "system": system,
                  "messages": [{"role": "user", "content": user}]},
            timeout=timeout)
        if r.status_code != 200:
            return None
        text = "".join(b.get("text", "") for b in r.json().get("content", []))
        text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
        data = json.loads(text)
        f.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        return data
    except Exception:
        return None


def suggest_alternates(name, domain, region="", language=""):
    """Level 2 and 3 helper. Returns {'alternates': [...], 'parent': '...'} or None."""
    system = ("You help match names of songs, artists, dishes, places and films to a database. "
              "Reply with JSON only, no prose: "
              '{"alternates": [up to 4 other spellings, transliterations or official titles], '
              '"parent": "the main artist or composer for a song, the broader cuisine for a dish, '
              'the city or region for a place, or empty string"}')
    user = f"Name: {name}\nType: {domain}\nPerson's region: {region}\nPerson's language: {language}"
    return chat_json(system, user)


def extract_items(text, domain_hint=None):
    """Turn a free-text circle answer into names. Returns [{'name','domain'}] or None."""
    system = ("Extract names of specific songs, singers, films, dishes or places that are literally "
              "mentioned in the text. Never invent any. Reply with JSON only: "
              '{"items": [{"name": "...", "domain": "music|food|place|film"}]} (max 6 items). '
              "Use the original spelling; transliterate non-Latin names into Latin letters.")
    user = f"Question type: {domain_hint or 'unknown'}\nText: {text}"
    data = chat_json(system, user)
    if not isinstance(data, dict):
        return None
    out = []
    for it in data.get("items", [])[:6]:
        if isinstance(it, dict) and it.get("name"):
            out.append({"name": str(it["name"])[:80],
                        "domain": it.get("domain") if it.get("domain") in
                        ("music", "food", "place", "film") else (domain_hint or "other")})
    return out