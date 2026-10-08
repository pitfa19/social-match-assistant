import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pričaj sa svojim gradom",
  description:
    "Lokalni demo za Zagreb: reci koji te kvart zanima i karta te vodi tamo.",
};

export const viewport: Viewport = {
  themeColor: "#0a4ea3",
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
