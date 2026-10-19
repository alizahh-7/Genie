import "./globals.css";
import type { ReactNode } from "react";
export const metadata = { title: "Genie", description: "Everyone deserves to be known before they go." };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
