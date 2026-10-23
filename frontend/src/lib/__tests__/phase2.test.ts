import { describe, it, expect } from "vitest";
import { counterParts, deriveCounters, hasQlooTags, isQlooDiscovery, isQlooMaker, isQlooResolved, isQlooTag, latestAgentLog, qlooTagNames, reactionQlooCalls } from "../qloo";
import { genericLimits, normalizeWish, normalizeWishes, readEvidence, scoreMetrics } from "../compareModel";
import { clampStep, countWord, parsePersonParam, parseStep, pickPersona, stepTitle, toldPhrase } from "../story";
import type { AgentLog, PortraitItem, Wish } from "../types";

const item = (o: Partial<PortraitItem> = {}): PortraitItem => ({ id: "1", domain: "music", name: "Song", tags: [], source_label: "told", confidence: 0.9, resolution_level: 1, matched_name: null, ...o });
const wish = (o: Partial<Wish> = {}): Wish => ({ id: "w", title: "T", description: "D", mode: "remote", kind: null, maker_type: null, basis: null, why: null, affinity: null, tags: [], ...o });

describe("Qloo provenance", () => {
  it("treats levels 1-4 as Qloo-resolved and 5/6/unknown/ai-only as not", () => {
    expect([1, 2, 3, 4].every(l => isQlooResolved(item({ resolution_level: l })))).toBe(true);
    expect([5, 6, 0, 7].some(l => isQlooResolved(item({ resolution_level: l })))).toBe(false);
    expect(isQlooResolved(item({ source_label: "ai-only", resolution_level: 2 }))).toBe(false);
    expect(isQlooResolved({ resolution_level: undefined as unknown as number, source_label: "told" })).toBe(false);
  });
  it("marks tags only with an id, a taste/qloo type, or corroboration from a resolved item", () => {
    expect(isQlooTag({ name: "x", id: "urn:tag:1" })).toBe(true);
    expect(isQlooTag({ name: "x", type: "taste" })).toBe(true);
    expect(isQlooTag({ name: "x" })).toBe(false);
    expect(isQlooTag("x")).toBe(false);
    const known = qlooTagNames([item({ tags: [{ name: "Ghazal" }] }), item({ resolution_level: 5, tags: [{ name: "Ignored" }] })]);
    expect(isQlooTag("ghazal", known)).toBe(true);
    expect(isQlooTag({ name: "Ignored" }, known)).toBe(false);
    expect(hasQlooTags([{ name: "a" }, { name: "b", id: "urn:1" }])).toBe(true);
  });
  it("counts a discovery as Qloo-based only with Qloo evidence", () => {
    expect(isQlooDiscovery({ kind: "discovery", tags: [{ name: "a", id: "urn:1" }] })).toBe(true);
    expect(isQlooDiscovery({ kind: "discovery", tags: [], affinity: "0.8" })).toBe(true);
    expect(isQlooDiscovery({ kind: "discovery", tags: [{ name: "a" }] })).toBe(false);
    expect(isQlooDiscovery({ kind: "told", tags: [{ name: "a", id: "urn:1" }] })).toBe(false);
  });
  it("never marks text, type, mixed or unknown maker matches", () => {
    expect(isQlooMaker({ basis: "qloo" })).toBe(true);
    for (const b of ["text", "type", "text+type", "qloo+text", "mystery", "", undefined]) expect(isQlooMaker({ basis: b })).toBe(false);
  });
  it("reads Qloo learning only from the response itself", () => {
    expect(reactionQlooCalls({ message: "ok" })).toBeNull();
    expect(reactionQlooCalls({ qloo_calls: 3 })).toBe(3);
    expect(reactionQlooCalls({ qloo_calls: 0 })).toBeNull();
    expect(reactionQlooCalls({ qloo_log: [{}, {}] })).toBe(2);
    expect(reactionQlooCalls(null)).toBeNull();
  });
});

describe("Qloo counters", () => {
  const rows = [{ step: "a", request: "/search", status: "200", ms: 1 }, { step: "a", request: "/insights", status: "200", ms: 2 }];
  it("uses qloo_log once and never adds step totals on top", () => {
    const log: AgentLog = { steps: [{ id: "s", title: "t", summary: "", qloo_calls: 5, cached: null, errors: null }], qloo_log: rows };
    expect(deriveCounters({ log }).lookups).toBe(2);
  });
  it("falls back to step totals when no rows were logged", () => {
    const log: AgentLog = { steps: [{ id: "a", title: "", summary: "", qloo_calls: 3, cached: null, errors: null }, { id: "b", title: "", summary: "", qloo_calls: 4, cached: null, errors: null }] };
    expect(deriveCounters({ log }).lookups).toBe(7);
  });
  it("is null (omitted) when nothing can be derived, 0 for an empty log", () => {
    expect(deriveCounters({}).lookups).toBeNull();
    expect(deriveCounters({ log: { steps: [] } }).lookups).toBeNull();
    expect(deriveCounters({ log: { steps: [], qloo_log: [] } }).lookups).toBe(0);
    expect(deriveCounters({ log: null, items: null, wishes: null })).toEqual({ lookups: null, tasteLinks: null, discoveries: null });
  });
  it("counts taste links only on Qloo-resolved items, unique per item", () => {
    const items = [item({ tags: [{ name: "A" }, { name: "a" }, { name: "B" }] }), item({ id: "2", resolution_level: 5, tags: [{ name: "C" }] }), item({ id: "3", source_label: "likely", resolution_level: 3, tags: [{ name: "D" }] })];
    expect(deriveCounters({ items }).tasteLinks).toBe(3);
  });
  it("counts discoveries from backend kind plus Qloo evidence", () => {
    const wishes = [wish({ kind: "discovery", tags: [{ name: "x", id: "urn:1" }] }), wish({ id: "2", kind: "discovery", tags: [{ name: "y" }] }), wish({ id: "3" })];
    expect(deriveCounters({ wishes, items: [] }).discoveries).toBe(1);
  });
  it("phrases only real, non-zero metrics", () => {
    expect(counterParts({ lookups: 9, tasteLinks: 61, discoveries: 1 })).toEqual(["9 Qloo lookups", "61 taste links", "1 discovery"]);
    expect(counterParts({ lookups: 1, tasteLinks: 0, discoveries: null })).toEqual(["1 Qloo lookup"]);
    expect(counterParts({ lookups: null, tasteLinks: null, discoveries: null })).toEqual([]);
  });
  it("picks the latest agent run from the agent-log rows", () => {
    const a: AgentLog = { steps: [], qloo_log: [{ step: "x", request: "r", status: "1", ms: 1 }] };
    const b: AgentLog = { steps: [] };
    expect(latestAgentLog([{ step: "agent", log: a }, { step: "other", log: b }, { step: "agent", log: b }])).toBe(b);
    expect(latestAgentLog([{ step: "other", log: a }])).toBeNull();
    expect(latestAgentLog(undefined)).toBeNull();
  });
});

describe("compare model", () => {
  it("reads only real evidence numbers and omits missing ones", () => {
    const m = scoreMetrics(readEvidence({ genie_wishes_with_taste_tags: 4, genie_wishes: 5, genie_told_items_found_in_qloo: 3, genie_told_items: 3, genie_qloo_calls: 9, generic_wishes: 5 }));
    expect(m.map(x => [x.key, x.value, x.of])).toEqual([["tags", 4, 5], ["told", 3, 3], ["calls", 9, undefined], ["generic", 5, undefined]]);
    expect(scoreMetrics(readEvidence({ genie_qloo_calls: 0 })).map(x => x.value)).toEqual([0]); // a real zero is kept
    expect(scoreMetrics(readEvidence({ genie_qloo_calls: "9", other: 1 }))).toEqual([]);
    expect(scoreMetrics(readEvidence(undefined))).toEqual([]);
    expect(readEvidence({ genie: { genie_qloo_calls: 2 } }).qlooCalls).toBe(2);
  });
  it("normalises wishes defensively and drops unreadable rows", () => {
    expect(normalizeWish(null)).toBeNull(); expect(normalizeWish({ foo: 1 })).toBeNull(); expect(normalizeWish("  ")).toBeNull();
    const w = normalizeWish({ title: " Sing ", description: "Together", basis: "told", maker_type: "musician", kind: "discovery", tags: [{ name: "Ghazal", id: "urn:1" }, "calm", { name: "Hyderabad" }, { name: "Dum" }] })!;
    expect(w.title).toBe("Sing"); expect(w.provenance).toBe("told"); expect(w.makerType).toBe("Musician");
    expect(w.tags.length).toBe(3); expect(w.discovery).toBe(true); expect(w.qlooDiscovery).toBe(true);
    expect(normalizeWishes("nope")).toEqual([]);
  });
  it("marks a guess as a guess and unknown labels as neither", () => {
    expect(normalizeWish({ title: "a", basis: "likely" })!.provenance).toBe("guess");
    expect(normalizeWish({ title: "a" })!.provenance).toBe("other");
  });
  it("states generic limitations only when the field is absent from every generic wish", () => {
    const bare = normalizeWishes([{ title: "Listen to music" }, { title: "Cook together" }]);
    expect(genericLimits(bare)).toEqual(["No Qloo taste evidence", "No confirmed source labels", "No maker matching through Genie's workflow"]);
    const withTags = normalizeWishes([{ title: "a", tags: ["x"], basis: "told" }]);
    expect(genericLimits(withTags)).toEqual(["No maker matching through Genie's workflow"]);
    expect(genericLimits([])).toEqual([]);
  });
});

describe("story helpers", () => {
  it("parses steps and ids safely", () => {
    expect(parseStep("3")).toBe(3); expect(parseStep("0")).toBe(1); expect(parseStep("99")).toBe(1); expect(parseStep(null)).toBe(1); expect(parseStep("x")).toBe(1);
    expect(clampStep(12)).toBe(8); expect(clampStep(-1)).toBe(1);
    expect(parsePersonParam("abc-123_X")).toBe("abc-123_X"); expect(parsePersonParam("../x")).toBeNull(); expect(parsePersonParam("")).toBeNull(); expect(parsePersonParam(null)).toBeNull();
  });
  it("builds the family-told phrase from real item domains only", () => {
    const items = [item({ domain: "music" }), item({ id: "2", domain: "food" }), item({ id: "3", domain: "place" }), item({ id: "4", source_label: "likely", domain: "film" })];
    expect(toldPhrase(items)).toBe("a song, a dish and a place");
    expect(toldPhrase([item({ source_label: "likely" })])).toBeNull();
    expect(toldPhrase([item({ domain: "place" })])).toBe("a place");
    expect(countWord(3)).toBe("three");
  });
  it("matches personas by first name and titles steps with the person's name", () => {
    const list = [{ first_name: "Nani" }, { first_name: "Sana" }];
    expect(pickPersona(list, "SANA")).toBe(list[1]); expect(pickPersona(list, "zed")).toBeNull(); expect(pickPersona(list, null)).toBeNull();
    expect(stepTitle(1, "Nani")).toBe("Meet Nani"); expect(stepTitle(3, "Sana")).toBe("Who Sana was"); expect(stepTitle(6, "x")).toBe("Someone who can make it happen");
  });
});
