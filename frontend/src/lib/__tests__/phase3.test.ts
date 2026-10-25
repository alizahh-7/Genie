import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiError, detailText, errorDetail } from "../errors";
import { api, buildPortrait, generateWishes, getBook, matchAll, orgApi, requestFeedback, sendRequest, withdrawRequest, createPerson, getRequests } from "../api";
import { recompileQuietly } from "../bookSync";
import { orderedAnswers, parseBook, parseVoices, portraitEntry, splitPortrait, wishIsGuess, VOICE_ORDER } from "../bookV3";
import { buildTimeline, canAsk, canComplete, canReport, canWithdraw, completionBody, concernBody, contactAllowed, defaultAskMessage, mergeSuggestions, normStatus, parseRequestRows, STATUS_LABEL, validateMessage, MESSAGE_MAX } from "../makerRequests";
import { buildQuickFacts, failedStage, initialLive, isFinished, runLive, type LiveDeps, type LiveState } from "../liveLearn";
import { buildTasteMap, foundInQloo, pickProvenanceNote, QLOO_GUESS_NOTE, topTagNames } from "../tasteMap";
import { asRole, canEdit, daysLeft, dashboardStats, dashboardStories, expiryText, isExpiringSoon, parseCase, parseHome, portalFailure, privateLink, casePath } from "../org";
import { latestAgentLog } from "../qloo";
import type { PortraitItem, Wish } from "../types";

const stub = (handler: (url: string, init: RequestInit) => Response | Promise<Response>) => { const f = vi.fn(async (u: string, i: RequestInit) => handler(u, i)); vi.stubGlobal("fetch", f); return f; };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
afterEach(() => vi.unstubAllGlobals());

/* ---------- 1. family memories vs guesses ---------- */
describe("Wish Book: memories versus guesses", () => {
  const portrait = [
    { domain: "music", name: "Lag Jaa Gale", tags: ["Ghazal", "Classical", "Urdu", "Hindi", "Old", "Sixth"], tag_count: 6, source: "told", label: "Told by family" },
    { domain: "film", name: "Pakeezah", tags: ["Drama"], source: "reacted", label: "They reacted to this" },
    { domain: "place", name: "Charminar", tags: ["Landmark"], source: "likely", label: "Likely from their era and region" },
    { domain: "food", name: "Some AI idea", tags: [], source: "ai-only", label: "Suggested by AI, not in Qloo" },
    { domain: "food", name: "Mystery", tags: [], source: "", label: "" },
  ];
  it("separates told and reacted from likely and ai-only", () => {
    const s = splitPortrait(portrait);
    expect(s.family.map(x => x.name)).toEqual(["Lag Jaa Gale", "Pakeezah"]);
    expect(s.guesses.map(x => x.name)).toEqual(["Charminar", "Some AI idea"]);
    expect(s.other.map(x => x.name)).toEqual(["Mystery"]);
  });
  it("never turns a guess or an unknown source into family testimony", () => {
    const s = splitPortrait(portrait);
    expect(s.family.some(x => x.source === "likely" || x.source === "ai-only" || x.source === "")).toBe(false);
  });
  it("keeps the backend's readable labels and its tag order, capped at five", () => {
    const e = portraitEntry(portrait[0])!;
    expect(e.label).toBe("Told by family"); expect(e.tags).toEqual(["Ghazal", "Classical", "Urdu", "Hindi", "Old"]); expect(e.tagCount).toBe(6);
  });
  it("falls back to the readable label for older snapshots without `source`", () => {
    expect(portraitEntry({ name: "X", label: "Likely from their era and region" })!.source).toBe("likely");
    expect(portraitEntry({ name: "Y", label: "Told by family" })!.source).toBe("told");
  });
  it("renders voice answers in the order music, food, place, film, joy", () => {
    const a = orderedAnswers({ joy: "J", film: "F", music: "M", place: "P", food: "Fo", extra: "ignored", other: "x" });
    expect(a.map(x => x.key)).toEqual([...VOICE_ORDER]); expect(a.map(x => x.text)).toEqual(["M", "Fo", "P", "F", "J"]);
    expect(orderedAnswers({ place: "P", music: "" }).map(x => x.key)).toEqual(["place"]);
    expect(parseVoices([{ from: "Zara", answers: { joy: "Dancing", music: "Ghazals" } }, { from: "", answers: { music: "x" } }, { from: "Ali", answers: {} }])).toHaveLength(1);
  });
  it("labels a wish as a guess only for likely (or a backend discovery)", () => {
    expect(wishIsGuess({ basis: "likely" })).toBe(true); expect(wishIsGuess({ kind: "discovery" })).toBe(true); expect(wishIsGuess({ basis: "told", kind: null })).toBe(false);
  });
  it("parses the full compiled contract and never carries maker contact", () => {
    const b = parseBook({ content: { title: "Nani's Wish Book", tagline: "t", person: { first_name: "Nani", birth_year: 1948, region: "Hyderabad" }, portrait, themes: ["Music", { name: "Home" }], learned: ["Their world kept returning to Melodious.", "They loved Charminar."], wishes: [{ title: "Sing", description: "d", mode: "in-person", kind: null, basis: "likely", makers: [{ name: "Asha", type: "musician", status: "accepted", is_sample: true, maker_contact: "secret@x.y" }] }], voices: [{ from: "Zara", answers: { music: "Ghazals" } }], notice: "Not a medical service.", generated_at: "2026-10-01T00:00:00Z" } })!;
    expect(b.title).toBe("Nani's Wish Book"); expect(b.personLine).toContain("Nani"); expect(b.themes).toEqual(["Music", "Home"]);
    expect(b.learned).toEqual(["They loved Charminar."]); // Phase 1 filter still applies
    expect(b.wishes[0].guess).toBe(true); expect(b.wishes[0].makers[0]).toEqual({ name: "Asha", type: "musician", status: "accepted", sample: true });
    expect(JSON.stringify(b)).not.toContain("secret@x.y");
    expect(b.notice).toBe("Not a medical service."); expect(b.generatedAt).toBe("2026-10-01T00:00:00Z");
  });
  it("accepts a shared route that returns the content directly, and rejects non-books", () => {
    expect(parseBook({ title: "T", portrait: [] })?.title).toBe("T"); expect(parseBook({ detail: "x" })).toBeNull(); expect(parseBook(null)).toBeNull();
  });
});

/* ---------- 2/3. compile-before-GET and recompile ---------- */
describe("Wish Book compile and refresh", () => {
  it("a Wish Book GET 404 is 'not compiled yet', not 'expired'", async () => {
    stub(() => json(404, { detail: "Not found" }));
    const e = (await getBook("p1").then(() => null, x => x)) as ApiError;
    expect(e.status).toBe(404); expect(e.friendly).toBe("The Wish Book hasn't been compiled yet."); expect(e.friendly).not.toMatch(/expired/i);
  });
  it("compile is a POST to wish-book/compile, and recompileQuietly never throws", async () => {
    const f = stub(() => json(200, {}));
    expect(await recompileQuietly("p1")).toBe(true);
    expect(f.mock.calls[0][0]).toContain("/persons/p1/wish-book/compile"); expect(f.mock.calls[0][1].method).toBe("POST");
    stub(() => json(500, { detail: "boom" })); expect(await recompileQuietly("p1")).toBe(false);
  });
});

/* ---------- 4/5. status mapping, timeline, contact privacy ---------- */
describe("Wish → Maker timeline", () => {
  it("maps every backend status to its label", () => {
    expect(STATUS_LABEL.suggested).toBe("Suggested"); expect(STATUS_LABEL.requested).toBe("Asked"); expect(STATUS_LABEL.accepted).toBe("Accepted"); expect(STATUS_LABEL.done).toBe("Done");
    expect(STATUS_LABEL.declined).toBe("Not going ahead — Declined"); expect(STATUS_LABEL.withdrawn).toBe("Not going ahead — Withdrawn");
    expect(normStatus("REQUESTED")).toBe("requested"); expect(normStatus("weird")).toBe("unknown"); expect(normStatus(undefined)).toBe("unknown");
  });
  const states = (s: unknown) => buildTimeline({ status: s }).stages.map(x => x.state);
  it("never shows an upcoming stage as completed", () => {
    expect(states("suggested")).toEqual(["current", "upcoming", "upcoming", "upcoming"]);
    expect(states("requested")).toEqual(["complete", "current", "upcoming", "upcoming"]);
    expect(states("accepted")).toEqual(["complete", "complete", "current", "upcoming"]);
    expect(states("done")).toEqual(["complete", "complete", "complete", "complete"]);
  });
  it("a match with no status is not progress: unknown shows nothing reached", () => {
    expect(states(undefined)).toEqual(["upcoming", "upcoming", "upcoming", "upcoming"]);
  });
  it("declined and withdrawn stop the path and never reach Accepted or Done", () => {
    for (const s of ["declined", "withdrawn"]) {
      const t = buildTimeline({ status: s, requested_at: "2026-10-01T00:00:00Z" });
      expect(t.stages.map(x => x.state)).toEqual(["complete", "complete", "upcoming", "upcoming"]); expect(t.stopped).toBe(STATUS_LABEL[s as "declined"]);
    }
    expect(buildTimeline({ status: "declined" }).stages[1].state).toBe("upcoming"); // no requested_at, so Asked is not claimed
  });
  it("Done uses responded_at only as a last update, never a completion time", () => {
    const t = buildTimeline({ status: "done", responded_at: "2026-10-05T00:00:00Z" });
    expect(t.stages[3].note).toMatch(/^Last update /); expect(t.stages[3].note).not.toMatch(/complet/i);
    expect(buildTimeline({ status: "done" }).stages[3].note).toBeUndefined();
  });
  it("maker contact is only exposed for accepted and done", () => {
    const base = { maker_id: "m", maker_contact: "call me", name: "A" };
    const rows = parseRequestRows(["suggested", "requested", "declined", "withdrawn", "accepted", "done"].map((status, i) => ({ ...base, maker_id: `m${i}`, status })));
    expect(rows.map(r => [r.status, r.maker_contact])).toEqual([["suggested", undefined], ["requested", undefined], ["declined", undefined], ["withdrawn", undefined], ["accepted", "call me"], ["done", "call me"]]);
    expect(contactAllowed("requested")).toBe(false); expect(contactAllowed("done")).toBe(true);
  });
  it("suggestions without a status come from GET /requests, which wins over matches", () => {
    const rows = parseRequestRows([{ maker_id: "a", status: "requested", name: "A", requested_at: "2026-10-01T00:00:00Z" }]);
    const merged = mergeSuggestions(rows, [{ maker_id: "a", name: "A", score: 0.9 }, { maker_id: "b", name: "B", is_sample: true, reasons: ["r"] }, { name: "no id" }]);
    expect(merged.map(m => [m.maker_id, m.status])).toEqual([["a", "requested"], ["b", "suggested"]]); expect(merged[1].is_sample).toBe(true);
  });
  it("only offers actions the current status allows", () => {
    expect([canAsk("suggested"), canAsk("requested"), canAsk("accepted"), canAsk("declined")]).toEqual([true, false, false, false]);
    expect([canWithdraw("requested"), canWithdraw("suggested"), canWithdraw("done")]).toEqual([true, false, false]);
    expect([canComplete("accepted"), canComplete("requested"), canComplete("done")]).toEqual([true, false, false]);
    expect([canReport("accepted"), canReport("done"), canReport("requested")]).toEqual([true, true, false]);
  });
  it("validates the message length and prefills within the limit", () => {
    expect(validateMessage("hey")).toMatch(/at least 5/); expect(validateMessage("hello")).toBeNull(); expect(validateMessage("x".repeat(MESSAGE_MAX))).toBeNull(); expect(validateMessage("x".repeat(MESSAGE_MAX + 1))).toMatch(/600/);
    expect(validateMessage(defaultAskMessage({ maker: "Asha", person: "Nani", wish: "A ghazal evening" }))).toBeNull();
    expect(defaultAskMessage({ wish: "w".repeat(900) }).length).toBeLessThanOrEqual(MESSAGE_MAX);
  });
  it("completion never sends concern:true; only the explicit concern action does", () => {
    expect(completionBody()).toEqual({ completed: true, concern: false }); expect(completionBody("lovely")).toEqual({ completed: true, concern: false, note: "lovely" });
    expect(completionBody("  ")).not.toHaveProperty("note"); expect(concernBody("x").concern).toBe(true);
  });
});

describe("Wish → Maker requests API", () => {
  it("sends {maker_id, message, family_contact} once and never retries a failed POST", async () => {
    const f = stub(() => { throw new TypeError("network"); });
    const e = await sendRequest("p1", "w1", { maker_id: "m1", message: "hello there", family_contact: "me@x.y" }).then(() => null, x => x);
    expect(e).toBeInstanceOf(ApiError); expect(f).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(f.mock.calls[0][1].body))).toEqual({ maker_id: "m1", message: "hello there", family_contact: "me@x.y" });
  });
  it("a GET may retry once on a network error, a POST may not", async () => {
    const f = stub(() => { throw new TypeError("network"); });
    await getRequests("p1", "w1").catch(() => undefined); expect(f).toHaveBeenCalledTimes(2);
  });
  it("uses the confirmed withdraw and feedback paths", async () => {
    const f = stub(() => json(200, {}));
    await withdrawRequest("p1", "w1", "m1"); await requestFeedback("p1", "w1", "m1", completionBody());
    expect(f.mock.calls[0][0]).toContain("/persons/p1/wishes/w1/requests/m1/withdraw"); expect(f.mock.calls[1][0]).toContain("/persons/p1/wishes/w1/requests/m1/feedback");
    expect(JSON.parse(String(f.mock.calls[1][1].body))).toEqual({ completed: true, concern: false });
  });
  it("surfaces the backend's own detail for 400, 404, 409 and 429", async () => {
    for (const [status, detail] of [[400, "This wish is not eligible for that maker"], [404, "Maker not found"], [409, "Already in progress"], [429, "More than 3 open requests"]] as const) {
      stub(() => json(status, { detail }));
      const e = await sendRequest("p", "w", { maker_id: "m", message: "hello" }).then(() => null, x => x);
      expect(errorDetail(e)).toBe(detail);
    }
  });
});

/* ---------- 7/8. sequential live run, failure and retry ---------- */
describe("Watch Genie Learn: real sequential calls", () => {
  const gate = () => { let go!: (v?: unknown) => void; const p = new Promise(r => { go = r; }); return { p, go }; };
  const mk = (over: Partial<LiveDeps> = {}) => {
    const calls: string[] = []; const states: LiveState[] = [];
    const deps: LiveDeps = {
      createPerson: async () => { calls.push("person"); return { id: "p1" }; },
      buildPortrait: async id => { calls.push(`portrait:${id}`); return { saved: 3, items: [{}, {}, {}], qloo_log: [{}, {}], summary: "Built." }; },
      generateWishes: async id => { calls.push(`wishes:${id}`); return { wishes: [{ id: "w1", title: "One" }, { id: "w2", title: "Two" }], follow_up: "Anything else?", qloo_log: [{}], summary: "Made two." }; },
      onChange: s => states.push(s), errorText: e => (e as Error).message, ...over,
    };
    return { deps, calls, states };
  };
  it("runs person, portrait, wishes strictly in order with real counts", async () => {
    const { deps, calls } = mk(); const out = await runLive(deps, initialLive());
    expect(calls).toEqual(["person", "portrait:p1", "wishes:p1"]); expect(isFinished(out)).toBe(true);
    expect(out.portrait).toEqual({ items: 3, saved: 3, lookups: 2, summary: "Built." }); expect(out.wishes?.count).toBe(2); expect(out.wishes?.lookups).toBe(1); expect(out.wishes?.summary).toBe("Made two."); expect(out.wishes?.followUp).toBe("Anything else?");
    expect(out.wishes?.items).toEqual([{ id: "w1", title: "One" }, { id: "w2", title: "Two" }]);
  });
  it("never starts a stage before the previous response arrived, and marks Completed only after success", async () => {
    const g = gate(); const { deps, calls, states } = mk({ buildPortrait: async id => { calls2.push("portrait-start"); await g.p; calls2.push("portrait-end"); return { items: [], qloo_log: [] }; } });
    const calls2: string[] = []; const run = runLive(deps, initialLive());
    await new Promise(r => setTimeout(r, 10));
    const mid = states[states.length - 1];
    expect(mid.stages.portrait.status).toBe("running"); expect(mid.stages.wishes.status).toBe("waiting"); expect(calls).not.toContain("wishes:p1"); expect(calls2).toEqual(["portrait-start"]);
    g.go(); const out = await run; expect(out.stages.portrait.status).toBe("done"); expect(calls).toContain("wishes:p1");
    // no state ever showed a later stage as done while an earlier one was not
    for (const s of states) { if (s.stages.wishes.status === "done") expect(s.stages.portrait.status).toBe("done"); if (s.stages.portrait.status === "done") expect(s.stages.person.status).toBe("done"); }
  });
  it("on portrait failure keeps the person id, stops, and retry does not create a second person", async () => {
    let fail = true; const { deps, calls } = mk({ buildPortrait: async id => { calls.push(`portrait:${id}`); if (fail) throw new Error("Qloo timed out (504)"); return { items: [{}], qloo_log: [] }; } });
    const first = await runLive(deps, initialLive());
    expect(failedStage(first)).toBe("portrait"); expect(first.personId).toBe("p1"); expect(first.stages.portrait.error).toBe("Qloo timed out (504)"); expect(first.stages.wishes.status).toBe("waiting"); expect(calls).toEqual(["person", "portrait:p1"]);
    fail = false; const second = await runLive(deps, first);
    expect(calls.filter(c => c === "person")).toHaveLength(1); expect(isFinished(second)).toBe(true);
  });
  it("on wish failure keeps the completed portrait and a retry only repeats the wishes call", async () => {
    let fail = true; const { deps, calls } = mk({ generateWishes: async id => { calls.push(`wishes:${id}`); if (fail) throw new Error("No portrait yet"); return { wishes: [{}], qloo_log: [] }; } });
    const first = await runLive(deps, initialLive());
    expect(failedStage(first)).toBe("wishes"); expect(first.stages.portrait.status).toBe("done"); expect(first.portrait?.items).toBe(3);
    fail = false; const second = await runLive(deps, first);
    expect(calls.filter(c => c.startsWith("portrait"))).toHaveLength(1); expect(calls.filter(c => c === "person")).toHaveLength(1); expect(second.wishes?.count).toBe(1);
  });
  it("a person that fails to create leaves nothing to retry against and no later stage runs", async () => {
    const { deps, calls } = mk({ createPerson: async () => { throw new Error("Too many requests"); } });
    const out = await runLive(deps, initialLive()); expect(out.personId).toBeNull(); expect(failedStage(out)).toBe("person"); expect(calls).toEqual([]);
  });
  it("resuming an existing person skips creation", async () => {
    const { deps, calls } = mk(); await runLive(deps, initialLive("existing")); expect(calls[0]).toBe("portrait:existing");
  });
  it("caps quick facts at 30 and sends only domain and name", () => {
    const f = Array.from({ length: 40 }, (_, i) => ({ domain: "music", name: `s${i}`, extra: 1 })); const q = buildQuickFacts(f);
    expect(q).toHaveLength(30); expect(Object.keys(q[0])).toEqual(["domain", "name"]);
  });
  it("posts to the confirmed endpoints without retrying", async () => {
    const f = stub(() => json(200, { id: "p9", items: [], wishes: [], results: [] }));
    await createPerson({ first_name: "A" }); await buildPortrait("p9", [{ domain: "music", name: "x" }]); await generateWishes("p9"); await matchAll("p9", 99);
    expect(f.mock.calls.map(c => c[0].replace(/^https?:\/\/[^/]+/, ""))).toEqual(["/persons", "/persons/p9/portrait/build", "/persons/p9/wishes/generate", "/persons/p9/match-all?limit=10"]);
    expect(JSON.parse(String(f.mock.calls[1][1].body))).toEqual({ quick_facts: [{ domain: "music", name: "x" }] }); expect(f.mock.calls[2][1].body).toBeUndefined();
    stub(() => { throw new TypeError("net"); }); const g = vi.mocked(fetch); await buildPortrait("p9", []).catch(() => undefined); expect(g).toHaveBeenCalledTimes(1);
  });
  it("shows the backend's own text for 502, 503, 504, 429 and 409", async () => {
    for (const [status, detail] of [[502, "Qloo is unreachable"], [503, "Agent unavailable"], [504, "Portrait build timed out"], [429, "Slow down"], [409, "Build the portrait first"]] as const) {
      stub(() => json(status, { detail })); expect(errorDetail(await generateWishes("p").then(() => null, x => x))).toBe(detail);
    }
  });
});

/* ---------- 9. taste map provenance ---------- */
describe("Taste Map", () => {
  const it0 = (o: Partial<PortraitItem> & Record<string, unknown>): PortraitItem => ({ id: "1", domain: "music", name: "Lag Jaa Gale", tags: [], source_label: "told", confidence: 1, resolution_level: 1, matched_name: null, ...o } as PortraitItem);
  const wish = (o: Partial<Wish> & Record<string, unknown>): Wish => ({ id: "w", title: "A wish", description: "", mode: "remote", kind: null, maker_type: null, basis: null, why: null, affinity: null, tags: [], ...o } as Wish);
  const items = [
    it0({ id: "1", name: "Lag Jaa Gale", qloo_entity_id: "q1", top_tags: [{ name: "Ghazal" }, "Classical", { name: "ghazal" }, "A", "B", "C"], matched_name: "Lag Jaa Gale (1964)" }),
    it0({ id: "2", name: "Biryani", domain: "food", qloo_entity_id: null, top_tags: ["Spicy"] }),
    it0({ id: "3", name: "Charminar", domain: "place", source_label: "likely", qloo_entity_id: "q3", top_tags: ["Landmark"] }),
    it0({ id: "4", name: "Pakeezah", domain: "film", source_label: "reacted", qloo_entity_id: "q4", top_tags: ["Drama"] }),
  ];
  it("builds favourites from told and reacted only, with their strongest tags (max five, no duplicates)", () => {
    const m = buildTasteMap("Nani", items, []);
    expect(m.favourites.map(f => f.name)).toEqual(["Lag Jaa Gale", "Biryani", "Pakeezah"]); expect(m.favourites.some(f => f.name === "Charminar")).toBe(false);
    expect(m.favourites[0].tags.map(t => t.name)).toEqual(["Ghazal", "Classical", "A", "B", "C"]); expect(topTagNames({ top_tags: ["a", "a", "b"] })).toEqual(["a", "b"]);
  });
  it("marks Qloo support only from qloo_entity_id, and shows 'Matched via' only when the name differs", () => {
    const m = buildTasteMap("Nani", items, []);
    expect(m.favourites.map(f => f.inQloo)).toEqual([true, false, true]); expect(m.favourites[0].matchedVia).toBe("Lag Jaa Gale (1964)"); expect(m.favourites[2].matchedVia).toBeNull();
    expect(m.tags.find(t => t.name === "Spicy")?.qloo).toBe(false); expect(m.tags.find(t => t.name === "Ghazal")?.qloo).toBe(true); expect(foundInQloo({ qloo_entity_id: "  " })).toBe(false);
  });
  it("discoveries need kind=discovery and a named `discovered`; Qloo support needs Qloo evidence", () => {
    const m = buildTasteMap("Nani", items, [wish({ id: "a", kind: "discovery", discovered: "Mehdi Hassan", title: "Try a ghazal", tags: [{ name: "Ghazal", id: "urn:1" }] }), wish({ id: "b", kind: "discovery", discovered: "Textonly", tags: [{ name: "Zzz" }] }), wish({ id: "c", kind: "discovery" }), wish({ id: "d", discovered: "NotADiscovery" })]);
    expect(m.discoveries.map(d => d.discovered)).toEqual(["Mehdi Hassan", "Textonly"]);
    expect(m.discoveries[0].qloo).toBe(true); expect(m.discoveries[0].sharedTags).toEqual(["Ghazal"]); expect(m.discoveries[1].qloo).toBe(false); expect(m.discoveries[1].sharedTags).toEqual([]);
  });
  it("partial data never fabricates nodes", () => {
    const m = buildTasteMap("Nani", [], null);
    expect(m.favourites).toEqual([]); expect(m.tags).toEqual([]); expect(m.discoveries).toEqual([]); expect(m.missing).toEqual({ favourites: true, tags: true, discoveries: true });
    const noTags = buildTasteMap("Nani", [it0({ qloo_entity_id: "q" })], []); expect(noTags.favourites).toHaveLength(1); expect(noTags.missing.tags).toBe(true);
  });
  it("uses a short provenance line from /meta/notices when there is one", () => {
    expect(pickProvenanceNote({ labels: { discovery_note: "Qloo's guess, not family testimony." } })).toBe("Qloo's guess, not family testimony.");
    expect(pickProvenanceNote({ medical_disclaimer: "Not medical." })).toBe(QLOO_GUESS_NOTE); expect(pickProvenanceNote(undefined)).toBe(QLOO_GUESS_NOTE);
  });
});

/* ---------- 10. demo replay vs live ---------- */
describe("Demo replay versus live process", () => {
  it("the demo replay reads the saved agent row, and live runs use no saved log", () => {
    const rows = [{ step: "other", log: {}, created_at: "1" }, { step: "agent", log: { steps: [{ id: "a", title: "T", summary: "S", qloo_calls: 2, cached: false, errors: null }], qloo_log: [{}] }, created_at: "2" }];
    expect(latestAgentLog(rows)?.steps?.[0].title).toBe("T"); expect(latestAgentLog([])).toBeNull();
    const fresh = initialLive(); expect(Object.values(fresh.stages).every(s => s.status === "waiting")).toBe(true); // a new person starts empty: nothing is replayed
  });
});

/* ---------- 11/12. organisation portal ---------- */
describe("Organisation portal", () => {
  it("a viewer is read-only and never receives person_id or family_page", () => {
    const viewer = parseCase({ story: { first_name: "A", person_id: "P", family_page: "/person/P" }, person_id: "P", role: "viewer", can_edit: false, wishes: [] });
    expect(viewer.canEdit).toBe(false); expect(viewer.person_id).toBeUndefined(); expect(viewer.family_page).toBeUndefined();
    const coord = parseCase({ story: { first_name: "A", person_id: "P", family_page: "/person/P" }, role: "coordinator", can_edit: true, wishes: [{ id: "w" }] });
    expect(coord.canEdit).toBe(true); expect(coord.person_id).toBe("P"); expect(coord.family_page).toBe("/person/P"); expect(coord.wishes).toHaveLength(1);
  });
  it("the backend's can_edit wins; otherwise only viewers and unknown roles are read-only", () => {
    expect(canEdit({ can_edit: false, role: "coordinator" })).toBe(false); expect(canEdit({ can_edit: true, role: "viewer" })).toBe(true);
    expect(canEdit({ role: "volunteer" })).toBe(true); expect(canEdit({ role: "viewer" })).toBe(false); expect(canEdit({})).toBe(false); expect(asRole("Coordinator")).toBe("coordinator"); expect(asRole("admin")).toBeNull();
  });
  it("parses the portal home including the Sample flag", () => {
    const h = parseHome({ organisation: { org_name: "Rose Hospice", kind: "hospice", city: "Hyderabad", country: "India", is_sample: true }, member: { name: "Dr A", role: "viewer" }, can_edit: false });
    expect(h).toMatchObject({ orgName: "Rose Hospice", sample: true, role: "viewer", canEdit: false, place: "Hyderabad, India" }); expect(parseHome({}).sample).toBe(false);
  });
  it("a 404 on the portal is 'This link is not valid.', a 403 is a permission restriction", async () => {
    stub(() => json(404, { detail: "nope" }));
    const e404 = (await orgApi("tok", "", { notFound: { message: "This link is not valid.", code: "org-invalid" } }).then(() => null, x => x)) as ApiError;
    expect(e404.friendly).toBe("This link is not valid."); expect(e404.code).toBe("org-invalid");
    stub(() => json(403, { detail: "Viewers cannot edit" }));
    const e403 = (await orgApi("tok", "/cases", { method: "POST", body: {} }).then(() => null, x => x)) as ApiError;
    expect(e403.status).toBe(403); expect(e403.code).toBeUndefined(); expect(errorDetail(e403)).toBe("Viewers cannot edit");
    expect(portalFailure(404)).toBe("invalid-link"); expect(portalFailure(403)).toBe("forbidden"); expect(portalFailure(500)).toBe("other");
  });
  it("sends the token only in the path, with no referrer, and never retries writes", async () => {
    const f = stub(() => { throw new TypeError("net"); });
    await orgApi("secret-token", "/cases", { method: "POST", body: { first_name: "A" } }).catch(() => undefined); expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toContain("/org-portal/secret-token/cases"); expect(f.mock.calls[0][1].referrerPolicy).toBe("no-referrer");
    expect(String(f.mock.calls[0][1].body)).not.toContain("secret-token");
  });
  it("shows only the totals the backend sent, and the average only when it is a number", () => {
    const a = dashboardStats({ totals: { stories_open: 3, stories_paused: 1, wishes: 7, requested: 2, accepted: 1, done: 0, avg_hours_to_reply: 5.25 } });
    expect(a.stats.map(s => [s.label, s.value])).toEqual([["Stories open", 3], ["Stories paused", 1], ["Wishes", 7], ["Awaiting maker reply", 2], ["Accepted", 1], ["Done", 0]]); expect(a.avgHours).toBe(5.25);
    const b = dashboardStats({ totals: { wishes: 1, avg_hours_to_reply: null } }); expect(b.stats).toHaveLength(1); expect(b.avgHours).toBeNull();
    expect(dashboardStats(null)).toEqual({ stats: [], avgHours: null });
  });
  it("lists stories by case_key and highlights fewer than ten days left", () => {
    const now = Date.parse("2026-10-24T00:00:00Z"); const day = (n: number) => new Date(now + n * 86400000).toISOString();
    expect(daysLeft(day(9), now)).toBe(9); expect(isExpiringSoon(9)).toBe(true); expect(isExpiringSoon(10)).toBe(false); expect(isExpiringSoon(null)).toBe(false);
    expect(expiryText(1)).toBe("1 day left"); expect(expiryText(0)).toBe("Expires today"); expect(expiryText(-2)).toBe("Expired"); expect(expiryText(null)).toBe("");
    const s = dashboardStories({ stories: [{ case_key: "k1", first_name: "A", reference: "Story A", wishes: 2, next_step: "Ask a maker" }, { first_name: "no key" }] });
    expect(s).toHaveLength(1); expect(s[0].case_key).toBe("k1");
    expect(casePath("tok", "k1")).not.toMatch(/person/i);
  });
  it("shows a returned private link from whichever field carried it", () => {
    expect(privateLink({ link: "https://x.test/org/abc" }, "https://g.test")).toBe("https://x.test/org/abc"); expect(privateLink({ path: "/org/abc" }, "https://g.test")).toBe("https://g.test/org/abc");
    expect(privateLink({ token: "abc" }, "https://g.test")).toBe("https://g.test/org/abc"); expect(privateLink({}, "https://g.test")).toBeNull();
  });
  it("renders 422 validation details from FastAPI", async () => {
    expect(detailText([{ loc: ["body", "reference"], msg: "field required" }])).toBe("reference: field required"); expect(detailText("plain")).toBe("plain"); expect(detailText(undefined)).toBeUndefined();
    stub(() => json(422, { detail: [{ loc: ["body", "consent_confirmed"], msg: "must be true" }] }));
    expect(errorDetail(await api("/x", { method: "POST", body: {} }).then(() => null, x => x))).toBe("consent_confirmed: must be true");
  });
});
