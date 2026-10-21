"""Save-as-PDF check. Makes ONE fictional person whose favourites are typed in Hindi, Korean and Arabic
script, opens the printable Wish Book in your browser, waits while you save it as a PDF, then revokes the
share link and deletes the person.
    python pdf_check.py                              (server on http://127.0.0.1:8000)
    python pdf_check.py https://your-api.onrender.com
"""
import re
import sys
import webbrowser

import requests

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000").rstrip("/")
S = requests.Session()

# Favourites in three non-Latin scripts, written as escape codes so the file has no encoding problems.
FACTS = [
    {"domain": "music", "name": "\u0915\u093f\u0936\u094b\u0930 \u0915\u0941\u092e\u093e\u0930"},  # Hindi
    {"domain": "music", "name": "\ubc29\ud0c4\uc18c\ub144\ub2e8"},                                  # Korean
    {"domain": "music", "name": "\u0641\u064a\u0631\u0648\u0632"},                                  # Arabic
    {"domain": "food", "name": "\u0939\u0932\u0940\u092e"},                                          # Hindi dish
    {"domain": "place", "name": "\ubd80\uc0b0"},                                                      # Korean place
]


def jbody(r):
    try:
        return r.json()
    except Exception:
        return None


def find_token(d, kind):
    if isinstance(d, dict):
        for k in ("token", "share_token", "book_token", "invite_token"):
            if isinstance(d.get(k), str):
                return d[k]
        for v in d.values():
            if isinstance(v, str):
                m = re.search(r"/" + kind + r"/([A-Za-z0-9_\-]{16,})", v)
                if m:
                    return m.group(1)
            elif isinstance(v, dict):
                t = find_token(v, kind)
                if t:
                    return t
    return None


def ok(label, r):
    print(f"{label}: HTTP {r.status_code}")
    if r.status_code not in (200, 201):
        print("   ", r.text[:200])
        return False
    return True


def main():
    print("server:", BASE)
    r = S.post(BASE + "/persons", timeout=60,
               json={"first_name": "Pdf", "birth_year": 1950, "region": "Hyderabad", "language": "Hindi"})
    if r.status_code != 200:
        print("Could not create the test person: HTTP", r.status_code, r.text[:200])
        if r.status_code == 429:
            print("Rate limit reached. Wait 10 minutes and run this again.")
        return
    b = jbody(r) or {}
    if isinstance(b.get("person"), dict):
        b = b["person"]
    pid = b.get("id") or b.get("person_id")
    if not pid:
        print("No person id found in the response:", r.text[:200])
        return
    shared = False
    try:
        print("Building the person (this can take up to 30 seconds)...")
        if not ok("1/3 agent run", S.post(f"{BASE}/persons/{pid}/agent/run", json={"quick_facts": FACTS}, timeout=150)):
            return
        if not ok("2/3 compile Wish Book", S.post(f"{BASE}/persons/{pid}/wish-book/compile", timeout=60)):
            return
        r = S.post(f"{BASE}/persons/{pid}/wish-book/share", timeout=60)
        if not ok("3/3 share link", r):
            return
        shared = True
        tok = find_token(jbody(r), "book")
        if not tok:
            print("No share token found in the response:", r.text[:200])
            return
        url = f"{BASE}/book/{tok}/print"
        print("\nOpening this page in your browser. If nothing opens, copy this line into Chrome or Edge:")
        print("   " + url)
        webbrowser.open(url)
        input("\nNow do the PDF steps. When you have looked at the PDF, come back here and press Enter to clean up... ")
    finally:
        if shared:
            S.delete(f"{BASE}/persons/{pid}/wish-book/share", timeout=60)
        r1 = S.delete(f"{BASE}/persons/{pid}", timeout=60)
        r2 = S.get(f"{BASE}/persons/{pid}", timeout=60)
        gone = r1.status_code in (200, 204) and r2.status_code == 404
        print("Cleanup:", "link revoked, test person deleted." if gone else f"CHECK THE DATABASE, person left behind: {pid}")


if __name__ == "__main__":
    main()