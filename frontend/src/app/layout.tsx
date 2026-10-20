import "./globals.css";
import type { ReactNode } from "react";
export const metadata = { title: "Genie", description: "Everyone deserves to be known before they go." };
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
