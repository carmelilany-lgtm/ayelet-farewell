"use client";

export type AdminTab = "guests" | "content" | "log";

const TABS: {
  id: AdminTab;
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "guests",
    label: "אורחים",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z"
        />
      </svg>
    ),
  },
  {
    id: "content",
    label: "תוכן",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path
          fill="currentColor"
          d="M4 5h16v2H4V5Zm0 6h16v2H4v-2Zm0 6h10v2H4v-2Z"
        />
      </svg>
    ),
  },
  {
    id: "log",
    label: "יומן",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path
          fill="currentColor"
          d="M7 3h10a2 2 0 0 1 2 2v14l-7-3-7 3V5a2 2 0 0 1 2-2Zm0 2v11.2l5-2.14 5 2.14V5H7Z"
        />
      </svg>
    ),
  },
];

export function AdminBottomNav({
  tab,
  onChange,
}: {
  tab: AdminTab;
  onChange: (tab: AdminTab) => void;
}) {
  return (
    <nav className="admin-bottom-nav" aria-label="ניווט ניהול">
      {TABS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`admin-bottom-nav-item ${tab === item.id ? "active" : ""}`}
          onClick={() => onChange(item.id)}
          aria-current={tab === item.id ? "page" : undefined}
        >
          <span className="admin-bottom-nav-icon">{item.icon}</span>
          <span className="admin-bottom-nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
