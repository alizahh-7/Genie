import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildReceipt } from "../qlooReceipt";
import { QlooReceipt } from "@/components/QlooReceipt";
import { quickFavs } from "@/components/TryYourOwn";
import TryYourOwn from "@/components/TryYourOwn";
import HowGenie from "@/app/how-genie-uses-qloo/page";
import ForHospices from "@/app/for-hospices/page";
import HospiceWalkthrough from "@/components/HospiceWalkthrough";
import Landing from "@/app/page";
import { COVERAGE, LADDER, JOBS, coverageSum } from "../qlooFacts";
import { adminCall, adminMessage, orgLink, AdminError } from "../admin";
import type { Wish } from "../types";

const wish = (o: Partial<Wish> & { source_items?: unknown } = {}): Wish & { source_items?: unknown } => ({ id: "w1", title: "t", description: "d", mode: "remote", kind: null, maker_type: null, basis: "told", why: null, affinity: null, tags: [], ...o });

describe("Qloo receipt", () => {
  it("lists what a wish was built from, at most four, without duplicates", () => {
    const r = buildReceipt(wish({ source_items: ["Lag Jaa Gale", "lag jaa gale", "Haleem", "Charminar", "A", "B"] }));
    expect(r?.from).toEqual(["Lag Jaa Gale", "Haleem", "Charminar", "A"]);
  });
  it("only counts tags as Qloo's when the provenance rule says so", () => {
    const tags = [{ name: "Ghazal" }, { name: "Devotional" }] as Wish["tags"];
    const r = buildReceipt(wish({ source_items: ["x"], tags }), new Set(["ghazal"]));
    expect(r?.qlooTags).toEqual(["Ghazal"]);
    expect(buildReceipt(wish({ source_items: ["x"], tags }))?.qlooTags).toEqual([]);
  });
  it("shows the discovered item as a guess", () => {
    const r = buildReceipt(wish({ kind: "discovery", basis: "likely", discovered: "Some Artist" }));
    expect(r).toMatchObject({ guess: "Some Artist", isGuess: true });
  });
  it("returns nothing when there is nothing true to show, and renders no empty box", () => {
    expect(buildReceipt(wish())).toBeNull();
    expect(buildReceipt(wish({ source_items: "nope" as unknown }))).toBeNull();
    expect(renderToStaticMarkup(<QlooReceipt wish={wish()} />)).toBe("");
  });
  it("renders the receipt", () => {
    const h = renderToStaticMarkup(<QlooReceipt wish={wish({ source_items: ["Haleem"] })} />);
    expect(h).toContain("Qloo receipt"); expect(h).toContain("Built from"); expect(h).toContain("Haleem");
  });
});

describe("Try your own person", () => {
  it("builds favourites from the three boxes and skips empty ones", () => {
    expect(quickFavs(" Kishore ", "", " Charminar ")).toEqual([{ domain: "music", name: "Kishore" }, { domain: "place", name: "Charminar" }]);
    expect(quickFavs("", "", "")).toEqual([]);
  });
  it("renders on the landing page and starts disabled", () => {
    expect(renderToStaticMarkup(<TryYourOwn />)).toContain("Try it with someone you know");
    expect(renderToStaticMarkup(<Landing />)).toContain("Gather their story");
  });
});

describe("How Genie uses Qloo", () => {
  it("coverage numbers add up and match the report", () => { expect(coverageSum()).toBe(COVERAGE.total); expect(COVERAGE.total).toBe(40); });
  it("shows three jobs and six ladder levels, and is honest about songs and samples", () => {
    expect(JOBS).toHaveLength(3); expect(LADDER.map(l => l.level)).toEqual([1, 2, 3, 4, 5, 6]);
    const h = renderToStaticMarkup(<HowGenie />);
    expect(h).toContain("all 40 land"); expect(h).toContain("not individual songs or dishes"); expect(h).toContain("labelled samples"); expect(h).toContain("not a medical service");
  });
  it("is linked from the landing page", () => { expect(renderToStaticMarkup(<Landing />)).toContain('href="/how-genie-uses-qloo"'); });
});

describe("hospice walkthrough", () => {
  it("explains consent, labels and contact privacy, with no invented numbers", () => {
    const h = renderToStaticMarkup(<HospiceWalkthrough />);
    expect(h).toContain("How a hospice uses Genie"); expect(h).toContain("never a medical record number"); expect(h).toContain("Contact details stay private");
    expect(h).not.toMatch(/\d+ hospices|\d+ families|\d+%/);
  });
  it("appears on the hospice page", () => { expect(renderToStaticMarkup(<ForHospices />)).toContain("How a hospice uses Genie"); });
});

describe("admin calls", () => {
  afterEach(() => vi.restoreAllMocks());
  it("friendly messages", () => {
    expect(adminMessage(401)).toMatch(/not accepted/); expect(adminMessage(503)).toMatch(/not set up/); expect(adminMessage(0)).toMatch(/Could not reach/);
    expect(adminMessage(422, "Bad input")).toBe("Bad input");
  });
  it("sends the token as a header and returns data", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify([{ id: "a" }]) });
    vi.stubGlobal("fetch", f);
    const r = await adminCall<{ id: string }[]>("tok", "/admin/org-applications?status=pending");
    expect(r[0].id).toBe("a");
    expect(f.mock.calls[0][1].headers["X-Admin-Token"]).toBe("tok"); expect(f.mock.calls[0][1].referrerPolicy).toBe("no-referrer");
    vi.unstubAllGlobals();
  });
  it("turns a 401 into a clear error and a network failure into a calm one", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => JSON.stringify({ detail: "Not allowed" }) }));
    await expect(adminCall("x", "/admin/concerns")).rejects.toMatchObject({ status: 401, message: "That admin token was not accepted." });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fail")));
    await expect(adminCall("x", "/admin/concerns")).rejects.toBeInstanceOf(AdminError);
    vi.unstubAllGlobals();
  });
  it("builds the private link from the returned path", () => {
    expect(orgLink("https://genie.app/", "/org/abc")).toBe("https://genie.app/org/abc"); expect(orgLink("https://genie.app", "org/abc")).toBe("https://genie.app/org/abc"); expect(orgLink("https://genie.app", undefined)).toBe("");
  });
});
