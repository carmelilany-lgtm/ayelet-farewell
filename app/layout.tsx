import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import "./globals.css";

const openSans = Open_Sans({
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  ),
  title: "מסיבת פרידה — איילת | אישור הגעה",
  description:
    "תזכורת ואישור הגעה סופי למסיבת הפרידה של איילת · 7 בספטמבר 2026 · תחנת רוח, טבעון",
  openGraph: {
    title: "מסיבת פרידה — איילת",
    description: "7 בספטמבר 2026 | 18:00–21:00 · תחנת רוח, טבעון",
    images: ["/invite.jpg"],
    locale: "he_IL",
    type: "website",
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
      className={`${openSans.variable} h-full`}
    >
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
