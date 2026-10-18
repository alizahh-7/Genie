import os, time, requests
from dotenv import load_dotenv
load_dotenv()
key = os.environ["LLM_API_KEY"]
base = os.environ.get("LLM_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai").rstrip("/")
for model in ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-flash-lite-latest",
              "gemini-2.5-flash-lite", "gemini-3.5-flash", "gemini-flash-latest"]:
    t = time.time()
    try:
        r = requests.post(base + "/chat/completions",
                          headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                          json={"model": model, "response_format": {"type": "json_object"},
                                "messages": [{"role": "user", "content": 'Reply with JSON {"ok": true}'}]},
                          timeout=30)
        print(f"{model:28s} {r.status_code} {time.time() - t:5.1f}s  {r.text[:70] if r.status_code != 200 else 'ok'}")
    except Exception as e:
        print(f"{model:28s} error after {time.time() - t:.1f}s: {type(e).__name__}")