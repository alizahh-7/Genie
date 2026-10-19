import os, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from engine_cache_store import safe_path

base = tempfile.mkdtemp()
cases = [("ab12.json", True), ("sub/ab12.json", True), ("../x.json", False), ("a/../../x", False),
         ("/etc/x", False), ("a\\b.json", False), ("C:x.json", False), ("", False)]
bad = 0
for key, should_pass in cases:
    got = safe_path(key, base) is not None
    if got != should_pass:
        bad += 1
        print("FAIL", repr(key))
print(f"{len(cases) - bad} of {len(cases)} passed")
sys.exit(1 if bad else 0)