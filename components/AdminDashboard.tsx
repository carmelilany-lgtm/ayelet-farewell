"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { inviteAbsoluteUrl } from "@/lib/invite-token";
import { formatPhoneDisplay, normalizePhone, phonesMatch } from "@/lib/phone";
import {
  DEFAULT_SITE_CONTENT,
  formatProgramLines,
  migrateStoredSiteContent,
  parseProgramLine,
  type SiteContent,
} from "@/lib/site-content-defaults";
import { ProgramScheduleEditor } from "@/components/ProgramScheduleEditor";
import { AdminBottomNav, type AdminTab } from "@/components/admin/AdminBottomNav";
import { AdminSheet, ConfirmSheet } from "@/components/admin/AdminSheet";
import { useIsMobileAdmin } from "@/components/admin/useIsMobileAdmin";
import { summarizeRsvps } from "@/lib/rsvp-summary";
import {
  isManualPendingGuest,
  normalizeGuestName,
  type Rsvp,
  type RsvpStatus,
} from "@/lib/types";
import type { SystemEvent } from "@/lib/system-log";

const statusLabel: Record<Rsvp["status"], string> = {
  imported: "עוד לא אושר",
  confirmed: "אושר",
  declined: "לא מגיע/ה",
  maybe: "עדיין לא יודע/ת",
};

type Tab = AdminTab;

type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
};
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
  { id: "thanks", label: "תודה באתר" },
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

function Accordion({
  title,
  hint,
  children,
  defaultOpen = false,
  /** Changing to a truthy value opens the accordion (e.g. search query). */
  openSignal,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  openSignal?: string | number | false | null;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const openRef = useRef(open);
  const prevSignalRef = useRef<string | number | false | null | undefined>(null);
  const openBeforeSignalRef = useRef(defaultOpen);

  openRef.current = open;

  useEffect(() => {
    const prev = prevSignalRef.current;
    const next = openSignal || null;

    if (next) {
      // New / updated search hit — open, remembering prior state once.
      if (!prev) openBeforeSignalRef.current = openRef.current;
      if (next !== prev) setOpen(true);
    } else if (prev) {
      // Search cleared — restore state from before the search opened it.
      setOpen(openBeforeSignalRef.current);
    }

    prevSignalRef.current = next;
  }, [openSignal]);

  return (
    <details
      className="content-accordion"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="content-accordion-summary">
        <span className="content-accordion-title">{title}</span>
        {hint ? <span className="content-accordion-hint">{hint}</span> : null}
        <span className="content-accordion-chevron" aria-hidden="true" />
      </summary>
      <div className="content-accordion-body">{children}</div>
    </details>
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
      <div className="content-panel-body">{children}</div>
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
  const [statusFilter, setStatusFilter] = useState<RsvpStatus | "all">("all");
  const [drafts, setDrafts] = useState<
    Record<
      string,
      { status: Rsvp["status"]; guest_count: number; full_name: string }
    >
  >({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newGuestName, setNewGuestName] = useState("");
  const [newGuestPhone, setNewGuestPhone] = useState("");
  const [addingGuest, setAddingGuest] = useState(false);
  const [logEvents, setLogEvents] = useState<SystemEvent[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logFilter, setLogFilter] = useState<"all" | "whatsapp" | "rsvp" | "admin">(
    "all"
  );
  const isMobile = useIsMobileAdmin();
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [addGuestOpen, setAddGuestOpen] = useState(false);
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [guestSheetId, setGuestSheetId] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);

  function askConfirm(opts: {
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
  }): Promise<boolean> {
    return new Promise((resolve) => {
      setConfirmReq({ ...opts, resolve });
    });
  }

  const matchesGuestSearch = useCallback(
    (r: Rsvp) => {
      if (statusFilter !== "all") {
        const effectiveStatus = drafts[r.id]?.status ?? r.status;
        if (effectiveStatus !== statusFilter) return false;
      }
      const q = guestSearch.trim().toLowerCase();
      if (!q) return true;
      const name = r.full_name.toLowerCase();
      const phone = formatPhoneDisplay(r.phone).toLowerCase();
      const phoneDigits = r.phone.replace(/\D/g, "");
      const qDigits = q.replace(/\D/g, "");
      return (
        name.includes(q) ||
        phone.includes(q) ||
        (qDigits.length >= 3 && phoneDigits.includes(qDigits))
      );
    },
    [guestSearch, statusFilter, drafts]
  );

  const summary = useMemo(() => {
    const effective = rsvps.map((r) => {
      const d = drafts[r.id];
      if (!d) return r;
      return {
        ...r,
        status: d.status,
        guest_count: d.guest_count,
        full_name: d.full_name,
      };
    });
    return summarizeRsvps(effective);
  }, [rsvps, drafts]);

  const confirmedGuests = useMemo(() => {
    return rsvps
      .filter((r) => (drafts[r.id]?.status ?? r.status) === "confirmed")
      .map((r) => {
        const d = drafts[r.id];
        const guestCount = d?.guest_count ?? r.guest_count;
        return {
          name: d?.full_name?.trim() || r.full_name,
          guestCount: Math.max(guestCount || 1, 1),
        };
      });
  }, [rsvps, drafts]);

  const confirmedGuestNames = useMemo(
    () => confirmedGuests.map((g) => g.name),
    [confirmedGuests]
  );

  const confirmedPeopleTotal = useMemo(
    () => confirmedGuests.reduce((sum, g) => sum + g.guestCount, 0),
    [confirmedGuests]
  );

  const pendingGuestNames = useMemo(() => {
    return rsvps
      .filter((r) => {
        const status = drafts[r.id]?.status ?? r.status;
        return status === "imported" && !isManualPendingGuest(r);
      })
      .map((r) => drafts[r.id]?.full_name?.trim() || r.full_name);
  }, [rsvps, drafts]);

  const confirmedPhones = useMemo(() => {
    const set = new Set<string>();
    for (const r of rsvps) {
      if (r.status !== "confirmed") continue;
      const n = normalizePhone(r.phone) ?? r.phone;
      set.add(n);
    }
    return set;
  }, [rsvps]);

  /** Manual pending only — never anyone who already confirmed. */
  const isManualPendingOnly = useCallback(
    (r: Rsvp) => {
      if (!isManualPendingGuest(r)) return false;
      const n = normalizePhone(r.phone) ?? r.phone;
      return !confirmedPhones.has(n);
    },
    [confirmedPhones]
  );

  const manualPendingRsvps = useMemo(
    () => rsvps.filter((r) => isManualPendingOnly(r) && matchesGuestSearch(r)),
    [rsvps, isManualPendingOnly, matchesGuestSearch]
  );

  const registeredRsvps = useMemo(
    () =>
      rsvps.filter((r) => !isManualPendingOnly(r) && matchesGuestSearch(r)),
    [rsvps, isManualPendingOnly, matchesGuestSearch]
  );

  const registeredTotal = useMemo(
    () => rsvps.filter((r) => !isManualPendingOnly(r)).length,
    [rsvps, isManualPendingOnly]
  );

  const manualPendingTotal = useMemo(
    () => rsvps.filter(isManualPendingOnly).length,
    [rsvps, isManualPendingOnly]
  );

  const manualRemindersPending = useMemo(
    () =>
      rsvps.filter((r) => isManualPendingOnly(r) && !r.reminder_sent_at).length,
    [rsvps, isManualPendingOnly]
  );

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
    setRsvps(rsvpData.rsvps);
    setDrafts({});
    setEditingId(null);

    if (contentRes.ok) {
      const contentData = await contentRes.json();
      setContent(
        migrateStoredSiteContent({
          ...DEFAULT_SITE_CONTENT,
          ...contentData.content,
        })
      );
      setDirty(false);
    }

    setAuthed(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadLog = useCallback(async () => {
    setLogLoading(true);
    try {
      const res = await fetch("/api/admin/system-log?limit=250");
      if (res.status === 401) {
        setAuthed(false);
        return;
      }
      if (!res.ok) {
        setError("שגיאה בטעינת יומן המערכת");
        return;
      }
      const data = await res.json();
      setLogEvents(Array.isArray(data.events) ? data.events : []);
    } catch {
      setError("בעיית רשת בטעינת היומן");
    } finally {
      setLogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed && tab === "log") {
      void loadLog();
    }
  }, [authed, tab, loadLog]);

  const filteredLogEvents = useMemo(() => {
    if (logFilter === "all") return logEvents;
    if (logFilter === "whatsapp") {
      return logEvents.filter(
        (e) => e.source === "whatsapp" || e.action.startsWith("wa_")
      );
    }
    if (logFilter === "rsvp") {
      return logEvents.filter((e) =>
        ["rsvp_update", "rsvp_create", "admin_rsvp_update", "guest_rename"].includes(
          e.action
        )
      );
    }
    return logEvents.filter(
      (e) =>
        e.source === "admin" ||
        e.action.startsWith("reminder_") ||
        e.action === "guest_created" ||
        e.action === "content_save"
    );
  }, [logEvents, logFilter]);

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
    setRsvps([]);
    setDrafts({});
    setEditingId(null);
    setStatusFilter("all");
  }

  function draftFor(r: Rsvp) {
    return (
      drafts[r.id] ?? {
        status: r.status,
        guest_count: Math.max(r.guest_count || 0, r.status === "declined" ? 0 : 1),
        full_name: r.full_name,
      }
    );
  }

  function setDraft(
    id: string,
    patch: Partial<{
      status: Rsvp["status"];
      guest_count: number;
      full_name: string;
    }>
  ) {
    setDrafts((prev) => {
      const current = rsvps.find((r) => r.id === id);
      const base = prev[id] ?? {
        status: current?.status ?? "imported",
        guest_count: Math.max(current?.guest_count || 1, 1),
        full_name: current?.full_name ?? "",
      };
      const next = { ...base, ...patch };
      if (next.status === "declined") next.guest_count = 0;
      else if (next.guest_count < 1) next.guest_count = 1;
      return { ...prev, [id]: next };
    });
  }

  function startEditGuest(r: Rsvp) {
    setDrafts((prev) => ({
      ...prev,
      [r.id]: {
        status: r.status,
        guest_count: Math.max(
          r.guest_count || 0,
          r.status === "declined" ? 0 : 1
        ),
        full_name: r.full_name,
      },
    }));
    setEditingId(r.id);
  }

  function cancelEditGuest(id: string) {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setEditingId((current) => (current === id ? null : current));
  }

  async function saveGuestDraft(
    r: Rsvp,
    override?: Partial<{
      status: Rsvp["status"];
      guest_count: number;
      full_name: string;
    }>
  ) {
    const draft = { ...draftFor(r), ...override };
    if (draft.status === "declined") draft.guest_count = 0;
    else if (draft.guest_count < 1) draft.guest_count = 1;

    if (!draft.full_name.trim() || draft.full_name.trim().length < 2) {
      setError("נא להזין שם תקין");
      return;
    }

    const currentCount =
      r.status === "declined" ? 0 : Math.max(r.guest_count || 1, 1);
    const dirtyDraft =
      draft.status !== r.status ||
      draft.guest_count !== currentCount ||
      draft.full_name.trim() !== r.full_name.trim();

    if (!dirtyDraft) {
      cancelEditGuest(r.id);
      return;
    }

    setDrafts((prev) => ({ ...prev, [r.id]: draft }));
    setError(null);
    setInfo(null);
    setSavingId(r.id);
    try {
      const res = await fetch("/api/admin/rsvps", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: r.id,
          status: draft.status,
          guest_count: draft.guest_count,
          full_name: draft.full_name.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "שגיאה בעדכון אורח");
        return;
      }
      setRsvps((list) =>
        list.map((row) => (row.id === r.id ? data.rsvp : row))
      );
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[r.id];
        return next;
      });
      setEditingId((current) => (current === r.id ? null : current));
      const revoked = data.rsvp.status === "imported" && r.status !== "imported";
      setInfo(
        revoked
          ? `בוטל האישור של ${data.rsvp.full_name} — חזר/ה לעוד לא אושר`
          : `עודכן: ${data.rsvp.full_name} · ${statusLabel[data.rsvp.status as Rsvp["status"]]}`
      );
    } catch {
      setError("בעיית רשת בעדכון אורח");
    } finally {
      setSavingId(null);
    }
  }

  async function addGuest(e: React.FormEvent) {
    e.preventDefault();
    const full_name = newGuestName.trim();
    const phone = newGuestPhone.trim();
    if (!full_name || !phone) {
      setError("נא להזין שם ומספר טלפון");
      return;
    }

    const byPhone = rsvps.find((r) => phonesMatch(r.phone, phone));
    if (byPhone) {
      if (byPhone.status === "confirmed") {
        setError(
          `${byPhone.full_name} כבר אישר/ה הגעה — לא ניתן להוסיף לטרם נרשמו`
        );
      } else if (byPhone.status === "declined") {
        setError(`${byPhone.full_name} כבר מסומן/ת כלא מגיע/ה`);
      } else {
        setError(`מספר הטלפון כבר קיים אצל ${byPhone.full_name}`);
      }
      return;
    }

    const nameKey = normalizeGuestName(full_name);
    const byNameConfirmed = rsvps.find(
      (r) =>
        r.status === "confirmed" &&
        normalizeGuestName(r.full_name) === nameKey
    );
    if (byNameConfirmed) {
      setError(
        `כבר יש אורח/ת מאושר/ת באותו שם: ${byNameConfirmed.full_name} (${formatPhoneDisplay(byNameConfirmed.phone)})`
      );
      return;
    }

    setError(null);
    setInfo(null);
    setAddingGuest(true);
    try {
      const res = await fetch("/api/admin/rsvps", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name, phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "שגיאה בהוספת אורח");
        return;
      }

      setRsvps((list) => [...list, data.rsvp]);
      setNewGuestName("");
      setNewGuestPhone("");
      setAddGuestOpen(false);
      setInfo(`נוסף: ${data.rsvp.full_name}`);
    } catch {
      setError("בעיית רשת בהוספת אורח");
    } finally {
      setAddingGuest(false);
    }
  }

  async function copyLink(r: Rsvp) {
    await navigator.clipboard.writeText(
      inviteAbsoluteUrl(r.invite_token, origin)
    );
    setCopiedId(r.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  async function sendReminder(id: string, force = false) {
    const ok = await askConfirm({
      title: force ? "שליחה חוזרת" : "שליחת תזכורת",
      message: force
        ? "לשלוח שוב תזכורת WhatsApp לאורח זה?"
        : "לשלוח תזכורת WhatsApp לאורח זה עכשיו?",
      confirmLabel: force ? "שלח שוב" : "שלח",
    });
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
    const ok = await askConfirm({
      title: "שליחת תזכורות ממתינות",
      message: `לשלוח תזכורת WhatsApp ידנית ל־${pending} אורחים?\nהשליחה תתקדם עם המתנה של כמה שניות בין הודעה להודעה (כדי לא לחסום את WhatsApp) — אל תסגרו את הדף.`,
      confirmLabel: "שלח לכולם",
    });
    if (!ok) return;
    setActionsOpen(false);
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

  async function sendManualPendingReminders() {
    if (manualRemindersPending < 1) return;
    const ok = await askConfirm({
      title: "תזכורת להוספה ידנית",
      message: `לשלוח תזכורת WhatsApp ל־${manualRemindersPending} אורחים מהוספה ידנית?\n(רק מי שטרם נרשם וטרם נשלחה לו תזכורת)\nהשליחה תתקדם עם המתנה של כמה שניות בין הודעה להודעה — אל תסגרו את הדף.`,
      confirmLabel: "שלח",
    });
    if (!ok) return;
    setActionsOpen(false);
    setError(null);
    setInfo(null);
    setBulkSending(true);
    try {
      const res = await fetch("/api/admin/send-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualPendingOnly: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "שגיאה בשליחה מרובה");
        return;
      }
      setInfo(
        `נשלחו ${data.sent} תזכורות להוספה ידנית · נכשלו ${data.failed}`
      );
      await load();
    } catch {
      setError("בעיית רשת בשליחה מרובה");
    } finally {
      setBulkSending(false);
    }
  }

  async function resetReminder(id: string) {
    const ok = await askConfirm({
      title: "איפוס תזכורת",
      message: "לאפס את סטטוס התזכורת לאורח זה? (כאילו לא נשלחה)",
      confirmLabel: "אפס",
      danger: true,
    });
    if (!ok) return;
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
    const ok = await askConfirm({
      title: "איפוס כל התזכורות",
      message: `לאפס את כל ${sent} התזכורות שנשלחו?\nאפשר יהיה לשלוח שוב מההתחלה.`,
      confirmLabel: "אפס הכל",
      danger: true,
    });
    if (!ok) return;
    setActionsOpen(false);
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
      setContent(
        migrateStoredSiteContent({
          ...DEFAULT_SITE_CONTENT,
          ...data.content,
        })
      );
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

  function restoreReminderDefaults() {
    setDirty(true);
    setInfo("שוחזרו תבניות התזכורת לברירת מחדל — לחצו שמירה");
    setContent((c) => ({
      ...c,
      reminderTemplate: DEFAULT_SITE_CONTENT.reminderTemplate,
      reminderTemplateManual: DEFAULT_SITE_CONTENT.reminderTemplateManual,
      reminderIntro: DEFAULT_SITE_CONTENT.reminderIntro,
      reminderSiteLabel: DEFAULT_SITE_CONTENT.reminderSiteLabel,
      reminderLinkLabel: DEFAULT_SITE_CONTENT.reminderLinkLabel,
      reminderOutro: DEFAULT_SITE_CONTENT.reminderOutro,
      rsvpLeadInvite: "",
    }));
  }

  function fieldValue(key: keyof SiteContent) {
    if (key === "programItems") return formatProgramLines(content.programItems);
    return String(content[key] ?? "");
  }

  function openReminderEditor() {
    setActionsOpen(false);
    setTab("content");
    setContentSection("whatsapp");
    setError(null);
    setInfo(null);
  }

  function guestStatusShort(status: Rsvp["status"]) {
    if (status === "confirmed") return "אושר";
    if (status === "declined") return "לא מגיע/ה";
    if (status === "maybe") return "עדיין לא יודע/ת";
    return "עוד לא אושר";
  }

  function renderGuestCards(list: Rsvp[], emptyLabel: string) {
    if (list.length === 0) {
      return <p className="admin-empty admin-guest-empty">{emptyLabel}</p>;
    }
    return (
      <ul className="admin-guest-cards">
        {list.map((r) => {
          const draft = draftFor(r);
          const declined = draft.status === "declined";
          const displayCount =
            draft.status === "declined" ? 0 : draft.guest_count;
          return (
            <li key={r.id} className="admin-guest-card">
              <button
                type="button"
                className="admin-guest-card-main"
                onClick={() => {
                  setGuestSheetId(r.id);
                  startEditGuest(r);
                }}
              >
                <div className="admin-guest-card-top">
                  <span className="admin-guest-card-name">{r.full_name}</span>
                  <span className={`pill status-${draft.status}`}>
                    {guestStatusShort(draft.status)}
                  </span>
                </div>
                <div className="admin-guest-card-meta">
                  <span dir="ltr">{formatPhoneDisplay(r.phone)}</span>
                  <span className="admin-guest-card-dot" aria-hidden="true">
                    ·
                  </span>
                  <span>
                    {declined ? "0 אורחים" : `${displayCount || 1} אורחים`}
                  </span>
                  <span className="admin-guest-card-dot" aria-hidden="true">
                    ·
                  </span>
                  {r.reminder_sent_at ? (
                    <span className="pill status-confirmed">תזכורת נשלחה</span>
                  ) : declined ? (
                    <span className="admin-muted-inline">בלי תזכורת</span>
                  ) : (
                    <span className="pill status-imported">ממתין לתזכורת</span>
                  )}
                </div>
              </button>
              <div className="admin-guest-card-actions">
                {!declined ? (
                  <button
                    type="button"
                    className="link-btn"
                    disabled={
                      sendingId === r.id || bulkSending || resetting
                    }
                    onClick={() =>
                      void sendReminder(r.id, Boolean(r.reminder_sent_at))
                    }
                  >
                    {sendingId === r.id
                      ? "שולח…"
                      : r.reminder_sent_at
                        ? "שלח שוב"
                        : "שלח"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="link-btn ghost"
                  onClick={() => {
                    setGuestSheetId(r.id);
                    startEditGuest(r);
                  }}
                >
                  עוד
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  function renderGuestTable(list: Rsvp[], emptyLabel: string) {
    if (isMobile) return renderGuestCards(list, emptyLabel);
    return (
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
            {list.length === 0 ? (
              <tr>
                <td colSpan={6} className="admin-empty">
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              list.map((r) => {
                const draft = draftFor(r);
                const editing = editingId === r.id;
                const manualPending = isManualPendingGuest(r);
                const displayStatus =
                  draft.status === "confirmed"
                    ? "אושר"
                    : draft.status === "declined"
                      ? "לא מגיע/ה"
                      : draft.status === "maybe"
                        ? "עדיין לא יודע/ת"
                        : "עוד לא אושר";
                const displayCount =
                  draft.status === "declined" ? 0 : draft.guest_count;
                return (
                  <tr
                    key={r.id}
                    className={editing ? "admin-row-editing" : undefined}
                  >
                    <td data-label="שם">
                      {editing ? (
                        <input
                          className="admin-inline-input"
                          type="text"
                          value={draft.full_name}
                          disabled={savingId === r.id}
                          onChange={(e) =>
                            setDraft(r.id, { full_name: e.target.value })
                          }
                          aria-label={`שם של ${r.full_name}`}
                        />
                      ) : (
                        r.full_name
                      )}
                    </td>
                    <td data-label="טלפון" dir="ltr">
                      {formatPhoneDisplay(r.phone)}
                    </td>
                    <td data-label="אורחים">
                      {manualPending ? (
                        <span>{Math.max(displayCount || 1, 1)}</span>
                      ) : editing ? (
                        <select
                          className="admin-inline-select"
                          value={
                            draft.status === "declined" ? 0 : draft.guest_count
                          }
                          disabled={
                            draft.status === "declined" || savingId === r.id
                          }
                          onChange={(e) =>
                            setDraft(r.id, {
                              guest_count: Number(e.target.value),
                            })
                          }
                          aria-label={`מספר אורחים של ${r.full_name}`}
                        >
                          {draft.status === "declined" ? (
                            <option value={0}>0</option>
                          ) : (
                            [1, 2, 3, 4, 5, 6].map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))
                          )}
                        </select>
                      ) : (
                        displayCount
                      )}
                    </td>
                    <td data-label="סטטוס">
                      {editing ? (
                        <select
                          className="admin-inline-select"
                          value={draft.status}
                          disabled={savingId === r.id}
                          onChange={(e) => {
                            const status = e.target.value as Rsvp["status"];
                            void saveGuestDraft(r, { status });
                          }}
                          aria-label={`סטטוס של ${r.full_name}`}
                        >
                          <option value="imported">
                            עוד לא אושר (מבטל אישור)
                          </option>
                          <option value="confirmed">אושר</option>
                          <option value="maybe">עדיין לא יודע/ת</option>
                          <option value="declined">לא מגיע/ה</option>
                        </select>
                      ) : (
                        displayStatus
                      )}
                    </td>
                    <td data-label="תזכורת">
                      {r.reminder_sent_at ? (
                        <span className="pill status-confirmed">נשלח</span>
                      ) : r.status === "declined" ? (
                        "-"
                      ) : (
                        <span className="pill status-imported">ממתין</span>
                      )}
                    </td>
                    <td data-label="פעולות">
                      <div className="link-actions">
                        <button
                          type="button"
                          className="link-btn"
                          disabled={
                            savingId === r.id ||
                            bulkSending ||
                            resetting ||
                            (editingId !== null && !editing)
                          }
                          onClick={() => {
                            if (editing) void saveGuestDraft(r);
                            else startEditGuest(r);
                          }}
                        >
                          {savingId === r.id
                            ? "שומר…"
                            : editing
                              ? "שמור"
                              : "עריכה"}
                        </button>
                        {editing ? (
                          <button
                            type="button"
                            className="link-btn ghost"
                            disabled={savingId === r.id}
                            onClick={() => cancelEditGuest(r.id)}
                          >
                            ביטול
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="link-btn"
                          disabled={
                            sendingId === r.id ||
                            bulkSending ||
                            resetting ||
                            editing ||
                            draft.status === "declined"
                          }
                          onClick={() =>
                            void sendReminder(r.id, Boolean(r.reminder_sent_at))
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
                            disabled={bulkSending || resetting || editing}
                            onClick={() => void resetReminder(r.id)}
                          >
                            איפוס
                          </button>
                        )}
                        <button
                          type="button"
                          className="link-btn ghost"
                          disabled={editing}
                          onClick={() => copyLink(r)}
                        >
                          {copiedId === r.id ? "הועתק" : "העתק קישור"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    );
  }

  if (loading) return <p className="admin-muted">טוען…</p>;

  if (!authed) {
    return (
      <form className="admin-login" onSubmit={login}>
        <div className="admin-login-ornament" aria-hidden="true" />
        <h1>ניהול</h1>
        <p>מסיבת פרידה - איילת</p>
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

  const guestSheetRsvp = guestSheetId
    ? rsvps.find((r) => r.id === guestSheetId) ?? null
    : null;

  const toolbarActions = (
    <>
      <button
        type="button"
        className="admin-btn"
        onClick={() => void sendAllPending()}
        disabled={bulkSending || resetting || !summary.reminders_pending}
      >
        {bulkSending
          ? "שולח בהמתנה בין הודעות…"
          : `שלח תזכורות ממתינות (${summary.reminders_pending})`}
      </button>
      <button
        type="button"
        className="admin-btn ghost"
        onClick={() => void sendManualPendingReminders()}
        disabled={bulkSending || resetting || manualRemindersPending < 1}
      >
        {bulkSending
          ? "שולח בהמתנה בין הודעות…"
          : `שלח תזכורת להוספה ידנית (${manualRemindersPending})`}
      </button>
      <button
        type="button"
        className="admin-btn ghost"
        onClick={() => void resetAllReminders()}
        disabled={bulkSending || resetting || !summary.reminders_sent}
      >
        {resetting
          ? "מאפס…"
          : `איפוס כל התזכורות (${summary.reminders_sent})`}
      </button>
      <button
        type="button"
        className="admin-btn ghost"
        onClick={openReminderEditor}
      >
        עריכת נוסח התזכורת
      </button>
      <a className="admin-btn ghost" href="/api/admin/rsvps?format=csv">
        ייצוא CSV
      </a>
    </>
  );

  const addGuestForm = (
    <form className="admin-add-guest" onSubmit={(e) => void addGuest(e)}>
      <div className="admin-add-guest-fields">
        <label htmlFor="new_guest_name">
          שם מלא
          <input
            id="new_guest_name"
            type="text"
            value={newGuestName}
            onChange={(e) => setNewGuestName(e.target.value)}
            placeholder="שם פרטי ומשפחה"
            autoComplete="name"
            disabled={addingGuest}
            required
          />
        </label>
        <label htmlFor="new_guest_phone">
          טלפון נייד
          <input
            id="new_guest_phone"
            type="tel"
            dir="ltr"
            value={newGuestPhone}
            onChange={(e) => setNewGuestPhone(e.target.value)}
            placeholder="05X-XXXXXXX"
            autoComplete="tel"
            disabled={addingGuest}
            required
          />
        </label>
      </div>
      <div className="admin-add-guest-actions">
        <button
          type="submit"
          className="admin-btn primary"
          disabled={addingGuest || bulkSending || resetting}
        >
          {addingGuest ? "מוסיף…" : "הוספה לרשימה"}
        </button>
      </div>
    </form>
  );

  return (
    <div className="admin-shell admin-shell-app">
      <header className="admin-header">
        <div>
          <p className="admin-kicker">מסיבת פרידה · איילת</p>
          <h1>ניהול</h1>
          <p className="admin-header-subtitle">תזכורות נשלחות רק בלחיצה ידנית</p>
        </div>
        <div className="admin-actions admin-actions-desktop">
          <a className="admin-btn ghost" href="/" target="_blank" rel="noreferrer">
            לאתר
          </a>
          <button type="button" className="admin-btn ghost" onClick={logout}>
            יציאה
          </button>
        </div>
        <div className="admin-actions-mobile">
          <button
            type="button"
            className="admin-icon-btn"
            aria-label="תפריט"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            ⋯
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
        <button
          type="button"
          className={`admin-tab ${tab === "log" ? "active" : ""}`}
          onClick={() => setTab("log")}
        >
          יומן מערכת
        </button>
      </nav>

      <div className="admin-main">
      {error && (tab === "guests" || tab === "log") && (
        <p className="form-error">{error}</p>
      )}
      {info && tab === "guests" && <p className="form-info">{info}</p>}

      {tab === "guests" && (
        <>
          <div
            className={`admin-stats ${!statsExpanded ? "admin-stats-compact" : ""}`}
          >
            <Stat label="סה״כ" value={summary.total_records} />
            <Stat
              label="אושר"
              value={summary.confirmed}
              active={statusFilter === "confirmed"}
              onClick={() =>
                setStatusFilter((f) =>
                  f === "confirmed" ? "all" : "confirmed"
                )
              }
            />
            <Stat
              label="עוד לא אושר"
              value={summary.imported_pending}
              active={statusFilter === "imported"}
              onClick={() =>
                setStatusFilter((f) =>
                  f === "imported" ? "all" : "imported"
                )
              }
            />
            <Stat
              label="עדיין לא יודע/ת"
              value={summary.maybe}
              active={statusFilter === "maybe"}
              onClick={() =>
                setStatusFilter((f) => (f === "maybe" ? "all" : "maybe"))
              }
            />
            <Stat
              label="טרם נרשמו (ידני)"
              value={summary.manual_pending ?? manualPendingTotal}
            />
            <Stat label="תזכורות נשלחו" value={summary.reminders_sent} />
            <Stat
              label="תזכורות ממתינות"
              value={summary.reminders_pending}
            />
            <Stat
              label="סה״כ אנשים (אושר)"
              value={summary.total_guests_attending}
              active={statusFilter === "confirmed"}
              onClick={() =>
                setStatusFilter((f) =>
                  f === "confirmed" ? "all" : "confirmed"
                )
              }
            />
          </div>
          <button
            type="button"
            className="admin-stats-toggle"
            onClick={() => setStatsExpanded((v) => !v)}
          >
            {statsExpanded ? "פחות סטטיסטיקות" : "עוד סטטיסטיקות"}
          </button>
          {confirmedGuestNames.length > 0 ? (
            <p className="admin-confirmed-list">
              אושר ({confirmedGuestNames.length} נרשמו · סה״כ{" "}
              {confirmedPeopleTotal} אנשים):{" "}
              {confirmedGuestNames.join(" · ")}
              {statusFilter !== "confirmed" ? (
                <>
                  {" "}
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setStatusFilter("confirmed")}
                  >
                    הצג ברשימה
                  </button>
                </>
              ) : (
                <>
                  {" "}
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setStatusFilter("all")}
                  >
                    נקה סינון
                  </button>
                </>
              )}
            </p>
          ) : (
            <p className="admin-confirmed-list muted">אין אורחים שאושרו</p>
          )}
          {pendingGuestNames.length > 0 ? (
            <p className="admin-confirmed-list">
              עוד לא אושר ({pendingGuestNames.length}):{" "}
              {pendingGuestNames.join(" · ")}
              {statusFilter !== "imported" ? (
                <>
                  {" "}
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setStatusFilter("imported")}
                  >
                    הצג ברשימה
                  </button>
                </>
              ) : (
                <>
                  {" "}
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setStatusFilter("all")}
                  >
                    נקה סינון
                  </button>
                </>
              )}
            </p>
          ) : null}

          <div className="admin-mobile-bar">
            <button
              type="button"
              className="admin-btn primary"
              onClick={() => setActionsOpen(true)}
            >
              פעולות
            </button>
            <button
              type="button"
              className="admin-btn ghost"
              onClick={() => setAddGuestOpen(true)}
            >
              הוספת אורח
            </button>
          </div>
          <div className="admin-toolbar">{toolbarActions}</div>

          <div className="admin-search admin-search-sticky">
            <label htmlFor="guest_search">חיפוש לפי שם או טלפון</label>
            <input
              id="guest_search"
              type="search"
              placeholder="למשל: אורטל"
              value={guestSearch}
              onChange={(e) => setGuestSearch(e.target.value)}
              autoComplete="off"
            />
            {(guestSearch.trim() || statusFilter !== "all") && (
              <p className="admin-search-meta">
                מציג {registeredRsvps.length + manualPendingRsvps.length} מתוך{" "}
                {rsvps.length}
                {statusFilter !== "all"
                  ? ` · סינון: ${statusLabel[statusFilter]}`
                  : ""}
                {statusFilter !== "all" ? (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => setStatusFilter("all")}
                    >
                      נקה סינון סטטוס
                    </button>
                  </>
                ) : null}
              </p>
            )}
          </div>

          <div className="admin-guest-accordions content-accordion-list">
            {!isMobile ? (
              <Accordion
                title="הוספת אורח ידנית"
                hint="וואטסאפ או טופס"
                defaultOpen={false}
              >
                <p className="admin-guest-accordion-lead">
                  הוספה דרך וואטסאפ (מארגן בלבד): שלחו למספר של המערכת (Green API)
                  שם בשורה הראשונה ומספר בשנייה — אדם אחד בכל פעם. תקבלו אישור קצר
                  שהאורח נוסף לרשימה הידנית; האורח לא מקבל הודעה.
                </p>
                <pre className="admin-wa-template" dir="rtl">
                  {`כרמל אילני
0500000000`}
                </pre>
                <p className="admin-guest-accordion-lead">
                  לתפריט מידע (סיכום / חיפוש / רשימות) שלחו למספר המערכת:{" "}
                  <strong>עזרה</strong> — כפתורים לחיצים (או מספרים), בלי שליחת
                  הודעות לאורחים.
                </p>
                <p className="admin-guest-accordion-lead">
                  אפשר גם כאן בטופס — שם ומספר בלבד, למי שטרם נרשם. לא ניתן להוסיף
                  מי שכבר אישר/ה הגעה.
                </p>
                {addGuestForm}
              </Accordion>
            ) : null}

            <Accordion
              key={manualPendingTotal > 0 ? "manual-has" : "manual-empty"}
              title={`טרם נרשמו · הוספה ידנית (${manualPendingTotal})`}
              hint="עד שיאשרו"
              defaultOpen={manualPendingTotal > 0}
              openSignal={
                (guestSearch.trim() || statusFilter !== "all") &&
                manualPendingRsvps.length > 0
                  ? `${guestSearch.trim()}|${statusFilter}|manual`
                  : null
              }
            >
              {!isMobile ? (
                <p className="admin-guest-accordion-lead">
                  מופיעים כאן בנפרד עד שיאשרו או יעדכנו סטטוס — ואז עוברים לרשימה
                  הכללית.
                </p>
              ) : null}
              {renderGuestTable(
                manualPendingRsvps,
                guestSearch.trim() || statusFilter !== "all"
                  ? "לא נמצאו אורחים ידניים לסינון הזה"
                  : "אין אורחים ידניים שממתינים לרישום"
              )}
            </Accordion>

            <Accordion
              title={`רשימת אורחים (${registeredTotal})`}
              hint="אושר / עוד לא אושר / לא יודעים / סירבו"
              defaultOpen
              openSignal={
                (guestSearch.trim() || statusFilter !== "all") &&
                registeredRsvps.length > 0
                  ? `${guestSearch.trim()}|${statusFilter}|registered`
                  : null
              }
            >
              {!isMobile ? (
                <p className="admin-guest-accordion-lead">
                  מי שאישרו, סירבו, או יובאו מהרשימה — כולל אורחים ידניים אחרי
                  עדכון.
                </p>
              ) : null}
              {renderGuestTable(
                registeredRsvps,
                guestSearch.trim() || statusFilter !== "all"
                  ? "לא נמצאו אורחים לסינון הזה"
                  : "אין אורחים עדיין"
              )}
            </Accordion>
          </div>
        </>
      )}

      {tab === "log" && (
        <section className="admin-log">
          <div className="admin-log-toolbar">
            <div className="admin-log-filters" role="group" aria-label="סינון יומן">
              {(
                [
                  ["all", "הכל"],
                  ["whatsapp", "וואטסאפ"],
                  ["rsvp", "אישורי הגעה"],
                  ["admin", "ניהול"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`admin-btn ghost ${logFilter === id ? "active" : ""}`}
                  onClick={() => setLogFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="admin-btn"
              onClick={() => void loadLog()}
              disabled={logLoading}
            >
              {logLoading ? "טוען…" : "רענון"}
            </button>
          </div>
          {!isMobile ? (
            <p className="admin-log-lead">
              כל שינוי באורחים, שליחות וואטסאפ, תזכורות ועדכוני תוכן — מהחדש לישן.
            </p>
          ) : null}
          {isMobile ? (
            <div className="admin-log-timeline">
              {logLoading && logEvents.length === 0 ? (
                <p className="admin-empty">טוען יומן…</p>
              ) : filteredLogEvents.length === 0 ? (
                <p className="admin-empty">אין עדיין רשומות ביומן</p>
              ) : (
                filteredLogEvents.map((event) => {
                  const when = new Date(event.created_at);
                  const timeLabel = Number.isNaN(when.getTime())
                    ? event.created_at
                    : when.toLocaleString("he-IL", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                  const preview =
                    typeof event.detail?.preview === "string"
                      ? event.detail.preview
                      : null;
                  const purpose =
                    typeof event.detail?.purpose === "string"
                      ? event.detail.purpose
                      : null;
                  const expanded = expandedLogId === event.id;
                  return (
                    <button
                      key={event.id}
                      type="button"
                      className={`admin-log-card ${event.ok ? "" : "fail"} ${expanded ? "expanded" : ""}`}
                      onClick={() =>
                        setExpandedLogId((id) =>
                          id === event.id ? null : event.id
                        )
                      }
                    >
                      <div className="admin-log-card-top">
                        <span className={`pill log-source-${event.source}`}>
                          {sourceLabelHe(event.source)}
                        </span>
                        <time dir="ltr">{timeLabel}</time>
                      </div>
                      <p className="admin-log-card-action">
                        {actionLabelHe(event.action, purpose)}
                        {!event.ok ? " · נכשל" : ""}
                      </p>
                      <p className="admin-log-card-summary">{event.summary}</p>
                      {expanded ? (
                        <div className="admin-log-card-detail">
                          {preview ? (
                            <div className="admin-log-preview">{preview}</div>
                          ) : null}
                          <div>
                            {event.guest_name || "—"}
                            {event.phone ? (
                              <span dir="ltr" className="admin-log-phone">
                                {" "}
                                {formatPhoneDisplay(event.phone)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          ) : (
          <div className="admin-table-wrap">
            <table className="admin-table admin-log-table">
              <thead>
                <tr>
                  <th>זמן</th>
                  <th>מקור</th>
                  <th>פעולה</th>
                  <th>תיאור</th>
                  <th>אורח / טלפון</th>
                </tr>
              </thead>
              <tbody>
                {logLoading && logEvents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="admin-empty">
                      טוען יומן…
                    </td>
                  </tr>
                ) : filteredLogEvents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="admin-empty">
                      אין עדיין רשומות ביומן
                    </td>
                  </tr>
                ) : (
                  filteredLogEvents.map((event) => {
                    const when = new Date(event.created_at);
                    const timeLabel = Number.isNaN(when.getTime())
                      ? event.created_at
                      : when.toLocaleString("he-IL", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        });
                    const preview =
                      typeof event.detail?.preview === "string"
                        ? event.detail.preview
                        : null;
                    const purpose =
                      typeof event.detail?.purpose === "string"
                        ? event.detail.purpose
                        : null;
                    return (
                      <tr
                        key={event.id}
                        className={event.ok ? undefined : "admin-log-row-fail"}
                      >
                        <td data-label="זמן" dir="ltr">
                          {timeLabel}
                        </td>
                        <td data-label="מקור">
                          <span className={`pill log-source-${event.source}`}>
                            {sourceLabelHe(event.source)}
                          </span>
                        </td>
                        <td data-label="פעולה">
                          {actionLabelHe(event.action, purpose)}
                          {!event.ok ? " · נכשל" : ""}
                        </td>
                        <td data-label="תיאור">
                          <div>{event.summary}</div>
                          {preview ? (
                            <div className="admin-log-preview">{preview}</div>
                          ) : null}
                        </td>
                        <td data-label="אורח / טלפון">
                          {event.guest_name || "—"}
                          {event.phone ? (
                            <div dir="ltr" className="admin-log-phone">
                              {formatPhoneDisplay(event.phone)}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          )}
        </section>
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
              description="כותרת, תאריך, מקום וכפתורים בראש העמוד"
            >
              <Fields
                columns={2}
                fieldValue={fieldValue}
                onChange={updateField}
                fields={[
                  { key: "title", label: "כותרת ראשית" },
                  { key: "dateTime", label: "תאריך ושעה" },
                  { key: "place", label: "מיקום", span2: true },
                  { key: "ctaLabel", label: "כפתור אישור הגעה" },
                  { key: "detailsLinkLabel", label: "קישור פרטי האירוע" },
                  { key: "viewInviteLabel", label: "קישור צפייה בהזמנה" },
                  {
                    key: "countdownDone",
                    label: "טקסט אחרי שהערב התחיל",
                    span2: true,
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
              description="לוח הזמנים והערות באזור הפרטים"
            >
              <Fields
                fieldValue={fieldValue}
                onChange={updateField}
                fields={[{ key: "programTitle", label: "כותרת" }]}
              />
              <ProgramScheduleEditor
                items={content.programItems}
                onChange={(programItems) => {
                  setDirty(true);
                  setInfo(null);
                  setContent((c) => ({ ...c, programItems }));
                }}
              />
              <Fields
                fieldValue={fieldValue}
                onChange={updateField}
                fields={[
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
              description="טקסט וכתובת לכל קישור · אייקונים (Waze / Maps / ביט) מוצגים אוטומטית · קישור ריק מסתיר את הפריט"
            >
              <Fields
                fieldValue={fieldValue}
                onChange={updateField}
                fields={[{ key: "linksTitle", label: "כותרת האזור" }]}
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
              description="טקסטים בטופס, התחברות ואפשרויות סטטוס (כן / עדיין לא יודע/ת / לא). אזכור «קישור אישי» עובר בהודעת WhatsApp, לא בדף"
            >
              <Accordion title="טקסטים וטופס">
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
                      key: "alreadyConfirmedNote",
                      label: "הערה למי שכבר אישר (סיכום פרטים)",
                      multiline: true,
                      rows: 2,
                    },
                    { key: "updateStatusLabel", label: "כפתור עדכון סטטוס" },
                    { key: "viewProgramLabel", label: "כפתור צפייה בתוכנית" },
                    { key: "cancelUpdateLabel", label: "כפתור ביטול" },
                    { key: "guestGreeting", label: "ברכת שלום", hint: "עם {name}" },
                    { key: "statusLegend", label: "שאלת הגעה" },
                    { key: "statusYesLabel", label: "אפשרות: כן" },
                    { key: "statusMaybeLabel", label: "אפשרות: עדיין לא יודע/ת" },
                    { key: "statusNoLabel", label: "אפשרות: לא" },
                    { key: "guestCountLabel", label: "תווית מספר אורחים" },
                    { key: "submitRsvpLabel", label: "כפתור שליחה" },
                    { key: "phoneLabel", label: "תווית טלפון" },
                    { key: "sendOtpLabel", label: "כפתור שליחת קוד" },
                    { key: "otpSentLead", label: "טקסט אחרי שליחת קוד" },
                    { key: "codeLabel", label: "תווית קוד אימות" },
                    { key: "verifyOtpLabel", label: "כפתור אימות" },
                    { key: "changePhoneLabel", label: "שינוי מספר" },
                    {
                      key: "newGuestWelcome",
                      label: "ברוכים הבאים לאורח חדש",
                      multiline: true,
                      rows: 2,
                    },
                    { key: "fullNameLabel", label: "תווית שם מלא" },
                    { key: "logoutLabel", label: "התנתקות" },
                    {
                      key: "thankYouTitle",
                      label: "כותרת תודה",
                      hint: "עם {name}",
                    },
                    { key: "invalidLinkTitle", label: "כותרת קישור לא תקין" },
                    {
                      key: "invalidLinkBody",
                      label: "הסבר קישור לא תקין",
                      multiline: true,
                      rows: 2,
                    },
                  ]}
                />
              </Accordion>
            </Panel>
          )}

          {contentSection === "thanks" && (
            <Panel
              title="הודעות תודה באתר"
              description="רק מסך ההצלחה באתר. הודעות WhatsApp (כולל קישור אישי) — בלשונית WhatsApp."
            >
              <Fields
                fieldValue={fieldValue}
                onChange={updateField}
                fields={[
                  {
                    key: "thankYouConfirmed",
                    label: "אישור הגעה (אתר)",
                    multiline: true,
                    rows: 3,
                  },
                  {
                    key: "thankYouUpdated",
                    label: "עדכון (אתר)",
                    multiline: true,
                    rows: 3,
                  },
                  {
                    key: "thankYouDeclined",
                    label: "לא מגיע/ה (אתר)",
                    multiline: true,
                    rows: 3,
                  },
                  {
                    key: "thankYouMaybe",
                    label: "עדיין לא יודע/ת (אתר)",
                    multiline: true,
                    rows: 3,
                  },
                ]}
              />
            </Panel>
          )}

          {contentSection === "whatsapp" && (
            <Panel
              title="הודעות WhatsApp"
              description="תזכורת, הזמנה, כפתורי RSVP והודעות תודה בוואטסאפ. רעננו את הדף אחרי עדכון — ואז שמרו אם ערכתם."
            >
              <div className="content-preview">
                <p className="content-preview-label">
                  תצוגה מקדימה — תזכורת (יובאו / טרם עדכנו סטטוס)
                </p>
                <pre className="content-preview-body">
                  {content.reminderTemplate
                    .replaceAll("{name}", "[שם]")
                    .replaceAll("{dateTime}", content.dateTime)
                    .replaceAll("{place}", content.place)
                    .replaceAll(
                      "{siteUrl}",
                      "https://ayelet-farewell.vercel.app"
                    )
                    .replaceAll(
                      "{personalLink}",
                      "https://ayelet-farewell.vercel.app/i/xxxxxxxx"
                    )}
                </pre>
              </div>
              <div className="content-preview">
                <p className="content-preview-label">
                  תצוגה מקדימה — הזמנה (נוספו ידנית)
                </p>
                <pre className="content-preview-body">
                  {(content.reminderTemplateManual ||
                    DEFAULT_SITE_CONTENT.reminderTemplateManual)
                    .replaceAll("{name}", "[שם]")
                    .replaceAll("{dateTime}", content.dateTime)
                    .replaceAll("{place}", content.place)
                    .replaceAll(
                      "{siteUrl}",
                      "https://ayelet-farewell.vercel.app"
                    )
                    .replaceAll(
                      "{personalLink}",
                      "https://ayelet-farewell.vercel.app/i/xxxxxxxx"
                    )}
                </pre>
              </div>
              <div className="content-restore-row">
                <button
                  type="button"
                  className="admin-btn ghost"
                  onClick={restoreReminderDefaults}
                >
                  שחזור שתי תבניות התזכורת לברירת מחדל
                </button>
              </div>
              <Accordion title="עריכת הודעות" defaultOpen>
                <Fields
                  fieldValue={fieldValue}
                  onChange={updateField}
                  fields={[
                    {
                      key: "reminderTemplate",
                      label: "תזכורת — יובאו / טרם עדכנו סטטוס",
                      multiline: true,
                      rows: 12,
                      hint: "{name} {dateTime} {place} · {siteUrl}",
                    },
                    {
                      key: "reminderTemplateManual",
                      label: "הזמנה — נוספו ידנית (ממתינים)",
                      multiline: true,
                      rows: 12,
                      hint: "{name} {dateTime} {place} · {siteUrl}",
                    },
                    {
                      key: "waRsvpStatusPrompt",
                      label: "גוף מעל כפתורי RSVP (אחרי הזמנה/תזכורת)",
                      multiline: true,
                      rows: 2,
                      hint: 'למשל: אשמח לעדכון:',
                    },
                    {
                      key: "waRsvpCountPrompt",
                      label: "שאלה על מספר אורחים",
                      multiline: true,
                      rows: 3,
                      hint: "אחרי בחירת מגיע/ה או עדיין לא יודע/ת",
                    },
                    {
                      key: "otpMessageTemplate",
                      label: "קוד אימות",
                      multiline: true,
                      rows: 5,
                      hint: "חובה לכלול {code}",
                    },
                    {
                      key: "waThankYouConfirmed",
                      label: "תודה WhatsApp - אישור הגעה",
                      multiline: true,
                      rows: 8,
                      hint: "{name} · {personalLink}",
                    },
                    {
                      key: "waThankYouUpdated",
                      label: "תודה WhatsApp - עדכון",
                      multiline: true,
                      rows: 7,
                      hint: "{name} · {personalLink}",
                    },
                    {
                      key: "waThankYouDeclined",
                      label: "תודה WhatsApp - לא מגיע/ה",
                      multiline: true,
                      rows: 5,
                      hint: "{name} · בלי קישור אישי",
                    },
                    {
                      key: "waThankYouMaybe",
                      label: "תודה WhatsApp - עדיין לא יודע/ת",
                      multiline: true,
                      rows: 7,
                      hint: "{name} · {personalLink}",
                    },
                    {
                      key: "organizerNotifyTemplate",
                      label: "התראה למארגנות",
                      multiline: true,
                      rows: 7,
                      hint: "{name} {phone} {status} {guestCount} {notes}",
                    },
                  ]}
                />
              </Accordion>
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

      <AdminBottomNav
        tab={tab}
        onChange={(next) => {
          setTab(next);
          setError(null);
          setInfo(null);
        }}
      />

      <AdminSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="תפריט"
      >
        <div className="admin-sheet-stack">
          <a
            className="admin-btn ghost"
            href="/"
            target="_blank"
            rel="noreferrer"
            onClick={() => setMenuOpen(false)}
          >
            לאתר
          </a>
          <button
            type="button"
            className="admin-btn ghost"
            onClick={() => {
              setMenuOpen(false);
              void logout();
            }}
          >
            יציאה
          </button>
        </div>
      </AdminSheet>

      <AdminSheet
        open={actionsOpen}
        onClose={() => setActionsOpen(false)}
        title="פעולות אורחים"
      >
        <div className="admin-sheet-stack admin-toolbar-sheet">
          {toolbarActions}
        </div>
      </AdminSheet>

      <AdminSheet
        open={addGuestOpen}
        onClose={() => setAddGuestOpen(false)}
        title="הוספת אורח"
        size="tall"
      >
        <p className="admin-guest-accordion-lead">
          שם ומספר בלבד, למי שטרם נרשם. לא ניתן להוסיף מי שכבר אישר/ה הגעה.
        </p>
        {addGuestForm}
      </AdminSheet>

      <AdminSheet
        open={Boolean(guestSheetRsvp)}
        onClose={() => {
          if (guestSheetRsvp) cancelEditGuest(guestSheetRsvp.id);
          setGuestSheetId(null);
        }}
        title={guestSheetRsvp?.full_name ?? "אורח"}
        size="tall"
        footer={
          guestSheetRsvp ? (
            <div className="admin-confirm-actions">
              <button
                type="button"
                className="admin-btn ghost"
                disabled={savingId === guestSheetRsvp.id}
                onClick={() => {
                  cancelEditGuest(guestSheetRsvp.id);
                  setGuestSheetId(null);
                }}
              >
                סגור
              </button>
              <button
                type="button"
                className="admin-btn primary"
                disabled={savingId === guestSheetRsvp.id}
                onClick={() => void saveGuestDraft(guestSheetRsvp)}
              >
                {savingId === guestSheetRsvp.id ? "שומר…" : "שמור"}
              </button>
            </div>
          ) : null
        }
      >
        {guestSheetRsvp ? (
          <GuestSheetEditor
            r={guestSheetRsvp}
            draft={draftFor(guestSheetRsvp)}
            saving={savingId === guestSheetRsvp.id}
            sending={sendingId === guestSheetRsvp.id}
            copied={copiedId === guestSheetRsvp.id}
            busy={bulkSending || resetting}
            onDraft={(patch) => setDraft(guestSheetRsvp.id, patch)}
            onStatus={(status) =>
              void saveGuestDraft(guestSheetRsvp, { status })
            }
            onSend={() =>
              void sendReminder(
                guestSheetRsvp.id,
                Boolean(guestSheetRsvp.reminder_sent_at)
              )
            }
            onReset={() => void resetReminder(guestSheetRsvp.id)}
            onCopy={() => void copyLink(guestSheetRsvp)}
          />
        ) : null}
      </AdminSheet>

      <ConfirmSheet
        open={Boolean(confirmReq)}
        title={confirmReq?.title ?? ""}
        message={confirmReq?.message ?? ""}
        confirmLabel={confirmReq?.confirmLabel}
        danger={confirmReq?.danger}
        onCancel={() => {
          confirmReq?.resolve(false);
          setConfirmReq(null);
        }}
        onConfirm={() => {
          confirmReq?.resolve(true);
          setConfirmReq(null);
        }}
      />
    </div>
  );
}

function GuestSheetEditor({
  r,
  draft,
  saving,
  sending,
  copied,
  busy,
  onDraft,
  onStatus,
  onSend,
  onReset,
  onCopy,
}: {
  r: Rsvp;
  draft: { status: Rsvp["status"]; guest_count: number; full_name: string };
  saving: boolean;
  sending: boolean;
  copied: boolean;
  busy: boolean;
  onDraft: (patch: Partial<{ status: Rsvp["status"]; guest_count: number; full_name: string }>) => void;
  onStatus: (status: Rsvp["status"]) => void;
  onSend: () => void;
  onReset: () => void;
  onCopy: () => void;
}) {
  const manualPending = isManualPendingGuest(r);
  return (
    <div className="admin-guest-sheet">
      <label className="admin-guest-sheet-field">
        שם מלא
        <input
          className="admin-inline-input"
          type="text"
          value={draft.full_name}
          disabled={saving}
          onChange={(e) => onDraft({ full_name: e.target.value })}
        />
      </label>
      <p className="admin-guest-sheet-phone" dir="ltr">
        {formatPhoneDisplay(r.phone)}
      </p>
      <label className="admin-guest-sheet-field">
        סטטוס
        <select
          className="admin-inline-select"
          value={draft.status}
          disabled={saving}
          onChange={(e) => onStatus(e.target.value as Rsvp["status"])}
        >
          <option value="imported">עוד לא אושר (מבטל אישור)</option>
          <option value="confirmed">אושר</option>
          <option value="maybe">עדיין לא יודע/ת</option>
          <option value="declined">לא מגיע/ה</option>
        </select>
      </label>
      {!manualPending ? (
        <label className="admin-guest-sheet-field">
          מספר אורחים
          <select
            className="admin-inline-select"
            value={draft.status === "declined" ? 0 : draft.guest_count}
            disabled={draft.status === "declined" || saving}
            onChange={(e) => onDraft({ guest_count: Number(e.target.value) })}
          >
            {draft.status === "declined" ? (
              <option value={0}>0</option>
            ) : (
              [1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))
            )}
          </select>
        </label>
      ) : null}
      <div className="admin-sheet-stack">
        <button
          type="button"
          className="admin-btn"
          disabled={
            sending || busy || saving || draft.status === "declined"
          }
          onClick={onSend}
        >
          {sending
            ? "שולח…"
            : r.reminder_sent_at
              ? "שלח תזכורת שוב"
              : "שלח תזכורת"}
        </button>
        {r.reminder_sent_at ? (
          <button
            type="button"
            className="admin-btn ghost"
            disabled={busy || saving}
            onClick={onReset}
          >
            איפוס תזכורת
          </button>
        ) : null}
        <button
          type="button"
          className="admin-btn ghost"
          disabled={saving}
          onClick={onCopy}
        >
          {copied ? "הועתק" : "העתק קישור הזמנה"}
        </button>
      </div>
    </div>
  );
}

function sourceLabelHe(source: string): string {
  switch (source) {
    case "whatsapp":
      return "וואטסאפ";
    case "admin":
      return "ניהול";
    case "guest":
      return "אורח";
    case "import":
      return "ייבוא";
    default:
      return "מערכת";
  }
}

function actionLabelHe(action: string, purpose?: string | null): string {
  const map: Record<string, string> = {
    wa_sent: "הודעת וואטסאפ",
    wa_send_failed: "שליחת וואטסאפ נכשלה",
    rsvp_update: "עדכון אישור הגעה",
    rsvp_create: "אישור הגעה חדש",
    admin_rsvp_update: "עדכון סטטוס (ניהול)",
    guest_created: "הוספת אורח",
    guest_rename: "שינוי שם",
    reminder_marked: "תזכורת סומנה",
    reminder_reset: "איפוס תזכורת",
    content_save: "שמירת תוכן",
  };
  const base = map[action] || action;
  if (purpose) return `${base} · ${purpose}`;
  return base;
}

function Stat({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active?: boolean;
  onClick?: () => void;
}) {
  if (onClick) {
    return (
      <button
        type="button"
        className={`stat ${active ? "stat-active" : ""}`}
        onClick={onClick}
        aria-pressed={active}
      >
        <span className="stat-value">{value}</span>
        <span className="stat-label">{label}</span>
      </button>
    );
  }
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
