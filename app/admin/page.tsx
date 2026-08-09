import type { Metadata, Viewport } from "next";
import { AdminDashboard } from "@/components/AdminDashboard";

export const metadata: Metadata = {
  title: "ניהול | מסיבת פרידה - איילת",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    title: "ניהול איילת",
    statusBarStyle: "default",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f8f6f3",
};

export default function AdminPage() {
  return (
    <main className="admin-page">
      <AdminDashboard />
    </main>
  );
}
