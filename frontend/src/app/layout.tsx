import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pronađi svoje podudaranje u Zagrebu",
  description:
    "Demo asistent koji ti pomaže pronaći prave ponude i zahtjeve u Zagrebu te pripremiti objavu. Sintetički podaci, bez živih integracija.",
};

export const viewport: Viewport = {
  themeColor: "#f6f0e1",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hr">
      <body>{children}</body>
    </html>
  );
}
