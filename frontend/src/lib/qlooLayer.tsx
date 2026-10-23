"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/** "Show what Qloo did" state. Lightweight context, remembered for the browser tab so it stays consistent across a person's journey. */
export const QLOO_LAYER_KEY = "genie.showQlooLayer";
interface Layer { on: boolean; setOn: (v: boolean) => void; toggle: () => void }
const Ctx = createContext<Layer>({ on: false, setOn: () => {}, toggle: () => {} });

export function QlooLayerProvider({ children, initialOn = false }: { children: ReactNode; initialOn?: boolean }) {
  const [on, setOnState] = useState(initialOn);
  // Read after mount so server and first client render agree (always off), then restore the saved choice.
  useEffect(() => { try { if (window.sessionStorage.getItem(QLOO_LAYER_KEY) === "1") setOnState(true); } catch { /* storage unavailable: stay off */ } }, []);
  const setOn = useCallback((v: boolean) => { setOnState(v); try { window.sessionStorage.setItem(QLOO_LAYER_KEY, v ? "1" : "0"); } catch { /* ignore */ } }, []);
  const toggle = useCallback(() => setOn(!on), [on, setOn]);
  const value = useMemo(() => ({ on, setOn, toggle }), [on, setOn, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
/** Outside a provider the layer is simply off, so shared components are safe on any page. */
export const useQlooLayer = (): Layer => useContext(Ctx);
