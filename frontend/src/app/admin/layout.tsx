import type { ReactNode } from "react";
export const metadata = { title: "Genie admin", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default function AdminLayout({ children }: { children: ReactNode }) { return <>{children}</>; }
