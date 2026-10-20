"use client";
import { useCallback, useState } from "react";
import { ApiError } from "./errors";
export function useTask() {
  const [busy, setBusy] = useState(false); const [slow, setSlow] = useState(false);
  const [error, setError] = useState(""); const [status, setStatus] = useState(0);
  const run = useCallback(async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true); setSlow(false); setError(""); setStatus(0);
    const timer = setTimeout(() => setSlow(true), 6000);
    try { return await fn(); }
    catch (e) {
      if (e instanceof ApiError) { setError(e.friendly); setStatus(e.status); }
      else setError("Something went wrong. Please try again.");
      return undefined;
    } finally { clearTimeout(timer); setBusy(false); setSlow(false); }
  }, []);
  return { run, busy, slow, error, status };
}
