import type { Metadata, Viewport } from "next";
import { Open_Sans } from "next/font/google";
import "./globals.css";

const openSans = Open_Sans({
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  ),
  title: "מסיבת פרידה - איילת | אישור הגעה",
  description:
    "תזכורת ואישור הגעה למסיבת הפרידה של איילת · 7 בספטמבר 2026 · תחנת רוח, טבעון",
  // No Open Graph / social preview — WhatsApp should show plain links only.
  openGraph: {
    title: "מסיבת פרידה - איילת",
    description: " ",
    images: [],
    type: "website",
  },
  twitter: {
    card: "summary",
    images: [],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${openSans.variable} min-h-full`}
    >
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
