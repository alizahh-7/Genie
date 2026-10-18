import os, time, requests
from dotenv import load_dotenv
load_dotenv()
key = os.environ["LLM_API_KEY"]
base = os.environ.get("LLM_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai").rstrip("/")
H = {"Authorization": f"Bearer {key}"}
t = time.time()
try:
    r = requests.get(base + "/models", headers=H, timeout=30)
    print("models", r.status_code, round(time.time() - t, 1), "s")
    for m in r.json().get("data", []):
        print("  ", m["id"])
except Exception as e:
    print("models error:", e)
model = os.environ.get("LLM_MODEL")
for extra in ({}, {"reasoning_effort": "none"}):
    t = time.time()
    try:
        r = requests.post(base + "/chat/completions", headers={**H, "Content-Type": "application/json"},
                          json={"model": model, "messages": [{"role": "user", "content": 'Reply with JSON {"ok": true}'}], **extra},
                          timeout=60)
        print(extra, r.status_code, round(time.time() - t, 1), "s", r.text[:200])
    except Exception as e:
        print(extra, "error:", e, round(time.time() - t, 1), "s")