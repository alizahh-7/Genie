import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CAPABILITIES, HOME_SECTION_IDS, NAV_LINKS, PRIVACY_POINTS, PROCESS } from "../home";
import { attentionItems } from "../orgAttention";
import type { DashStory } from "../org";

const APP = path.resolve(__dirname, "../../app");
/** A link is real when its path maps to an app route (page.tsx), allowing dynamic folders like [id] only for literal-less paths. */
function routeExists(href: string): boolean {
  const p = href.split("#")[0].split("?")[0].replace(/^\/+|\/+$/g, "");
  const dir = p ? path.join(APP, ...p.split("/")) : APP;
  return fs.existsSync(path.join(dir, "page.tsx"));
}
const section = (id: string) => (fs.readFileSync(path.join(APP, "page.tsx"), "utf8").includes(`id="${id}"`) || fs.readFileSync(path.join(APP, "page.tsx"), "utf8").includes(`id=\"${id}\"`));

describe("product-first navigation", () => {
  it("has the five required destinations, in order of use", () => {
    expect(NAV_LINKS.map(l => l.label)).toEqual(["Start a story", "How Genie works", "Explore demo", "Become a Wish Maker", "For hospices"]);
    expect(NAV_LINKS.map(l => l.href)).toEqual(["/start", "/#how", "/demo", "/makers/apply", "/for-hospices"]);
  });
  it("every nav link points at a real route", () => { for (const l of NAV_LINKS) expect(routeExists(l.href), l.href).toBe(true); });
  it("the 'How Genie works' anchor exists on the landing page", () => { expect(section("how")).toBe(true); });
});

describe("landing capabilities", () => {
  const ids = CAPABILITIES.map(c => c.id);
  it("covers every working capability named in the brief", () => {
    expect(ids).toEqual(["story", "portrait", "circle", "wishes", "makers", "track", "book", "privacy", "apply", "hospice"]);
  });
  it("every capability link and demo link is a real, working route", () => {
    for (const c of CAPABILITIES) { expect(routeExists(c.href), `${c.id} -> ${c.href}`).toBe(true); if (c.demoHref) expect(routeExists(c.demoHref), `${c.id} demo -> ${c.demoHref}`).toBe(true); }
  });
  it("is honest about where a capability lives: story-bound ones never claim to open standalone", () => {
    for (const c of CAPABILITIES) {
      if (c.where === "in-story") { expect(c.href).toBe("/start"); expect(c.cta.toLowerCase()).toMatch(/story|generate|begin|watch/); }
      else expect(["/start", "/makers/apply", "/for-hospices"]).toContain(c.href);
    }
    expect(CAPABILITIES.find(c => c.id === "apply")!.href).toBe("/makers/apply"); expect(CAPABILITIES.find(c => c.id === "hospice")!.href).toBe("/for-hospices");
  });
  it("makes no usage, customer or outcome claims", () => {
    const all = JSON.stringify([CAPABILITIES.map(c => [c.title, c.text, c.cta]), PROCESS, PRIVACY_POINTS]).toLowerCase();
    for (const bad of [/\d+\s*(families|hospices|organisations|wishes granted|customers)/, /trusted by/, /thousands/, /\bover \d/]) expect(all).not.toMatch(bad);
    expect(all).not.toContain("nani"); expect(all).not.toContain("sana");
  });
  it("does not leak provider data into public copy", () => { expect(JSON.stringify(CAPABILITIES)).not.toMatch(/urn:|entity:|score \d|0\.\d{2}/); });
});

describe("landing structure follows the required hierarchy", () => {
  const src = fs.readFileSync(path.join(APP, "page.tsx"), "utf8");
  it("has every section, in order", () => {
    const pos = HOME_SECTION_IDS.map(id => src.indexOf(`id="${id}"`)); expect(pos.every(p => p >= 0)).toBe(true);
    expect(pos[0]).toBeLessThan(pos[2]); expect(pos[2]).toBeLessThan(pos[3]); expect(pos[3]).toBeLessThan(pos[4]); expect(pos[4]).toBeLessThan(pos[5]); expect(pos[5]).toBeLessThan(pos[6]);
  });
  it("leads with Genie and demotes the fictional people to their own section", () => {
    expect(src).toContain("Meet Genie."); expect(src.indexOf("Meet Genie.")).toBeLessThan(src.indexOf("<DemoCards")); expect(src).toContain("Explore Genie with a fictional story");
    expect(src.indexOf("Start a story")).toBeLessThan(src.indexOf("Explore the demo")); expect(src).toContain("Everyone deserves to be known before they go.");
    expect(src.slice(0, src.indexOf('id="demo"'))).not.toMatch(/Nani|Sana/);
  });
  it("keeps the animated background", () => { expect(src).toContain("<GenieDreamBackground />"); });
});

describe("organisation attention list", () => {
  const now = Date.parse("2026-10-24T00:00:00Z"); const day = 86400000;
  const st = (o: Partial<DashStory>): DashStory => ({ case_key: "k", first_name: "A", expires_at: new Date(now + 60 * day).toISOString(), ...o } as DashStory);
  it("orders concerns, retention deadlines, replies awaited, paused", () => {
    const items = attentionItems([st({ case_key: "p", status: "paused" }), st({ case_key: "w", requested: 2 }), st({ case_key: "e", expires_at: new Date(now + 3 * day).toISOString() }), st({ case_key: "c", concerns: 1 })], now);
    expect(items.map(i => i.kind)).toEqual(["concern", "expiring", "awaiting", "paused"]);
  });
  it("ignores closed stories and healthy ones, and invents nothing", () => {
    expect(attentionItems([st({ status: "closed", concerns: 3 }), st({})], now)).toEqual([]); expect(attentionItems([], now)).toEqual([]);
  });
  it("highlights fewer than ten days only", () => {
    expect(attentionItems([st({ expires_at: new Date(now + 10 * day).toISOString() })], now)).toHaveLength(0); expect(attentionItems([st({ expires_at: new Date(now + 9 * day).toISOString() })], now)).toHaveLength(1);
  });
  it("uses the case key only, never a person id", () => { const i = attentionItems([st({ case_key: "ck1", concerns: 1, person_id: "SECRET" } as Partial<DashStory>)], now); expect(JSON.stringify(i)).not.toContain("SECRET"); expect(i[0].caseKey).toBe("ck1"); });
});

describe("hospice page statements", () => {
  const src = fs.readFileSync(path.join(APP, "for-hospices/page.tsx"), "utf8");
  it("says families use Genie for free and labels the preview as fictional", () => { expect(src).toMatch(/Families use Genie for free/); expect(src).toContain("Fictional layout"); });
  it("does not claim adoption", () => { expect(src).toContain("no organisation has used it yet"); expect(src).not.toMatch(/trusted by|\d+ (hospices|organisations)/i); });
});
