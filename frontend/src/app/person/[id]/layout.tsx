import type { ReactNode } from "react";
import { QlooLayerProvider } from "@/lib/qlooLayer";

/** One "Show what Qloo did" setting shared by every screen of a person's journey. */
export default function PersonLayout({ children }: { children: ReactNode }) {
  return <QlooLayerProvider>{children}</QlooLayerProvider>;
}
