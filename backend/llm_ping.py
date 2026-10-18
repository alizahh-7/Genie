import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent / "engine"))
import llm
print(llm.chat_json('Reply with JSON only: {"ok": true}', "ping"))