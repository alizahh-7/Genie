/**
 * Content for the product-first landing page and the main navigation.
 * Every `href` here must be a real route: a test checks each one against the app folder.
 * `where` says honestly whether the screen opens right now or lives inside a story the visitor creates first.
 */
export interface NavLink { label: string; href: string; short?: string }
export const NAV_LINKS: NavLink[] = [
  { label: "Start a story", href: "/start" },
  { label: "How Genie works", href: "/#how" },
  { label: "Explore demo", href: "/demo" },
  { label: "Become a Wish Maker", href: "/makers/apply", short: "Wish Makers" },
  { label: "For hospices", href: "/for-hospices" },
];

export type Where = "now" | "in-story";
export interface Capability { id: string; title: string; text: string; href: string; cta: string; where: Where; demoHref?: string }
const DEMO = "/demo?who=nani";
export const CAPABILITIES: Capability[] = [
  { id: "story", title: "Create a personal story", text: "A first name is enough. Add favourite songs, dishes, films and places, or skip anything you like.", href: "/start", cta: "Start a story", where: "now" },
  { id: "portrait", title: "Build a Taste Portrait", text: "Genie's agent looks each favourite up in Qloo. When an exact item is not found it steps down a documented ladder: another spelling, a parent such as the artist or cuisine, or a gentle guess from their era and place. Every item says which it was.", href: "/start", cta: "Watch it build", where: "now", demoHref: DEMO },
  { id: "circle", title: "Invite family with Wish Circle", text: "Share a private link. Relatives answer a few gentle questions after a clear consent step, and nothing is shown until they agree.", href: "/start", cta: "Begin a story to invite family", where: "in-story", demoHref: DEMO },
  { id: "wishes", title: "Generate wishes and discover related interests", text: "Three to five wishes, each traceable to the items it came from and labelled as told by the family or a guess. Qloo can add one discovery, shown as Qloo's guess.", href: "/start", cta: "Generate wishes", where: "in-story", demoHref: DEMO },
  { id: "makers", title: "Find and request Wish Makers", text: "Matches come with plain reasons and a label showing whether Qloo or a simple name match found them. Contact details stay private until a maker accepts.", href: "/start", cta: "Begin a story to find makers", where: "in-story", demoHref: DEMO },
  { id: "track", title: "Track the maker's response", text: "A timeline shows Suggested, Asked, Accepted and Done from the real request status. Families can withdraw a request at any time.", href: "/start", cta: "Begin a story to track wishes", where: "in-story", demoHref: DEMO },
  { id: "book", title: "Compile, print and share a Wish Book", text: "A keepsake of the portrait, family memories and wishes. Print it or save it as a PDF, and share it by a private link you can turn off.", href: "/start", cta: "Begin a story to make a book", where: "in-story", demoHref: DEMO },
  { id: "privacy", title: "Control retention and delete everything", text: "Choose how long a story is kept. One action deletes the portrait, wishes, answers, matches and book.", href: "/start", cta: "Begin a story", where: "in-story" },
  { id: "apply", title: "Apply to become a Wish Maker", text: "Musicians, home cooks, storytellers, cafes and volunteers can apply. A person reviews every application before anyone is listed.", href: "/makers/apply", cta: "Apply as a Wish Maker", where: "now" },
  { id: "hospice", title: "Coordinate as a hospice or care team", text: "A private dashboard for care organisations: stories opened with consent, wish progress, retention deadlines and a team with roles.", href: "/for-hospices", cta: "See the hospice pathway", where: "now" },
];

export const PROCESS: { title: string; text: string }[] = [
  { title: "Tell Genie what they loved", text: "Favourites from you, and memories from family through Wish Circle." },
  { title: "Genie builds a portrait", text: "Items are resolved in Qloo, expanded into taste links, and labelled by source." },
  { title: "Wishes appear, with reasons", text: "Small, personal ideas. You choose what to keep." },
  { title: "Someone can make it happen", text: "Ask a Wish Maker. They accept or decline, and you follow it to done." },
];

export const PRIVACY_POINTS: string[] = [
  "No account is needed. A story is kept only as long as you choose, and one action deletes it.",
  "Family memories are shared only with consent, and you can skip any question.",
  "Wish Makers are approved by a person first. Contact details are shared only after they accept.",
  "Genie sends favourite names to Qloo and, to read typed answers, to a third-party AI service. Nothing else about a person is sent.",
  "Genie is not a medical service and does not give medical advice.",
];

/** Anchors on the landing page that other links point at. */
export const HOME_SECTION_IDS = ["meet", "start", "does", "how", "demo", "pathways", "trust"] as const;
