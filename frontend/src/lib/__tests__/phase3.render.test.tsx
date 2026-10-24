import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { QlooLayerProvider } from "../qlooLayer";
import { WishBookView } from "@/components/WishBookView";
import { MakerTimeline } from "@/components/MakerTimeline";
import { TasteMap } from "@/components/TasteMap";
import { LiveLearn } from "@/components/LiveLearn";
import { PortalError } from "@/components/OrgFrame";
import { parseBook } from "../bookV3";
import { buildTasteMap, QLOO_GUESS_NOTE } from "../tasteMap";
import { ApiError } from "../errors";
import type { PortraitItem, Wish } from "../types";

const html = (n: ReactNode, on = false) => renderToStaticMarkup(<QlooLayerProvider initialOn={on}>{n}</QlooLayerProvider>);
const book = parseBook({ content: { title: "Nani's Wish Book", tagline: "tag", person: "Nani", themes: ["Music"], learned: ["They loved Charminar."], notice: "Genie is not a medical service.", generated_at: "2026-10-01T00:00:00Z",
  portrait: [{ domain: "music", name: "Lag Jaa Gale", tags: ["Ghazal"], source: "told", label: "Told by family" }, { domain: "place", name: "Charminar", tags: [], source: "likely", label: "Likely from their era and region" }],
  wishes: [{ title: "Sing", description: "d", mode: "in-person", basis: "likely", makers: [{ name: "Asha", type: "musician", status: "accepted", is_sample: true, maker_contact: "private@x.y" }] }],
  voices: [{ from: "Zara", answers: { joy: "Dancing", music: "Ghazals", film: "Pakeezah", place: "Home", food: "Biryani" } }] } })!;

describe("Wish Book view", () => {
  const out = html(<WishBookView book={book} />);
  it("keeps family testimony and guesses in separate, honestly labelled sections", () => {
    const fam = out.indexOf('data-section="family"'); const guess = out.indexOf('data-section="guesses"');
    expect(fam).toBeGreaterThan(-1); expect(guess).toBeGreaterThan(fam);
    expect(out.slice(fam, guess)).toContain("Lag Jaa Gale"); expect(out.slice(fam, guess)).not.toContain("Charminar");
    expect(out.slice(guess)).toContain("Maybe, from their era and region"); expect(out).toContain("Likely from their era and region");
  });
  it("shows family answers in the fixed order with the contributor's name", () => {
    const keys = [...out.matchAll(/data-answer="(\w+)"/g)].map(m => m[1]); expect(keys).toEqual(["music", "food", "place", "film", "joy"]);
    expect(out).toContain("Zara remembers"); expect(out).toContain("font-serif text-3xl");
  });
  it("labels a likely wish as a guess, shows makers, and never prints maker contact", () => {
    expect(out).toContain("A guess. The family decides."); expect(out).toContain("Asha, musician (Sample)"); expect(out).not.toContain("private@x.y");
  });
  it("is print-ready: cover, keep-together blocks, no controls inside the book, snapshot note and notice", () => {
    expect(out).toContain("book-cover"); expect(out).toContain("book-keep"); expect(out).not.toContain("<button"); expect(out).toContain("A saved snapshot"); expect(out).toContain("Genie is not a medical service.");
  });
});

describe("MakerTimeline", () => {
  it("renders the stage of the actual status and only marks reached stages", () => {
    const t = html(<MakerTimeline row={{ status: "requested", requested_at: "2026-10-01T00:00:00Z" }} />);
    expect(t).toContain('data-stage="suggested" data-state="complete"'); expect(t).toContain('data-stage="asked" data-state="current"'); expect(t).toContain('data-stage="accepted" data-state="upcoming"'); expect(t).toContain('data-stage="done" data-state="upcoming"');
    expect(t).toContain('aria-current="step"');
  });
  it("shows the stopped banner for declined and withdrawn", () => {
    expect(html(<MakerTimeline row={{ status: "declined" }} />)).toContain("Not going ahead — Declined"); expect(html(<MakerTimeline row={{ status: "withdrawn" }} />)).toContain("Not going ahead — Withdrawn");
    expect(html(<MakerTimeline row={{ status: "done" }} />)).not.toContain('data-state="upcoming"');
  });
});

describe("Taste Map rendering and the Qloo toggle", () => {
  const it0 = (o: Record<string, unknown>) => ({ id: "1", domain: "music", name: "Lag Jaa Gale", tags: [], source_label: "told", confidence: 1, resolution_level: 1, matched_name: null, ...o }) as PortraitItem;
  const items = [it0({ id: "1", qloo_entity_id: "q1", top_tags: ["Ghazal"], matched_name: "Lag Jaa Gale (1964)" }), it0({ id: "2", name: "Biryani", domain: "food", top_tags: ["Spicy"] })];
  const wishes = [{ id: "w", title: "Try ghazal", kind: "discovery", discovered: "Mehdi Hassan", tags: [{ name: "Ghazal", id: "urn:1" }] }] as unknown as Wish[];
  const model = buildTasteMap("Nani", items, wishes);
  it("renders the four columns with Qloo's guess clearly labelled", () => {
    const off = html(<TasteMap model={model} note={QLOO_GUESS_NOTE} />);
    for (const w of ["Person", "Favourites", "Strongest taste tags", "Discovered item"]) expect(off).toContain(w);
    expect(off).toContain("Qloo&#x27;s guess"); expect(off).toContain("Mehdi Hassan"); expect(off).toContain("Matched via Lag Jaa Gale (1964)"); expect(off).toContain("Not found in Qloo"); expect(off).toContain(QLOO_GUESS_NOTE.replace("'", "&#x27;"));
  });
  it("glows only genuine Qloo-supported nodes, and only when the toggle is on", () => {
    const off = html(<TasteMap model={model} note="n" />, false); expect(off).not.toContain("qloo-glow"); expect(off).not.toContain("data-qloo-badge");
    const on = html(<TasteMap model={model} note="n" />, true);
    const nodes = [...on.matchAll(/<div data-node="(favourite|discovery)"([^>]*)>/g)].map(m => [m[1], m[2].includes("qloo-glow")]);
    expect(nodes).toEqual([["favourite", true], ["favourite", false], ["discovery", true]]);
    expect(on).toContain('data-qloo-tag="1"'); expect((on.match(/data-qloo-tag="1"/g) ?? []).length).toBe(1); // Ghazal only, not Spicy
  });
  it("renders honest empty notes for partial data", () => {
    const empty = html(<TasteMap model={buildTasteMap("Sana", [], [])} note="n" />);
    expect(empty).toContain("No favourites told by the family yet."); expect(empty).toContain("No strongest tags have been recorded yet."); expect(empty).toContain("No discovery has been named yet."); expect(empty).not.toContain('data-node="discovery"');
  });
});

describe("Live learning and portal errors", () => {
  it("starts with every stage waiting and a clearly live, non-replay presentation", () => {
    const out = html(<LiveLearn form={{ first_name: "A" }} favs={[]} />);
    expect(out).toContain("Watching Genie learn"); expect([...out.matchAll(/data-status="(\w+)"/g)].map(m => m[1])).toEqual(["waiting", "waiting", "waiting"]); expect(out).not.toMatch(/replay/i);
  });
  it("shows a 403 as a role restriction and never as an expired link", () => {
    const f = html(<PortalError error={new ApiError(403, "x", undefined, "Viewers cannot edit")} />);
    expect(f).toContain("data-forbidden"); expect(f).toContain("Your role doesn&#x27;t allow this."); expect(f).toContain("Viewers cannot edit"); expect(f).not.toMatch(/not valid|expired/i);
    expect(html(<PortalError error={new ApiError(500, "Something broke")} />)).not.toContain("data-forbidden");
  });
});
