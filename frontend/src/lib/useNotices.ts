"use client";
import { useEffect, useState } from "react";
import { api } from "./api";

let cached: Promise<unknown> | null = null;
/** GET /meta/notices once per page load. A failure resolves to undefined so callers fall back to their own wording. */
export function loadNotices(): Promise<unknown> {
  if (!cached) cached = api<unknown>("/meta/notices", { timeout: 20000 }).catch(() => { cached = null; return undefined; });
  return cached;
}
export function useNotices(): unknown {
  const [notices, setNotices] = useState<unknown>(undefined);
  useEffect(() => { let live = true; loadNotices().then(n => { if (live) setNotices(n); }); return () => { live = false; }; }, []);
  return notices;
}
