import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiError, COMPARE_NOT_GENERATED, friendlyMessage, PERSON_EXPIRED_CODE, PERSON_EXPIRED_MESSAGE, WISH_BOOK_NOT_COMPILED } from "../errors";
import { api, getPerson } from "../api";
import { becauseText, lineParts, trackParts, trackSentence } from "../bedside";
import { pruneEmpty, tagNames } from "../compare";
import { filterLearned, groupPortrait, isVagueMoodSentence, provenanceOf, rankTags } from "../wishbook";
import { describeRequest, parseRequest, qlooRowDisplay } from "../qlooLog";
import { basisCopy, basisKind, makerFacts, noticeLabel } from "../makers";

describe("1. bedside kit tracks", () => {
  it("shows name and label, never basis as a reason", () => {
    const s = trackSentence({ name: "Kishore Kumar", label: "They reacted to this", basis: "reacted" });
    expect(s).toBe("Kishore Kumar. They reacted to this.");
    expect(s).not.toMatch(/because|reacted$/i);
  });
  it("turns a raw source key in label into human wording", () => {
    expect(trackSentence({ name: "Lata", label: "reacted", basis: "reacted" })).toBe("Lata. They reacted to this.");
  });
  it("handles missing fields without inventing anything", () => {
    expect(trackSentence({ name: "Lata" })).toBe("Lata");
    expect(trackParts({ label: "They reacted to this" })).toBeNull();
    expect(trackParts(null)).toBeNull();
    expect(trackParts({ name: "Lata", label: "lata" })).toEqual({ name: "Lata", label: undefined });
    expect(trackParts({ name: "x", label: "constructor" })?.label).toBe("constructor");
  });
  it("keeps because only for real reasons", () => {
    expect(becauseText("general")).toBeUndefined();
    expect(becauseText("  ")).toBeUndefined();
    expect(becauseText("morning light")).toBe("morning light");
    expect(lineParts({ text: "Open the curtains", because: "general" })).toEqual({ text: "Open the curtains", because: undefined });
    expect(lineParts({ because: "x" })).toBeNull();
  });
});

describe("2. compare pruning", () => {
  it("removes null, undefined, blank and empty containers but keeps real data", () => {
    const out = pruneEmpty({ title: "Evening ghazal", why: "", affinity: null, basis: undefined, tags: [], extra: { a: " " }, score: 0, ok: false, description: "Soft music" });
    expect(out).toEqual({ title: "Evening ghazal", score: 0, ok: false, description: "Soft music" });
  });
  it("returns undefined when nothing real remains", () => {
    expect(pruneEmpty(null)).toBeUndefined();
    expect(pruneEmpty([{}, { a: "" }, null])).toBeUndefined();
    expect(pruneEmpty({ why: "", basis: null })).toBeUndefined();
  });
  it("still hides identifiers and contact fields", () => {
    expect(pruneEmpty({ name: "A", maker_id: "m1", contact_email: "a@b.c", id: "9" })).toEqual({ name: "A" });
  });
  it("recognises tag lists and rejects mixed arrays", () => {
    expect(tagNames([{ name: "Ghazal" }, "ghazal", "Hyderabad"])).toEqual(["Ghazal", "Hyderabad"]);
    expect(tagNames([{ title: "x" }])).toBeNull();
  });
});

describe("3. endpoint-specific 404s", () => {
  afterEach(() => vi.unstubAllGlobals());
  const fail = async (p: Promise<unknown>): Promise<ApiError> => (await p.then(() => null, (e: unknown) => e)) as ApiError;
  const stub = (status: number, body: unknown = { detail: "Not found" }) =>
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
  it("default 404 no longer claims the person expired", () => {
    expect(friendlyMessage(404)).not.toMatch(/expired|deleted/i);
    expect(friendlyMessage(500)).toBe("Something went wrong. Please try again.");
  });
  it("getPerson 404 is the expired state, with a code", async () => {
    stub(404);
    const e = await fail(getPerson("abc"));
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(404); expect(e.friendly).toBe(PERSON_EXPIRED_MESSAGE); expect(e.code).toBe(PERSON_EXPIRED_CODE);
  });
  it("compare and wish book 404s use their own wording and no expiry code", async () => {
    stub(404);
    const c = await fail(api("/persons/a/compare", { notFound: { message: COMPARE_NOT_GENERATED } }));
    const w = await fail(api("/persons/a/wish-book", { notFound: { message: WISH_BOOK_NOT_COMPILED } }));
    expect(c.friendly).toBe("No comparison has been generated yet.");
    expect(w.friendly).toBe("The Wish Book hasn't been compiled yet.");
    expect(c.code).toBeUndefined(); expect(w.code).toBeUndefined();
  });
  it("a 404 without an override is neutral, and non-404 failures keep their messages", async () => {
    stub(404);
    expect((await fail(api("/persons/a/portrait"))).friendly).not.toMatch(/expired/i);
    stub(429);
    expect((await fail(api("/persons/a/compare", { notFound: { message: COMPARE_NOT_GENERATED } }))).friendly).toContain("slow down");
    stub(409, { detail: "Build the Taste Portrait first" });
    expect((await fail(api("/persons/a/wishes"))).friendly).toBe("Build the Taste Portrait first");
  });
});

describe("4. wish book tags and provenance", () => {
  it("returns at most five tags, genre and setting before vague moods", () => {
    const tags = ["Melodious", "Expressive", "Ghazal", "Soulful", "Hyderabad", "Classical", "Romantic", "Qawwali", "Urdu", "Nostalgic"];
    const out = rankTags(tags);
    expect(out).toHaveLength(5);
    expect(out).toEqual(["Ghazal", "Hyderabad", "Classical", "Qawwali", "Urdu"]);
  });
  it("falls back to moods only when nothing else exists, without inventing tags", () => {
    expect(rankTags(["Melodious", "Expressive"])).toEqual(["Melodious", "Expressive"]);
    expect(rankTags(undefined)).toEqual([]);
    expect(rankTags(["", "  ", "Ghazal", "ghazal"])).toEqual(["Ghazal"]);
  });
  it("uses tag type when the API provides it", () => {
    const out = rankTags([{ name: "Moving", type: "urn:tag:mood" }, { name: "Biryani", type: "urn:tag:cuisine" }, { name: "Spicy" }], 2);
    expect(out).toEqual(["Biryani", "Spicy"]);
  });
  it("splits told from guessed and never promotes unknowns to told", () => {
    const g = groupPortrait([
      { name: "Lag Jaa Gale", domain: "music", label: "Told by family", tags: ["Ghazal"] },
      { name: "Kishore Kumar", domain: "music", label: "reacted" },
      { name: "Charminar", domain: "place", label: "Likely from their era and region" },
      { name: "Some AI idea", domain: "film", label: "ai-only" },
      { name: "Mystery", domain: "food" },
      { name: "", label: "told" },
    ]);
    expect(g.told.map(x => x.name)).toEqual(["Lag Jaa Gale", "Kishore Kumar"]);
    expect(g.guesses.map(x => x.name)).toEqual(["Charminar", "Some AI idea"]);
    expect(g.other.map(x => x.name)).toEqual(["Mystery"]);
    expect(g.guesses[0].label).toBe("Likely from their era and region");
    expect(g.told[1].label).toBe("They reacted to this");
    expect(provenanceOf({ name: "x", label: "constructor" })).toBe("other");
  });
});

describe("5. things we learned filter", () => {
  it("drops mood-only filler", () => {
    expect(isVagueMoodSentence("Their world kept returning to Melodious.")).toBe(true);
    expect(isVagueMoodSentence("Their world kept returning to Expressive.")).toBe(true);
    expect(isVagueMoodSentence("Their world kept returning to Melodious and Expressive.")).toBe(true);
  });
  it("keeps anything concrete", () => {
    expect(isVagueMoodSentence("Their world kept returning to Ghazal.")).toBe(false);
    expect(isVagueMoodSentence("Their world kept returning to Melodious Hyderabad evenings.")).toBe(false);
    expect(isVagueMoodSentence("She sang Lag Jaa Gale every Sunday.")).toBe(false);
    expect(isVagueMoodSentence("Soul and qawwali were a big part of life.")).toBe(false);
    expect(isVagueMoodSentence("Their world kept returning to Hindi.")).toBe(false);
    expect(isVagueMoodSentence("Their world kept returning to Melodious हिंदी.")).toBe(false);
    expect(isVagueMoodSentence("")).toBe(false);
  });
  it("filters a list, trims multi-sentence items and tolerates bad input", () => {
    const out = filterLearned([
      "Their world kept returning to Melodious.",
      "Their world kept returning to Ghazal.",
      "Their world kept returning to Expressive. They loved Charminar at dusk.",
      "", null, 42,
    ]);
    expect(out).toEqual(["Their world kept returning to Ghazal.", "They loved Charminar at dusk."]);
    expect(filterLearned(undefined)).toEqual([]);
  });
});

describe("6. qloo call log", () => {
  it("describes a search in friendly words", () => {
    const r = qlooRowDisplay({ step: "resolve", request: "/search {'query': 'Charminar', 'filter.type': 'urn:entity:place'}", status: "ok", ms: 412 });
    expect(r.friendly).toBe("Looked up Charminar as a place.");
    expect(r.meta).toBe("ok, 412 ms");
    expect(r.raw).toBe("resolve /search {'query': 'Charminar', 'filter.type': 'urn:entity:place'}");
  });
  it("prefers a backend label and keeps the raw entry", () => {
    const r = qlooRowDisplay({ step: "s", request: "/search {'query': 'x'}", status: "ok", ms: 1, label: "Looked up Lag Jaa Gale as a song." });
    expect(r.friendly).toBe("Looked up Lag Jaa Gale as a song."); expect(r.hasLabel).toBe(true); expect(r.raw).toContain("/search");
  });
  it("handles apostrophes, missing types and unknown endpoints", () => {
    expect(describeRequest(`/search {'query': "Shah Rukh Khan's", 'x': 1}`)).toBe("Looked up Shah Rukh Khan's.");
    expect(describeRequest("/v2/insights {'signal.interests.entities': 'abc'}")).toBe("Asked Qloo for related taste suggestions.");
    expect(describeRequest("/weird/endpoint {}")).toBe("Made a Qloo request to /weird/endpoint.");
    expect(describeRequest("not a request")).toBeUndefined();
    expect(parseRequest("/search {'query': 'A', 'filter.type': 'urn:entity:artist'}").type).toBe("artist");
  });
  it("never throws on unknown shapes", () => {
    expect(qlooRowDisplay(null).friendly).toBe("Made a Qloo request.");
    expect(qlooRowDisplay("/search {'query': 'Tank Bund'}").friendly).toBe("Looked up Tank Bund.");
    expect(qlooRowDisplay({ foo: 1 }).raw).toBe('{"foo":1}');
    expect(qlooRowDisplay({ request: "???", status: 200 }).meta).toBe("200");
  });
});

describe("7. wish maker labels", () => {
  const notices = { medical_disclaimer: "Not a medical service.", labels: { verification_status: { sample: "Sample maker", approved: "Verified" }, maker_type: [{ id: "musician", label: "Musician" }] }, attribution: { qloo: "Powered by Qloo. This is a long attribution paragraph that must never become a label for anything at all." } };
  it("reads friendly labels from notices when present", () => {
    expect(noticeLabel(notices, "verification", "approved")).toBe("Verified");
    expect(noticeLabel(notices, "type", "musician")).toBe("Musician");
    expect(noticeLabel(notices, "basis", "qloo")).toBeUndefined();
    expect(noticeLabel(undefined, "type", "musician")).toBeUndefined();
  });
  it("falls back to tidy wording and shows sample as a badge, not in the line", () => {
    const f = makerFacts({ name: "A", type: "musician", city: "Hyderabad", country: "India", is_sample: true, verification_status: "sample" });
    expect(f.sample).toBe(true); expect(f.line).toBe("Musician · Hyderabad, India");
    expect(makerFacts({ type: "chef", verification_status: "approved" }, notices).line).toBe("Chef · Verified");
    expect(makerFacts({ type: "chef", verification_status: "sample" }).sample).toBe(true);
    expect(makerFacts({ type: "chef" }).sample).toBe(false);
  });
  it("explains the basis honestly", () => {
    expect(basisKind("qloo")).toBe("qloo"); expect(basisKind("text")).toBe("text"); expect(basisKind("text_match")).toBe("text");
    expect(basisKind("maker_type")).toBe("type"); expect(basisKind("category")).toBe("type"); expect(basisKind("context")).toBe("unknown");
    expect(basisKind("qloo+text")).toBe("mixed"); expect(basisKind(undefined)).toBe("unknown");
    expect(basisCopy("qloo").title).toBe("Qloo-based match");
    expect(basisCopy("text").title).toBe("Text-based match");
    expect(basisCopy("text").explanation).toMatch(/not through Qloo/);
    expect(basisCopy("type").title).toBe("Type-based match");
    expect(basisCopy(undefined).title).toBe("Match basis not specified");
    expect(basisCopy("embeddings").title).toBe("Match basis: Embeddings");
    expect(basisCopy("embeddings").explanation).not.toMatch(/came from Qloo/);
  });
});
