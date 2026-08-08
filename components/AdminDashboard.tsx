"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { inviteAbsoluteUrl } from "@/lib/invite-token";
import { formatPhoneDisplay } from "@/lib/phone";
import {
  DEFAULT_SITE_CONTENT,
  formatProgramLines,
  parseProgramLine,
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
type ContentSection =
  | "hero"
  | "program"
  | "links"
  | "rsvp"
  | "thanks"
  | "whatsapp";

const CONTENT_SECTIONS: { id: ContentSection; label: string }[] = [
  { id: "hero", label: "דף ראשי" },
  { id: "program", label: "תוכנית" },
  { id: "links", label: "קישורים" },
  { id: "rsvp", label: "אישור הגעה" },
  { id: "thanks", label: "הודעות תודה" },
  { id: "whatsapp", label: "WhatsApp" },
];

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

function Fields({
  fields,
  columns = 1,
  fieldValue,
  onChange,
}: {
  fields: FieldDef[];
  columns?: 1 | 2;
  fieldValue: (key: keyof SiteContent) => string;
  onChange: (key: keyof SiteContent, value: string) => void;
}) {
  return (
    <div className={`content-grid ${columns === 2 ? "two" : ""}`}>
      {fields.map((field) => (
        <Field
          key={field.key}
          field={field}
          value={fieldValue(field.key)}
          onChange={(v) => onChange(field.key, v)}
        />
      ))}
    </div>
  );
}

function LinkPair({
  title,
  labelKey,
  urlKey,
  fieldValue,
  onChange,
}: {
  title: string;
  labelKey: keyof SiteContent;
  urlKey: keyof SiteContent;
  fieldValue: (key: keyof SiteContent) => string;
  onChange: (key: keyof SiteContent, value: string) => void;
}) {
  return (
    <div className="content-link-pair">
      <p className="content-link-pair-title">{title}</p>
      <div className="content-grid two">
        <Field
          field={{ key: labelKey, label: "טקסט על הכפתור" }}
          value={fieldValue(labelKey)}
          onChange={(v) => onChange(labelKey, v)}
        />
        <Field
          field={{
            key: urlKey,
            label: "קישור",
            hint: "ריק = מוסתר באתר",
          }}
          value={fieldValue(urlKey)}
          onChange={(v) => onChange(urlKey, v)}
        />
      </div>
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
  const [contentSection, setContentSection] = useState<ContentSection>("hero");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [summary, setSummary] = useState<RsvpSummary | null>(null);
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [content, setContent] = useState<SiteContent>(DEFAULT_SITE_CONTENT);
  const [savingContent, setSavingContent] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [bulkSending, setBulkSending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [origin, setOrigin] = useState("");
  const [dirty, setDirty] = useState(false);
  const [guestSearch, setGuestSearch] = useState("");

  const filteredRsvps = useMemo(() => {
    const q = guestSearch.trim().toLowerCase();
    if (!q) return rsvps;
    return rsvps.filter((r) => {
      const name = r.full_name.toLowerCase();
      const phone = formatPhoneDisplay(r.phone).toLowerCase();
      const phoneDigits = r.phone.replace(/\D/g, "");
      const qDigits = q.replace(/\D/g, "");
      return (
        name.includes(q) ||
        phone.includes(q) ||
        (qDigits.length >= 3 && phoneDigits.includes(qDigits))
      );
    });
  }, [rsvps, guestSearch]);

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
    const ok = confirm(
      force
        ? "לשלוח שוב תזכורת WhatsApp לאורח זה?"
        : "לשלוח תזכורת WhatsApp לאורח זה עכשיו?"
    );
    if (!ok) return;

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
    if (
      !confirm(
        `לשלוח תזכורת WhatsApp ידנית ל־${pending} אורחים?\n(לא נשלח אוטומטית — רק באישור הזה)`
      )
    )
      return;
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

  async function resetReminder(id: string) {
    if (!confirm("לאפס את סטטוס התזכורת לאורח זה? (כאילו לא נשלחה)")) return;
    setError(null);
    setInfo(null);
    setResetting(true);
    try {
      const res = await fetch("/api/admin/reset-reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "שגיאה באיפוס");
        return;
      }
      setInfo(data.message || "התזכורת אופסה");
      await load();
    } catch {
      setError("בעיית רשת באיפוס");
    } finally {
      setResetting(false);
    }
  }

  async function resetAllReminders() {
    const sent = summary?.reminders_sent ?? 0;
    if (
      !confirm(
        `לאפס את כל ${sent} התזכורות שנשלחו?\nאפשר יהיה לשלוח שוב מההתחלה.`
      )
    )
      return;
    setError(null);
    setInfo(null);
    setResetting(true);
    try {
      const res = await fetch("/api/admin/reset-reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "שגיאה באיפוס");
        return;
      }
      setInfo(data.message || "כל התזכורות אופסו");
      await load();
    } catch {
      setError("בעיית רשת באיפוס");
    } finally {
      setResetting(false);
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
          .map((s) => parseProgramLine(s))
          .filter((x): x is NonNullable<typeof x> => Boolean(x?.title)),
      }));
      return;
    }
    setContent((c) => ({ ...c, [key]: value }));
  }

  function fieldValue(key: keyof SiteContent) {
    if (key === "programItems") return formatProgramLines(content.programItems);
    return String(content[key] ?? "");
  }

  if (loading) return <p className="admin-muted">טוען…</p>;

  if (!authed) {
    return (
      <form className="admin-login" onSubmit={login}>
        <div className="admin-login-ornament" aria-hidden="true" />
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
          <p className="admin-kicker">מסיבת פרידה · איילת</p>
          <h1>ניהול</h1>
          <p>תזכורות נשלחות רק בלחיצה ידנית</p>
        </div>
        <div className="admin-actions">
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

          <div className="admin-toolbar">
            <button
              type="button"
              className="admin-btn"
              onClick={sendAllPending}
              disabled={bulkSending || resetting || !summary.reminders_pending}
            >
              {bulkSending
                ? "שולח…"
                : `שלח תזכורות ממתינות (${summary.reminders_pending})`}
            </button>
            <button
              type="button"
              className="admin-btn ghost"
              onClick={resetAllReminders}
              disabled={bulkSending || resetting || !summary.reminders_sent}
            >
              {resetting
                ? "מאפס…"
                : `איפוס כל התזכורות (${summary.reminders_sent})`}
            </button>
            <a className="admin-btn ghost" href="/api/admin/rsvps?format=csv">
              ייצוא CSV
            </a>
          </div>

          <div className="admin-search">
            <label htmlFor="guest_search">חיפוש לפי שם או טלפון</label>
            <input
              id="guest_search"
              type="search"
              placeholder="למשל: אורטל"
              value={guestSearch}
              onChange={(e) => setGuestSearch(e.target.value)}
              autoComplete="off"
            />
            {guestSearch.trim() && (
              <p className="admin-search-meta">
                מציג {filteredRsvps.length} מתוך {rsvps.length}
              </p>
            )}
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
                {filteredRsvps.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="admin-empty">
                      {guestSearch.trim()
                        ? "לא נמצאו אורחים לחיפוש הזה"
                        : "אין אורחים עדיין"}
                    </td>
                  </tr>
                ) : (
                  filteredRsvps.map((r) => (
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
                            resetting ||
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
                        {r.reminder_sent_at && (
                          <button
                            type="button"
                            className="link-btn ghost"
                            disabled={bulkSending || resetting}
                            onClick={() => resetReminder(r.id)}
                          >
                            איפוס
                          </button>
                        )}
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "content" && (
        <form className="content-form content-layout" onSubmit={saveContent}>
          <nav className="content-sections" aria-label="קטגוריות תוכן">
            {CONTENT_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`content-section-tab ${
                  contentSection === section.id ? "active" : ""
                }`}
                onClick={() => setContentSection(section.id)}
              >
                {section.label}
              </button>
            ))}
          </nav>

          {contentSection === "hero" && (
            <Panel
              title="דף ראשי"
              description="מה שמופיע בראש העמוד — ציטוט, כותרת, תאריך ומקום"
            >
              <Fields
                columns={2}
                fieldValue={fieldValue}
                onChange={updateField}
                fields={[
                  { key: "quote", label: "ציטוט", span2: true },
                  { key: "quoteSource", label: "מקור", span2: true },
                  { key: "banner", label: "כותרת משנה" },
                  { key: "title", label: "כותרת ראשית" },
                  { key: "dateTime", label: "תאריך ושעה" },
                  { key: "place", label: "מיקום" },
                  { key: "ctaLabel", label: "טקסט כפתור אישור" },
                  {
                    key: "coverImage",
                    label: "תמונת רקע",
                    hint: "למשל /invite.jpg",
                  },
                  {
                    key: "footer",
                    label: "שורה בתחתית האתר",
                    span2: true,
                  },
                ]}
              />
            </Panel>
          )}

          {contentSection === "program" && (
            <Panel
              title="תוכנית הערב"
              description="לוח הזמנים והערות שמופיעים באזור הפרטים"
            >
              <Fields
                fieldValue={fieldValue}
                onChange={updateField}
                fields={[
                  { key: "programTitle", label: "כותרת" },
                  {
                    key: "programItems",
                    label: "פריטים",
                    multiline: true,
                    rows: 5,
                    hint: "שורה לכל פריט: 18:00 | ברכות ומוזיקה",
                  },
                  { key: "hosts", label: "הנחייה" },
                  {
                    key: "giftNote",
                    label: "הערת מתנות",
                    multiline: true,
                    rows: 3,
                  },
                ]}
              />
            </Panel>
          )}

          {contentSection === "links" && (
            <Panel
              title="קישורים"
              description="כפתורי ניווט וביט — השאירו קישור ריק כדי להסתיר"
            >
              <Fields
                fieldValue={fieldValue}
                onChange={updateField}
                fields={[
                  { key: "linksTitle", label: "כותרת האזור" },
                ]}
              />
              <div className="content-link-list">
                <LinkPair
                  title="Waze"
                  labelKey="wazeLabel"
                  urlKey="wazeUrl"
                  fieldValue={fieldValue}
                  onChange={updateField}
                />
                <LinkPair
                  title="Google Maps"
                  labelKey="mapsLabel"
                  urlKey="mapsUrl"
                  fieldValue={fieldValue}
                  onChange={updateField}
                />
                <LinkPair
                  title="ביט"
                  labelKey="bitLabel"
                  urlKey="bitUrl"
                  fieldValue={fieldValue}
                  onChange={updateField}
                />
              </div>
            </Panel>
          )}

          {contentSection === "rsvp" && (
            <Panel
              title="אישור הגעה"
              description="טקסטים בטופס ובקישורים האישיים"
            >
              <Fields
                fieldValue={fieldValue}
                onChange={updateField}
                fields={[
                  { key: "rsvpTitle", label: "כותרת האזור" },
                  {
                    key: "confirmPrompt",
                    label: "הודעה לפני הטופס",
                    multiline: true,
                    rows: 4,
                  },
                  {
                    key: "rsvpLeadHome",
                    label: "הסבר בדף הראשי",
                    multiline: true,
                    rows: 2,
                  },
                  {
                    key: "rsvpLeadInvite",
                    label: "הסבר בקישור אישי",
                    multiline: true,
                    rows: 2,
                    hint: "אפשר להשתמש ב־{name}",
                  },
                  {
                    key: "rsvpHelp",
                    label: "טקסט עזרה",
                    multiline: true,
                    rows: 2,
                  },
                  { key: "invalidLinkTitle", label: "כותרת לקישור לא תקין" },
                  {
                    key: "invalidLinkBody",
                    label: "הסבר לקישור לא תקין",
                    multiline: true,
                    rows: 2,
                  },
                ]}
              />
            </Panel>
          )}

          {contentSection === "thanks" && (
            <Panel
              title="הודעות תודה"
              description="מה שמופיע אחרי שליחת האישור, לפי סוג העדכון"
            >
              <Fields
                fieldValue={fieldValue}
                onChange={updateField}
                fields={[
                  {
                    key: "thankYouConfirmed",
                    label: "אישור הגעה",
                    multiline: true,
                    rows: 3,
                    hint: "כשמשאירים את מספר האורחים כמו שהיה",
                  },
                  {
                    key: "thankYouUpdated",
                    label: "שינוי מספר אורחים",
                    multiline: true,
                    rows: 3,
                  },
                  {
                    key: "thankYouDeclined",
                    label: "לא יכול/ה להגיע",
                    multiline: true,
                    rows: 3,
                  },
                  {
                    key: "thankYouMaybe",
                    label: "עדיין לא בטוח/ה",
                    multiline: true,
                    rows: 3,
                  },
                ]}
              />
            </Panel>
          )}

          {contentSection === "whatsapp" && (
            <Panel
              title="הודעת WhatsApp"
              description="תבנית התזכורת שנשלחת ידנית מהניהול"
            >
              <Fields
                fieldValue={fieldValue}
                onChange={updateField}
                fields={[
                  {
                    key: "reminderIntro",
                    label: "פתיח",
                    multiline: true,
                    rows: 2,
                  },
                  {
                    key: "reminderSiteLabel",
                    label: "לפני קישור האתר",
                    hint: "למשל: לפרטים נוספים",
                  },
                  {
                    key: "reminderLinkLabel",
                    label: "לפני קישור אישי",
                    hint: "למשל: לעדכון סטטוס ההגעה שלכם",
                  },
                  {
                    key: "reminderOutro",
                    label: "סיום",
                    multiline: true,
                    rows: 3,
                  },
                ]}
              />
              <div className="content-preview">
                <p className="content-preview-label">תצוגה מקדימה</p>
                <pre className="content-preview-body">{`שלום [שם],

${content.reminderIntro}

📅 ${content.dateTime}
📍 ${content.place}

${content.reminderSiteLabel}:
https://ayelet-farewell.vercel.app

${content.reminderLinkLabel}:
https://ayelet-farewell.vercel.app/i/xxxxxxxx

${content.reminderOutro}`}</pre>
              </div>
            </Panel>
          )}

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
