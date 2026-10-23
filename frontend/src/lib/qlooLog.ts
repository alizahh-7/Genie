import { clean } from "./labels";

export interface QlooDisplayRow { friendly: string; meta: string; raw: string; hasLabel: boolean }

const TYPE_WORD: Record<string, string> = {
  place: "place", artist: "artist", movie: "film", tv_show: "TV show", brand: "brand", book: "book", podcast: "podcast",
  album: "album", track: "song", person: "person", destination: "destination", videogame: "video game",
};
const article = (w: string) => (/^[aeiou]/i.test(w) ? "an" : "a");
const shorten = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Pulls the endpoint path and the quoted `query` out of strings like "/search {'query': 'Charminar', ...}". Never throws. */
export function parseRequest(request: string): { endpoint?: string; query?: string; type?: string } {
  const m = request.trim().match(/^(?:(?:GET|POST)\s+)?(\/[^\s{?]*)/i);
  const q = request.match(/['"](?:query|q)['"]\s*:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/);
  const t = request.match(/urn:entity:([a-z_]+)/i);
  const query = q ? clean((q[1] ?? q[2] ?? "").replace(/\\(['"])/g, "$1")) : undefined;
  return { endpoint: m ? m[1].toLowerCase() : undefined, query: query ? shorten(query) : undefined, type: t ? t[1].toLowerCase() : undefined };
}

/** A calm one-line description of the call, or undefined when nothing safe can be said. */
export function describeRequest(request: string): string | undefined {
  const { endpoint, query, type } = parseRequest(request);
  if (!endpoint) return undefined;
  const last = endpoint.split("/").filter(Boolean).pop() ?? "";
  if (last === "search") {
    const word = type ? TYPE_WORD[type] : undefined;
    if (query) return `Looked up ${query}${word ? ` as ${article(word)} ${word}` : ""}.`;
    return "Ran a search on Qloo.";
  }
  if (last === "insights") return "Asked Qloo for related taste suggestions.";
  if (last === "tags") return "Looked up taste tags on Qloo.";
  if (last === "entities" || last === "entity") return "Fetched details about an item from Qloo.";
  return `Made a Qloo request to ${endpoint}.`;
}

/**
 * Normalises one log row of any shape. A backend-provided `label` always wins; otherwise the description is derived from
 * the request string; otherwise a generic line. `raw` keeps the original information for the "Show raw log" view.
 */
export function qlooRowDisplay(row: unknown): QlooDisplayRow {
  if (typeof row === "string") {
    return { friendly: describeRequest(row) ?? "Made a Qloo request.", meta: "", raw: row, hasLabel: false };
  }
  if (!row || typeof row !== "object") {
    return { friendly: "Made a Qloo request.", meta: "", raw: String(row ?? ""), hasLabel: false };
  }
  const r = row as Record<string, unknown>;
  const label = clean(r.label);
  const request = clean(r.request);
  const step = clean(r.step);
  const status = typeof r.status === "string" || typeof r.status === "number" ? String(r.status) : "";
  const ms = typeof r.ms === "number" && Number.isFinite(r.ms) ? `${r.ms} ms` : "";
  let raw: string;
  try { raw = request ? `${step ? `${step} ` : ""}${request}` : JSON.stringify(row); } catch { raw = "[unreadable log entry]"; }
  return {
    friendly: label ?? (request ? describeRequest(request) : undefined) ?? "Made a Qloo request.",
    meta: [status, ms].filter(Boolean).join(", "),
    raw,
    hasLabel: Boolean(label),
  };
}
