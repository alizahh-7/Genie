import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { QlooLayerProvider } from "../qlooLayer";
import { CompareView, type Comparison } from "@/components/CompareView";
import { PortraitCard, WishCard } from "@/components/story";
import { QlooEvidenceStrip } from "@/components/QlooLayer";
import { featuredWishes } from "@/components/DemoStory";
import type { PortraitItem, Wish } from "../types";

const html = (n: ReactNode, on: boolean) => renderToStaticMarkup(<QlooLayerProvider initialOn={on}>{n}</QlooLayerProvider>);
const resolved: PortraitItem = { id: "1", domain: "music", name: "Lag Jaa Gale", tags: [{ name: "Ghazal" }], source_label: "told", confidence: 0.9, resolution_level: 2, matched_name: null };
const notInQloo: PortraitItem = { ...resolved, id: "2", name: "Biryani", resolution_level: 5 };
const wish = (o: Partial<Wish>): Wish => ({ id: "w", title: "T", description: "D", mode: "remote", kind: null, maker_type: null, basis: null, why: null, affinity: null, tags: [], ...o });

const full: Comparison = {
  generic: { available: true, wishes: [{ title: "Listen to music together", description: "Play some songs." }] },
  genie: { wishes: [{ title: "Sing her ghazal", description: "With a musician", basis: "told", maker_type: "musician", tags: [{ name: "Ghazal", id: "urn:tag:1" }] }, { title: "Try a new place", description: "A discovery", kind: "discovery", basis: "likely", tags: [{ name: "Deccan", id: "urn:tag:2" }] }] },
  evidence: { genie_wishes: 2, genie_wishes_with_taste_tags: 2, genie_told_items: 3, genie_told_items_found_in_qloo: 2, genie_qloo_calls: 9 },
  note: "Genie used Qloo; the general AI did not.",
};

describe("Qloo layer rendering", () => {
  it("adds glow and badges only for Qloo-resolved portrait items, and only when on", () => {
    const off = html(<PortraitCard item={resolved} i={0} />, false);
    const on = html(<PortraitCard item={resolved} i={0} />, true);
    expect(off).toContain("Lag Jaa Gale"); expect(off).not.toContain("qloo-glow"); expect(off).not.toContain("data-qloo-badge");
    expect(on).toContain("qloo-glow"); expect(on).toContain("data-qloo-badge"); expect(on).toContain("qloo-tag");
    const notQ = html(<PortraitCard item={notInQloo} i={0} />, true);
    expect(notQ).toContain("Biryani"); expect(notQ).not.toContain("qloo-glow"); expect(notQ).not.toContain("data-qloo-badge");
  });
  it("never glows a told item just because the layer is on if it was not resolved in Qloo", () => {
    expect(html(<PortraitCard item={{ ...notInQloo, source_label: "told" }} i={0} />, true)).not.toContain("qloo-glow");
  });
  it("glows only Qloo-backed discovery wishes, keeping ordinary wishes visible", () => {
    const q = wish({ kind: "discovery", tags: [{ name: "x", id: "urn:1" }] });
    const plain = wish({ id: "p", title: "Ordinary", tags: [{ name: "y", id: "urn:2" }] });
    const textOnly = wish({ id: "t", kind: "discovery", tags: [{ name: "z" }] });
    expect(html(<WishCard wish={q} i={0} />, true)).toContain("qloo-glow");
    expect(html(<WishCard wish={q} i={0} />, false)).not.toContain("qloo-glow");
    const p = html(<WishCard wish={plain} i={0} />, true); expect(p).not.toContain("qloo-glow"); expect(p).toContain("Ordinary"); expect(p).toContain("qloo-tag");
    expect(html(<WishCard wish={textOnly} i={0} />, true)).not.toContain("qloo-glow");
  });
});

describe("CompareView", () => {
  it("renders scoreboard, both columns, discovery treatment and the note", () => {
    const h = html(<CompareView data={full} />, false);
    expect(h).toContain("data-scoreboard"); expect(h).toContain("A general AI"); expect(h).toContain("Genie, using Qloo");
    expect(h).toContain("Listen to music together"); expect(h).toContain("Sing her ghazal"); expect(h).toContain("A discovery");
    expect(h).toContain("Told by family"); expect(h).toContain("A guess"); expect(h).toContain("Maker: Musician");
    expect(h).toContain("Genie used Qloo; the general AI did not."); expect(h).toContain("No Qloo taste evidence");
    expect(h).toContain("md:grid-cols-2");
    expect(h).not.toContain("qloo-glow"); expect(h).not.toContain("data-qloo-badge");
  });
  it("shows Qloo emphasis on the Genie side only when on, never on the generic side", () => {
    const h = html(<CompareView data={full} />, true);
    expect(h).toContain("data-qloo-badge"); expect(h).toContain("qloo-glow");
    const [generic] = h.split('aria-labelledby="cmp-genie"');
    expect(generic).not.toContain("qloo-glow"); expect(generic).not.toContain("data-qloo-badge");
  });
  it("omits scoreboard metrics that the backend did not send", () => {
    const h = html(<CompareView data={{ ...full, evidence: { genie_qloo_calls: 4 } }} />, false);
    expect(h).toContain('data-metric="calls"'); expect(h).not.toContain('data-metric="tags"'); expect(h).not.toContain('data-metric="told"');
    expect(html(<CompareView data={{ ...full, evidence: undefined }} />, false)).not.toContain("data-scoreboard");
  });
  it("shows the real generic message when unavailable and keeps Genie usable", () => {
    const h = html(<CompareView data={{ ...full, generic: { available: false, message: "Generic comparison is switched off." } }} />, false);
    expect(h).toContain("Generic comparison is switched off."); expect(h).toContain("Sing her ghazal"); expect(h).not.toContain("Listen to music together");
  });
  it("gives each side an honest empty state", () => {
    const h = html(<CompareView data={{ generic: { wishes: [] }, genie: { wishes: [] } }} />, false);
    expect(h.match(/No suggestions to show/g)?.length).toBe(2);
  });
});

describe("evidence strip", () => {
  it("shows real counters, a loading state and an empty state", () => {
    expect(html(<QlooEvidenceStrip counters={{ lookups: 4, tasteLinks: 12, discoveries: 1 }} />, false)).toContain("4 Qloo lookups");
    expect(html(<QlooEvidenceStrip counters={null} loading />, false)).toContain("Counting Qloo activity");
    expect(html(<QlooEvidenceStrip counters={{ lookups: null, tasteLinks: null, discoveries: null }} />, false)).toContain("No Qloo activity");
  });
});

describe("featured wishes", () => {
  it("takes the first two, swapping in a real discovery when there is one", () => {
    const a = wish({ id: "a" }), b = wish({ id: "b" }), c = wish({ id: "c", kind: "discovery" });
    expect(featuredWishes([a, b, c])).toEqual([a, c]); expect(featuredWishes([a, b])).toEqual([a, b]); expect(featuredWishes([a])).toEqual([a]); expect(featuredWishes([])).toEqual([]);
  });
});
