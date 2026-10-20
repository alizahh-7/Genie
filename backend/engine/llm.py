"""Small LLM helper (Day 2-3). Optional: if LLM_API_KEY is missing every function returns None
and the engine falls back to local rules, so the demo never depends on it.

Works with any OpenAI-compatible chat endpoint (Gemini free tier, Groq, OpenRouter...).
.env: LLM_API_KEY, LLM_MODEL, LLM_BASE_URL, optional LLM_TIMEOUT (seconds, default 10)."""
import hashlib
import json
import os
import re
import time

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

DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta/openai"
DEFAULT_MODEL = "gemini-3.1-flash-lite"   # change in .env; run llm_probe.py to find a fast one
BREAKER_SECONDS = 60

_down_until = 0.0   # circuit breaker: after one failure, skip the LLM for BREAKER_SECONDS


def _trip():
    global _down_until
    _down_until = time.time() + BREAKER_SECONDS


def chat_json(system, user, max_tokens=1000, timeout=None, cache=True):
    key = os.environ.get("LLM_API_KEY")
    if not key:
        return None
    base = os.environ.get("LLM_BASE_URL", DEFAULT_BASE).rstrip("/")
    model = os.environ.get("LLM_MODEL", DEFAULT_MODEL)
    timeout = timeout or float(os.environ.get("LLM_TIMEOUT", "8"))

    # 1. cache first (works even while the breaker is open)
    ck = hashlib.sha1((model + system + user).encode()).hexdigest()
    f = CACHE_DIR / f"llm_{ck}.json"
    if cache and f.exists():
        try:
            return json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            pass

    # 2. breaker: the LLM failed recently, do not make the user wait again
    if time.time() < _down_until:
        return None

    # 3. real call, one retry on timeout/network error (free tiers have latency spikes)
    body = {"model": model, "max_tokens": max_tokens, "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": system},
                         {"role": "user", "content": user}]}
    effort = os.environ.get("LLM_REASONING_EFFORT")   # optional, e.g. "none" or "low"
    if effort:
        body["reasoning_effort"] = effort
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    for attempt in range(2):
        try:
            r = requests.post(base + "/chat/completions", headers=headers, json=body, timeout=timeout)
        except requests.RequestException as e:
            print(f"  [llm] attempt {attempt + 1} failed: {type(e).__name__}")
            continue
        if r.status_code != 200:
            print(f"  [llm] HTTP {r.status_code}: {r.text[:200]}")
            if r.status_code in (429, 500, 502, 503) and attempt == 0:
                time.sleep(1)
                continue
            break
        try:
            text = r.json()["choices"][0]["message"]["content"] or ""
            text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
            data = json.loads(text)
        except Exception as e:
            print(f"  [llm] bad response: {e}")
            break
        if cache:
            f.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        return data
    _trip()
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
              "Use the original spelling; transliterate non-Latin names into Latin letters. "
              "Drop honorifics and titles such as sahab, ji, saab, garu, amma, appa (write 'Rafi', not 'Rafi sahab').")
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