import type { Metadata } from "next";
import type { ReactNode } from "react";
// A shared link is private: keep it out of search results and out of outbound referrers.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function Layout({ children }: { children: ReactNode }) { return children; }
