"""run_agent(person, inputs): Day 5. One call for the backend: portrait, then wishes, with visible steps.
Steps are built from real results (counts, levels, Qloo log), never invented. Never raises."""
import time
import os

try:
    from .qloo_client import QlooClient
    from .portrait import build_portrait
    from .wishes import generate_wishes, FOLLOW_UP
except ImportError:
    from qloo_client import QlooClient
    from portrait import build_portrait
    from wishes import generate_wishes, FOLLOW_UP


def _calls(log, step):
    rows = [l for l in log if l.get("step") == step]
    cached = sum(1 for l in rows if l.get("status") == "cached")
    errors = sum(1 for l in rows if l.get("status") not in ("ok", "cached", "no results"))
    return len(rows), cached, errors


def _step(sid, title, summary, log=None, log_step=None):
    s = {"id": sid, "title": title, "summary": summary, "qloo_calls": None, "cached": None, "errors": None}
    if log is not None and log_step:
        s["qloo_calls"], s["cached"], s["errors"] = _calls(log, log_step)
    return s


def _steps(items, wishes, log):
    told = [i for i in items if i.get("source_label") in ("told", "reacted")]
    likely = [i for i in items if i.get("source_label") == "likely"]
    matched = [i for i in told if i.get("qloo_entity_id")]
    via = [i for i in matched if i.get("resolution_level") == 3]
    missing = [i for i in told if not i.get("qloo_entity_id")]
    tags = sum(len(i.get("tags") or []) for i in items)
    out = [_step("collect", "Collect", f"Gathered {len(told)} names from what the family told us.")]
    if told:
        resolve = (f"Matched {len(matched)} of {len(told)} in Qloo"
                   f"{f' ({len(via)} through an artist or parent)' if via else ''}. "
                   f"{len(missing)} not found in Qloo, kept and labelled." if missing else
                   f"Matched all {len(told)} in Qloo{f' ({len(via)} through an artist or parent)' if via else ''}.")
    else:
        resolve = "Nothing to look up yet."
    out.append(_step("resolve", "Resolve in Qloo", resolve, log, "resolve"))
    out.append(_step("expand", "Expand into taste", f"Collected {tags} taste tags from the matched items."))
    if likely:
        out.append(_step("era", "Fill the gaps", f"Added {len(likely)} items likely from their era and region.", log, "era_place"))
    out.append(_step("build", "Build the portrait",
                     f"Built a portrait of {len(items)} items, each labelled with where it came from and how sure we are."))
    calls, _, errs = _calls(log, "wish_discover")
    disc = [w for w in wishes if w.get("kind") == "discovery"]
    if calls == 0:
        text = "Skipped the taste-graph discovery: no Qloo matches to start from."
    elif errs:
        text = "Qloo discovery was unavailable, so wishes use only what the family told us."
    elif disc:
        text = "Asked Qloo what people with similar taste also love, and found one wish to suggest."
    else:
        text = "Asked Qloo what people with similar taste also love: nothing new beyond what the family told us."
    out.append(_step("discover", "Discover", text, log, "wish_discover"))
    remote = sum(1 for w in wishes if w.get("mode") == "remote")
    out.append(_step("wishes", "Suggest wishes",
                     f"Suggested {len(wishes)} wishes ({remote} remote, {len(wishes) - remote} in person). The family decides."))
    return out


def run_agent(person, inputs, client=None, use_llm=True):
    client = client or QlooClient()
    person, inputs = person or {}, inputs or {}
    t0 = time.time()
    try:
        portrait = build_portrait(person, inputs, client=client)
        t1 = time.time()
        items = portrait.get("items", [])
        polish = use_llm and os.environ.get("WISH_POLISH") == "1"
        wr = generate_wishes(items, person, client=client, use_llm=polish)
        t2 = time.time()
        wishes = wr.get("wishes", [])
        return {"items": items, "wishes": wishes, "follow_up": wr.get("follow_up"),
                "steps": _steps(items, wishes, client.log), "qloo_log": client.log,
                "timings": {"portrait_ms": int((t1 - t0) * 1000), "wishes_ms": int((t2 - t1) * 1000),
                            "total_ms": int((t2 - t0) * 1000)}}
    except Exception:
        return {"items": [], "wishes": [], "follow_up": FOLLOW_UP, "steps": [],
                "qloo_log": client.log, "timings": {}}