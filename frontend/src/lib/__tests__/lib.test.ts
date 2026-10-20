import { describe, it, expect } from "vitest";
import { friendlyMessage } from "../errors";
import { confidenceWord, isNotInQloo, matchedVia, pickMedical, seconds, shownTags, sourceLabel } from "../format";
import type { PortraitItem } from "../types";
const item = (o: Partial<PortraitItem> = {}): PortraitItem => ({ id: "1", domain: "music", name: "Lag Jaa Gale", tags: [], source_label: "told", confidence: 0.9, resolution_level: 1, matched_name: null, ...o });
describe("friendlyMessage", () => {
  it("maps statuses to calm wording", () => {
    expect(friendlyMessage(404)).toBe("This page has expired or was deleted.");
    expect(friendlyMessage(429)).toContain("slow down");
    expect(friendlyMessage(504)).toContain("longer than expected");
    expect(friendlyMessage(0)).toContain("could not reach");
  });
  it("uses backend detail for 409 and never shows raw 422 lists", () => {
    expect(friendlyMessage(409, "Build the Taste Portrait first")).toBe("Build the Taste Portrait first");
    expect(friendlyMessage(422, [{ loc: ["x"] }])).toBe("Please check what you entered and try again.");
  });
});
describe("portrait helpers", () => {
  it("shows at most five tag names and no ids", () => {
    const tags = Array.from({ length: 8 }, (_, i) => ({ id: `urn:${i}`, name: `tag${i}` }));
    const out = shownTags(item({ tags }));
    expect(out).toEqual(["tag0", "tag1", "tag2", "tag3", "tag4"]);
  });
  it("hides tags and flags items not in Qloo at levels 5 and 6", () => {
    const i = item({ resolution_level: 5, tags: [{ name: "x" }] });
    expect(isNotInQloo(i)).toBe(true); expect(shownTags(i)).toEqual([]);
    expect(isNotInQloo(item({ resolution_level: 6 }))).toBe(true);
    expect(isNotInQloo(item({ resolution_level: 2 }))).toBe(false);
  });
  it("shows matched name only when it differs", () => {
    expect(matchedVia(item({ matched_name: "lag jaa gale" }))).toBeNull();
    expect(matchedVia(item({ matched_name: "Lata Mangeshkar" }))).toBe("Lata Mangeshkar");
  });
  it("labels sources and confidence without percentages", () => {
    expect(sourceLabel("likely")).toBe("Likely from their era and region");
    expect(confidenceWord(0.9)).toBe("Quite sure"); expect(confidenceWord(0.3)).toBe("A gentle guess");
    expect(seconds(2500)).toBe("2.5 seconds");
  });
  it("finds the medical note in notices", () => {
    expect(pickMedical({ a: 1, nested: { medical_disclaimer: "Not a medical service." } })).toBe("Not a medical service.");
    expect(pickMedical(null)).toBeUndefined();
  });
});
