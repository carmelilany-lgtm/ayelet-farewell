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

type FieldDef = {
  key: keyof SiteContent;
  label: string;
  multiline?: boolean;
  rows?: number;
  hint?: string;
  span2?: boolean;
};

function Field({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={`field-row ${field.span2 ? "span-2" : ""}`}>
      <label htmlFor={field.key}>{field.label}</label>
      {field.multiline ? (
        <textarea
          id={field.key}
          rows={field.rows ?? 3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={field.key}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.hint && <p className="field-hint">{field.hint}</p>}
    </div>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="content-panel">
      <div className="content-panel-head">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children}
    </section>
  );
}

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
  const [dirty, setDirty] = useState(false);

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
      setContent({ ...DEFAULT_SITE_CONTENT, ...contentData.content });
      setDirty(false);
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

  async function saveContent(e?: React.FormEvent) {
    e?.preventDefault();
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
      setContent({ ...DEFAULT_SITE_CONTENT, ...data.content });
      setDirty(false);
      setInfo("הטקסטים נשמרו ויעודכנו באתר");
    } catch {
      setError("בעיית רשת בשמירת תוכן");
    } finally {
      setSavingContent(false);
    }
  }

  function updateField(key: keyof SiteContent, value: string) {
    setDirty(true);
    setInfo(null);
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

  function fieldValue(key: keyof SiteContent) {
    if (key === "programItems") return content.programItems.join("\n");
    return String(content[key] ?? "");
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
          <p>אורחים, שליחות WhatsApp ועריכת כל תוכן האתר</p>
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
          <a className="admin-btn ghost" href="/" target="_blank" rel="noreferrer">
            לאתר
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
          תוכן האתר
        </button>
      </nav>

      {error && tab === "guests" && <p className="form-error">{error}</p>}
      {info && tab === "guests" && <p className="form-info">{info}</p>}

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
        <form className="content-form content-layout" onSubmit={saveContent}>
          <Panel
            title="כותרת עליונה"
            description="מה שמופיע מעל התמונה — ציטוט, כותרת, תאריך ומקום"
          >
            <div className="content-grid two">
              {(
                [
                  { key: "quote", label: "ציטוט", span2: true },
                  { key: "quoteSource", label: "מקור הציטוט" },
                  { key: "banner", label: "כותרת משנה קטנה", hint: "למשל: הזמנה אישית" },
                  { key: "title", label: "כותרת ראשית" },
                  { key: "dateTime", label: "תאריך ושעה" },
                  { key: "place", label: "מיקום" },
                  { key: "ctaLabel", label: "טקסט כפתור לאישור הגעה" },
                  {
                    key: "coverImage",
                    label: "תמונת רקע",
                    hint: "נתיב באתר, למשל /invite.jpg",
                  },
                ] as FieldDef[]
              ).map((field) => (
                <Field
                  key={field.key}
                  field={field}
                  value={fieldValue(field.key)}
                  onChange={(v) => updateField(field.key, v)}
                />
              ))}
            </div>
          </Panel>

          <Panel
            title="תוכנית הערב"
            description="פרטי האירוע שמופיעים מתחת לכותרת"
          >
            <div className="content-grid">
              <Field
                field={{ key: "programTitle", label: "כותרת התוכנית" }}
                value={fieldValue("programTitle")}
                onChange={(v) => updateField("programTitle", v)}
              />
              <Field
                field={{
                  key: "programItems",
                  label: "פריטי תוכנית",
                  multiline: true,
                  rows: 5,
                  hint: "שורה אחת לכל פריט",
                }}
                value={fieldValue("programItems")}
                onChange={(v) => updateField("programItems", v)}
              />
              <Field
                field={{ key: "hosts", label: "הנחייה" }}
                value={fieldValue("hosts")}
                onChange={(v) => updateField("hosts", v)}
              />
              <Field
                field={{
                  key: "giftNote",
                  label: "הערת מתנות / ביט",
                  multiline: true,
                  rows: 3,
                }}
                value={fieldValue("giftNote")}
                onChange={(v) => updateField("giftNote", v)}
              />
            </div>
          </Panel>

          <Panel
            title="קישורים"
            description="Waze, Maps וביט — השאירו קישור ריק כדי להסתיר אותו"
          >
            <div className="content-grid two">
              <Field
                field={{ key: "linksTitle", label: "כותרת אזור הקישורים", span2: true }}
                value={fieldValue("linksTitle")}
                onChange={(v) => updateField("linksTitle", v)}
              />
              <Field
                field={{ key: "wazeLabel", label: "טקסט Waze" }}
                value={fieldValue("wazeLabel")}
                onChange={(v) => updateField("wazeLabel", v)}
              />
              <Field
                field={{ key: "wazeUrl", label: "קישור Waze" }}
                value={fieldValue("wazeUrl")}
                onChange={(v) => updateField("wazeUrl", v)}
              />
              <Field
                field={{ key: "mapsLabel", label: "טקסט Maps" }}
                value={fieldValue("mapsLabel")}
                onChange={(v) => updateField("mapsLabel", v)}
              />
              <Field
                field={{ key: "mapsUrl", label: "קישור Google Maps" }}
                value={fieldValue("mapsUrl")}
                onChange={(v) => updateField("mapsUrl", v)}
              />
              <Field
                field={{ key: "bitLabel", label: "טקסט ביט" }}
                value={fieldValue("bitLabel")}
                onChange={(v) => updateField("bitLabel", v)}
              />
              <Field
                field={{
                  key: "bitUrl",
                  label: "קישור ביט",
                  hint: "חשוב למלא כדי שיופיע בדף",
                }}
                value={fieldValue("bitUrl")}
                onChange={(v) => updateField("bitUrl", v)}
              />
            </div>
          </Panel>

          <Panel
            title="אישור הגעה"
            description="טקסטים באזור ה־RSVP בדף הראשי ובקישורים אישיים"
          >
            <div className="content-grid">
              <Field
                field={{ key: "rsvpTitle", label: "כותרת אזור האישור" }}
                value={fieldValue("rsvpTitle")}
                onChange={(v) => updateField("rsvpTitle", v)}
              />
              <Field
                field={{
                  key: "rsvpLeadHome",
                  label: "טקסט הסבר בדף הראשי",
                  multiline: true,
                }}
                value={fieldValue("rsvpLeadHome")}
                onChange={(v) => updateField("rsvpLeadHome", v)}
              />
              <Field
                field={{
                  key: "rsvpHelp",
                  label: "טקסט עזרה (לא מצאתם את עצמכם)",
                  multiline: true,
                }}
                value={fieldValue("rsvpHelp")}
                onChange={(v) => updateField("rsvpHelp", v)}
              />
              <Field
                field={{
                  key: "confirmPrompt",
                  label: "הודעת האישור האישית",
                  multiline: true,
                  rows: 4,
                  hint: "מופיעה לפני טופס אישור ההגעה",
                }}
                value={fieldValue("confirmPrompt")}
                onChange={(v) => updateField("confirmPrompt", v)}
              />
              <Field
                field={{
                  key: "rsvpLeadInvite",
                  label: "טקסט בדף קישור אישי",
                  multiline: true,
                  hint: "אפשר להשתמש ב־{name} לשם האורח/ת",
                }}
                value={fieldValue("rsvpLeadInvite")}
                onChange={(v) => updateField("rsvpLeadInvite", v)}
              />
              <div className="content-grid two">
                <Field
                  field={{ key: "invalidLinkTitle", label: "כותרת קישור לא תקין" }}
                  value={fieldValue("invalidLinkTitle")}
                  onChange={(v) => updateField("invalidLinkTitle", v)}
                />
                <Field
                  field={{
                    key: "invalidLinkBody",
                    label: "תוכן קישור לא תקין",
                    multiline: true,
                  }}
                  value={fieldValue("invalidLinkBody")}
                  onChange={(v) => updateField("invalidLinkBody", v)}
                />
              </div>
            </div>
          </Panel>

          <Panel
            title="WhatsApp ופוטר"
            description="הודעות תזכורת ושורה בתחתית האתר"
          >
            <div className="content-grid">
              <Field
                field={{
                  key: "reminderIntro",
                  label: "פתיח הודעת תזכורת",
                  multiline: true,
                }}
                value={fieldValue("reminderIntro")}
                onChange={(v) => updateField("reminderIntro", v)}
              />
              <Field
                field={{
                  key: "reminderOutro",
                  label: "סיום הודעת תזכורת",
                  multiline: true,
                }}
                value={fieldValue("reminderOutro")}
                onChange={(v) => updateField("reminderOutro", v)}
              />
              <Field
                field={{ key: "footer", label: "פוטר בתחתית האתר" }}
                value={fieldValue("footer")}
                onChange={(v) => updateField("footer", v)}
              />
            </div>
          </Panel>

          <div className="content-sticky-bar">
            <p
              className={`save-status ${error ? "err" : info && !dirty ? "ok" : ""}`}
            >
              {error
                ? error
                : dirty
                  ? "יש שינויים שלא נשמרו"
                  : info || "הכול מעודכן"}
            </p>
            <div className="content-actions">
              <a
                className="admin-btn ghost"
                href="/"
                target="_blank"
                rel="noreferrer"
              >
                תצוגה מקדימה
              </a>
              <button
                type="submit"
                className="admin-btn primary"
                disabled={savingContent || !dirty}
              >
                {savingContent ? "שומר…" : "שמירת שינויים"}
              </button>
            </div>
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
