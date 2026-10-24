import type { Metadata } from "next";
import type { ReactNode } from "react";
import { OrgFrame } from "@/components/OrgFrame";

// The private link is the login: keep it out of search results and out of every outbound referrer.
export const metadata: Metadata = { title: "Organisation portal · Genie", robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };

export default function OrgLayout({ children, params }: { children: ReactNode; params: { token: string } }) {
  return <OrgFrame token={params.token}>{children}</OrgFrame>;
}
