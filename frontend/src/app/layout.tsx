import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "kvart na kvadrat",
  description: "vaš omiljeni susjed",
  applicationName: "kvart na kvadrat",
  openGraph: {
    title: "kvart na kvadrat",
    description: "vaš omiljeni susjed",
    siteName: "kvart na kvadrat",
    locale: "hr_HR",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a4ea3",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hr" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
