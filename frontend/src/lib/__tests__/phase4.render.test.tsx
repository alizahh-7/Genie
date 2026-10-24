import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Landing from "@/app/page";
import { NAV_LINKS } from "../home";
import { Shell } from "@/components/ui";

const html = renderToStaticMarkup(<Landing />);
const hrefs = (h: string) => [...h.matchAll(/href="([^"]+)"/g)].map(m => m[1]);

describe("landing page (rendered)", () => {
  it("leads with Meet Genie and the primary and secondary calls to action", () => {
    expect(html).toContain("Meet Genie."); expect(html).toMatch(/href="\/start"[^>]*>Start a story</); expect(html).toMatch(/href="\/demo"[^>]*>Explore the demo</);
  });
  it("renders every capability as a real link", () => {
    for (const id of ["story", "portrait", "circle", "wishes", "makers", "track", "book", "privacy", "apply", "hospice"]) expect(html).toContain(`data-capability="${id}"`);
    const h = hrefs(html); for (const want of ["/start", "/makers/apply", "/for-hospices", "/maker/recover", "/demo?who=nani"]) expect(h).toContain(want);
  });
  it("keeps the fictional demo as a labelled secondary section", () => {
    expect(html).toContain("Explore Genie with a fictional story"); expect(html).toContain("Want to see how it works before creating your own?"); expect(html).toContain("fictional people and sample Wish Makers");
    expect(html.indexOf("Meet Genie.")).toBeLessThan(html.indexOf("Explore Genie with a fictional story"));
  });
  it("shows the pathways and the trust section, with no invented numbers", () => {
    expect(html).toContain("Become a Wish Maker"); expect(html).toContain("Families use Genie for free"); expect(html).toContain("Privacy and trust"); expect(html).toContain("not a medical service");
    expect(html).not.toMatch(/\b\d{2,}\s*(families|hospices|wishes granted)/i);
  });
});

describe("navigation (rendered)", () => {
  const nav = renderToStaticMarkup(<Shell><p>x</p></Shell>);
  it("shows every required destination as a link", () => { for (const l of NAV_LINKS) expect(hrefs(nav)).toContain(l.href); expect(nav).toContain("Start a story"); expect(nav).toContain("For hospices"); });
});
