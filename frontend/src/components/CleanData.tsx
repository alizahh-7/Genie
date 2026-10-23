import type { ReactNode } from "react";
import { displayValue, labelFor, MAX_TAGS, pruneEmpty, tagNames } from "@/lib/compare";

const chip = "rounded-md bg-navy/5 px-2.5 py-0.5 text-sm";

function Tags({ names }: { names: string[] }) {
  const shown = names.slice(0, MAX_TAGS);
  const more = names.length - shown.length;
  return <div className="flex flex-wrap gap-2">{shown.map(n => <span key={n} className={chip}>{n}</span>)}{more > 0 && <span className="text-sm text-navy/60">and {more} more</span>}</div>;
}

function Node({ k, v }: { k: string; v: unknown }): ReactNode {
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return <p>{displayValue(k, v)}</p>;
  if (Array.isArray(v)) {
    const tags = tagNames(v);
    if (tags) return <Tags names={tags} />;
    if (v.every(x => typeof x === "string" || typeof x === "number")) return <p>{v.map(x => displayValue(k, x as string | number)).join(" · ")}</p>;
    return <div className="space-y-3">{v.map((x, i) => <div key={i} className="rounded-2xl border border-ivory/15 p-4"><Node k={k} v={x} /></div>)}</div>;
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const headKey = typeof o.title === "string" ? "title" : typeof o.name === "string" ? "name" : null;
    const rest = Object.entries(o).filter(([key]) => key !== headKey);
    return (
      <div className="space-y-2">
        {headKey && <h3 className="text-2xl">{String(o[headKey])}</h3>}
        {rest.map(([key, val]) => key === "description" && typeof val === "string"
          ? <p key={key}>{val}</p>
          : <div key={key}><p className="text-xs uppercase tracking-wider text-navy/60">{labelFor(key)}</p><div className="mt-1"><Node k={key} v={val} /></div></div>)}
      </div>
    );
  }
  return null;
}

/** Renders API data without empty fields. Renders nothing when there is nothing real to show, so callers choose any empty-state wording. */
export function CleanData({ value }: { value: unknown }) {
  const v = pruneEmpty(value);
  if (v === undefined) return null;
  return <Node k="" v={v} />;
}
export const hasData = (value: unknown) => pruneEmpty(value) !== undefined;
