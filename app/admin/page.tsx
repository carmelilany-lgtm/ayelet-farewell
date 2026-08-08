import { AdminDashboard } from "@/components/AdminDashboard";

export const metadata = {
  title: "ניהול | מסיבת פרידה — איילת",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <main className="admin-page">
      <AdminDashboard />
    </main>
  );
}
