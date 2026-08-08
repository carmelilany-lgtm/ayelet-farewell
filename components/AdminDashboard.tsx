"use client";

import { useCallback, useEffect, useState } from "react";
import { inviteAbsoluteUrl } from "@/lib/invite-token";
import { formatPhoneDisplay } from "@/lib/phone";
import {
  DEFAULT_SITE_CONTENT,
  type SiteContent,
} from "@/lib/site-content-defaults";
import type { Rsvp, RsvpSummary } from "@/lib/types";

const statusLabel: Record<Rsvp["status"], string> = {
  imported: "ממתין לאישור סופי",
  confirmed: "אושר סופית",
  declined: "לא מגיע/ה",
  maybe: "לא בטוח/ה",
};

type Tab = "guests" | "content";

const CONTENT_FIELDS: {
  key: keyof SiteContent;
  label: string;
  multiline?: boolean;
  hint?: string;
}[] = [
  { key: "quote", label: "ציטוט" },
  { key: "quoteSource", label: "מקור הציטוט" },
  { key: "banner", label: "כותרת משנה (eyebrow)" },
  { key: "title", label: "כותרת ראשית" },
  { key: "dateTime", label: "תאריך ושעה" },
  { key: "place", label: "מיקום" },
  { key: "mapsUrl", label: "קישור ל־Google Maps" },
  { key: "wazeUrl", label: "קישור ל־Waze" },
  { key: "bitUrl", label: "קישור לביט" },
  { key: "bitLabel", label: "טקסט כפתור ביט" },
  { key: "coverImage", label: "תמונת נושא (נתיב, למשל /invite.jpg)" },
  { key: "coverCaption", label: "כותרת תמונת נושא" },
  { key: "ctaLabel", label: "טקסט כפתור ב־Hero" },
  { key: "programTitle", label: "כותרת תוכנית" },
  {
    key: "programItems",
    label: "פריטי תוכנית (שורה לכל פריט)",
    multiline: true,
  },
  { key: "hosts", label: "הנחייה" },
  { key: "giftNote", label: "הערת מתנות", multiline: true },
  { key: "rsvpTitle", label: "כותרת אישור הגעה" },
  { key: "rsvpLeadHome", label: "טקסט אישור בדף הראשי", multiline: true },
  { key: "rsvpHelp", label: "טקסט עזרה (לא מצאתם קישור)", multiline: true },
  {
    key: "rsvpLeadInvite",
    label: "טקסט אישי בדף הקישור (השתמשו ב־{name})",
    multiline: true,
  },
  { key: "invalidLinkTitle", label: "כותרת קישור לא תקין" },
  { key: "invalidLinkBody", label: "תוכן קישור לא תקין", multiline: true },
  { key: "footer", label: "פוטר" },
  { key: "reminderIntro", label: "פתיח הודעת WhatsApp", multiline: true },
  { key: "reminderOutro", label: "סיום הודעת WhatsApp", multiline: true },
];

export function AdminDashboard() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("guests");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [summary, setSummary] = useState<RsvpSummary | null>(null);
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [content, setContent] = useState<SiteContent>(DEFAULT_SITE_CONTENT);
  const [savingContent, setSavingContent] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [bulkSending, setBulkSending] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const [rsvpRes, contentRes] = await Promise.all([
      fetch("/api/admin/rsvps"),
      fetch("/api/admin/content"),
    ]);

    if (rsvpRes.status === 401 || contentRes.status === 401) {
      setAuthed(false);
      setLoading(false);
      return;
    }

    if (!rsvpRes.ok) {
      setError("שגיאה בטעינת הנתונים");
      setLoading(false);
      return;
    }

    const rsvpData = await rsvpRes.json();
    setSummary(rsvpData.summary);
    setRsvps(rsvpData.rsvps);

    if (contentRes.ok) {
      const contentData = await contentRes.json();
      setContent(contentData.content);
    }

    setAuthed(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/rsvps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      setError("סיסמה שגויה");
      return;
    }
    setPassword("");
    await load();
  }

  async function logout() {
    await fetch("/api/admin/rsvps", { method: "DELETE" });
    setAuthed(false);
    setSummary(null);
    setRsvps([]);
  }

  async function copyLink(r: Rsvp) {
    await navigator.clipboard.writeText(
      inviteAbsoluteUrl(r.invite_token, origin)
    );
    setCopiedId(r.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  async function sendReminder(id: string, force = false) {
    setError(null);
    setInfo(null);
    setSendingId(id);
    try {
      const res = await fetch("/api/admin/send-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, force }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "שגיאה בשליחה");
        return;
      }
      const result = data.results?.[0];
      if (result?.ok) setInfo(`נשלחה תזכורת ל־${result.full_name}`);
      else setError(result?.error || "השליחה נכשלה");
      await load();
    } catch {
      setError("בעיית רשת בשליחה");
    } finally {
      setSendingId(null);
    }
  }

  async function sendAllPending() {
    const pending = summary?.reminders_pending ?? 0;
    if (!confirm(`לשלוח תזכורת WhatsApp ל־${pending} אורחים?`)) return;
    setError(null);
    setInfo(null);
    setBulkSending(true);
    try {
      const res = await fetch("/api/admin/send-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingOnly: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "שגיאה בשליחה מרובה");
        return;
      }
      setInfo(`נשלחו ${data.sent} הודעות · נכשלו ${data.failed}`);
      await load();
    } catch {
      setError("בעיית רשת בשליחה מרובה");
    } finally {
      setBulkSending(false);
    }
  }

  async function saveContent(e: React.FormEvent) {
    e.preventDefault();
    setSavingContent(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/admin/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "שגיאה בשמירת תוכן");
        return;
      }
      setContent(data.content);
      setInfo("הטקסטים נשמרו ויעודכנו באתר");
    } catch {
      setError("בעיית רשת בשמירת תוכן");
    } finally {
      setSavingContent(false);
    }
  }

  function updateField(key: keyof SiteContent, value: string) {
    if (key === "programItems") {
      setContent((c) => ({
        ...c,
        programItems: value
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      }));
      return;
    }
    setContent((c) => ({ ...c, [key]: value }));
  }

  if (loading) return <p className="admin-muted">טוען…</p>;

  if (!authed) {
    return (
      <form className="admin-login" onSubmit={login}>
        <h1>ניהול</h1>
        <p>מסיבת פרידה — איילת</p>
        <label htmlFor="admin_password">סיסמה</label>
        <input
          id="admin_password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="form-error">{error}</p>}
        <button type="submit">כניסה</button>
      </form>
    );
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div>
          <h1>ניהול התזכורת</h1>
          <p>אורחים, שליחות WhatsApp ועריכת טקסטים</p>
        </div>
        <div className="admin-actions">
          {tab === "guests" && (
            <button
              type="button"
              className="admin-btn"
              onClick={sendAllPending}
              disabled={bulkSending || !summary?.reminders_pending}
            >
              {bulkSending
                ? "שולח…"
                : `שלח תזכורות (${summary?.reminders_pending ?? 0})`}
            </button>
          )}
          <a className="admin-btn ghost" href="/api/admin/rsvps?format=csv">
            ייצוא CSV
          </a>
          <button type="button" className="admin-btn ghost" onClick={logout}>
            יציאה
          </button>
        </div>
      </header>

      <nav className="admin-tabs" aria-label="ניווט ניהול">
        <button
          type="button"
          className={`admin-tab ${tab === "guests" ? "active" : ""}`}
          onClick={() => setTab("guests")}
        >
          אורחים
        </button>
        <button
          type="button"
          className={`admin-tab ${tab === "content" ? "active" : ""}`}
          onClick={() => setTab("content")}
        >
          טקסטים באתר
        </button>
      </nav>

      {error && <p className="form-error">{error}</p>}
      {info && <p className="form-info">{info}</p>}

      {tab === "guests" && summary && (
        <>
          <div className="admin-stats">
            <Stat label="סה״כ" value={summary.total_records} />
            <Stat label="אושרו סופית" value={summary.confirmed} />
            <Stat label="ממתינים" value={summary.imported_pending} />
            <Stat label="תזכורות נשלחו" value={summary.reminders_sent} />
            <Stat label="תזכורות ממתינות" value={summary.reminders_pending} />
            <Stat label="אורחים צפויים" value={summary.total_guests_attending} />
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>שם</th>
                  <th>טלפון</th>
                  <th>אורחים</th>
                  <th>סטטוס</th>
                  <th>תזכורת</th>
                  <th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {rsvps.map((r) => (
                  <tr key={r.id}>
                    <td>{r.full_name}</td>
                    <td dir="ltr">{formatPhoneDisplay(r.phone)}</td>
                    <td>{r.guest_count}</td>
                    <td>
                      <span className={`pill status-${r.status}`}>
                        {statusLabel[r.status]}
                      </span>
                    </td>
                    <td>
                      {r.reminder_sent_at ? (
                        <span className="pill status-confirmed">נשלח</span>
                      ) : r.status === "declined" ? (
                        "—"
                      ) : (
                        <span className="pill status-imported">ממתין</span>
                      )}
                    </td>
                    <td>
                      <div className="link-actions">
                        <button
                          type="button"
                          className="link-btn"
                          disabled={
                            sendingId === r.id ||
                            bulkSending ||
                            r.status === "declined"
                          }
                          onClick={() =>
                            sendReminder(r.id, Boolean(r.reminder_sent_at))
                          }
                        >
                          {sendingId === r.id
                            ? "שולח…"
                            : r.reminder_sent_at
                              ? "שלח שוב"
                              : "שלח תזכורת"}
                        </button>
                        <button
                          type="button"
                          className="link-btn ghost"
                          onClick={() => copyLink(r)}
                        >
                          {copiedId === r.id ? "הועתק" : "העתק קישור"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "content" && (
        <form className="content-form" onSubmit={saveContent}>
          {CONTENT_FIELDS.map((field) => {
            const value =
              field.key === "programItems"
                ? content.programItems.join("\n")
                : String(content[field.key] ?? "");
            return (
              <div className="field-row" key={field.key}>
                <label htmlFor={field.key}>{field.label}</label>
                {field.multiline ? (
                  <textarea
                    id={field.key}
                    rows={field.key === "programItems" ? 5 : 3}
                    value={value}
                    onChange={(e) => updateField(field.key, e.target.value)}
                  />
                ) : (
                  <input
                    id={field.key}
                    value={value}
                    onChange={(e) => updateField(field.key, e.target.value)}
                  />
                )}
              </div>
            );
          })}
          <div className="content-actions">
            <button type="submit" className="admin-btn" disabled={savingContent}>
              {savingContent ? "שומר…" : "שמירת טקסטים"}
            </button>
            <a className="admin-btn ghost" href="/" target="_blank" rel="noreferrer">
              תצוגה מקדימה
            </a>
          </div>
        </form>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
