import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent / "engine"))
import qloo_client
print(qloo_client.__file__)
print("has filter:", hasattr(qloo_client, "_DROP_TAG_NAMES"))
print(qloo_client.clean_tags({"tags": [{"name": "Old age", "tag_id": "a", "type": "x"},
                                       {"name": "Rock", "tag_id": "b", "type": "x"}]}))