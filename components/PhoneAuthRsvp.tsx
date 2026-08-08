"use client";

import { useEffect, useState } from "react";
import { CONFIRM_PROMPT } from "@/lib/copy";
import { phoneValidationError } from "@/lib/phone";
import {
  resolveThankYouKind,
  thankYouMessage,
  type ThankYouKind,
  type ThankYouMessages,
} from "@/lib/thank-you";
import type { RsvpStatus } from "@/lib/types";

type Status = Exclude<RsvpStatus, "imported">;

type Guest = {
  full_name: string;
  phone: string;
  guest_count: number;
  status: RsvpStatus;
  notes: string | null;
  wants_video_blessing?: string | null;
  wants_to_speak?: string | null;
  excitement?: number | null;
  already_final: boolean;
  is_new?: boolean;
};

type Step = "phone" | "code" | "confirm";

type Props = {
  lead?: string;
  help?: string;
  confirmPrompt?: string;
  thankYou?: ThankYouMessages;
};

const DEFAULT_THANK_YOU: ThankYouMessages = {
  thankYouConfirmed: "תודה שאישרת את הגעתך. נתראה ב־7 בספטמבר בתחנת רוח, טבעון.",
  thankYouUpdated: "תודה שעדכנת אותנו — נדע להיערך יותר טוב.",
  thankYouDeclined: "תודה על העדכון. נתראה באירוע אחר בקרוב.",
  thankYouMaybe: "קיבלנו את העדכון. אפשר לחזור ולעדכן בכל רגע.",
};

export function PhoneAuthRsvp({
  lead,
  help,
  confirmPrompt,
  thankYou = DEFAULT_THANK_YOU,
}: Props) {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [guest, setGuest] = useState<Guest | null>(null);
  const [fullName, setFullName] = useState("");
  const [status, setStatus] = useState<Status>("confirmed");
  const [guestCount, setGuestCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [doneKind, setDoneKind] = useState<ThankYouKind | null>(null);
  const [doneName, setDoneName] = useState("");
  const [lastOtpPhone, setLastOtpPhone] = useState<string | null>(null);
  const [otpCooldownUntil, setOtpCooldownUntil] = useState(0);

  function applyGuest(next: Guest) {
    setGuest(next);
    setFullName(next.full_name || "");
    setGuestCount(Math.max(next.guest_count || 1, 1));
    setStatus(
      next.status === "imported" ? "confirmed" : (next.status as Status)
    );
    setStep("confirm");
  }

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.guest) applyGuest(data.guest);
      })
      .finally(() => setLoading(false));
  }, []);

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = phone.trim();
    const invalid = phoneValidationError(trimmed);
    if (invalid) {
      setError(invalid);
      return;
    }

    if (
      lastOtpPhone &&
      trimmed === lastOtpPhone &&
      Date.now() < otpCooldownUntil
    ) {
      setStep("code");
      setError("הקוד כבר נשלח למספר הזה. בדקו ב־WhatsApp.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "שגיאה בשליחת הקוד");
        return;
      }
      setLastOtpPhone(trimmed);
      setOtpCooldownUntil(Date.now() + 90_000);
      setStep("code");
      if (data.reused) {
        setError(data.message || "הקוד כבר נשלח. בדקו ב־WhatsApp.");
      }
    } catch {
      setError("בעיית רשת");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "אימות נכשל");
        return;
      }
      applyGuest(data.guest);
    } catch {
      setError("בעיית רשת");
    } finally {
      setBusy(false);
    }
  }

  async function submitRsvp(e: React.FormEvent) {
    e.preventDefault();
    if (!guest) return;
    setError(null);

    const isNew = Boolean(guest.is_new);
    const name = fullName.trim();
    if (isNew && name.length < 2) {
      setError("נא להזין שם מלא");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: isNew ? name : undefined,
          guest_count: guestCount,
          status,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "שגיאה בשמירה");
        return;
      }
      setDoneName(isNew ? name : guest.full_name);
      setDoneKind(
        resolveThankYouKind({
          previousStatus: guest.status,
          previousGuestCount: guest.guest_count,
          nextStatus: status,
          nextGuestCount: guestCount,
        })
      );
      setDone(true);
    } catch {
      setError("בעיית רשת");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/me", { method: "DELETE" });
    setGuest(null);
    setFullName("");
    setStep("phone");
    setCode("");
    setDone(false);
    setDoneKind(null);
    setDoneName("");
  }

  if (loading) {
    return <p className="rsvp-lead">טוען…</p>;
  }

  if (done && doneKind) {
    return (
      <div className="success-panel animate-fade-up" role="status">
        <p className="success-title">תודה, {doneName}!</p>
        <p className="success-body">
          {thankYouMessage(doneKind, thankYou)}
        </p>
      </div>
    );
  }

  if (step === "phone") {
    return (
      <form className="rsvp-form animate-fade-up" onSubmit={sendOtp}>
        {lead && <p className="rsvp-lead">{lead}</p>}
        <p className="confirm-prompt">{confirmPrompt || CONFIRM_PROMPT}</p>
        <div className="field">
          <label htmlFor="phone">מספר טלפון נייד</label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            dir="ltr"
            required
            placeholder="05X-XXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => {
              if (!phone.trim()) return;
              const msg = phoneValidationError(phone);
              setError(msg);
            }}
          />
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="submit-btn" disabled={busy}>
          {busy ? "שולח…" : "שלחו לי קוד ב־WhatsApp"}
        </button>
        {help && <p className="rsvp-lead">{help}</p>}
      </form>
    );
  }

  if (step === "code") {
    return (
      <div className="rsvp-form animate-fade-up">
        <form onSubmit={verifyOtp}>
          <p className="rsvp-lead">
            נשלח קוד אימות ל־WhatsApp במספר{" "}
            <span dir="ltr">{phone}</span>
          </p>
          <div className="field">
            <label htmlFor="code">קוד אימות</label>
            <input
              id="code"
              inputMode="numeric"
              dir="ltr"
              required
              autoComplete="one-time-code"
              placeholder="6 ספרות"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="submit-btn" disabled={busy}>
            {busy ? "מאמת…" : "אימות והמשך"}
          </button>
        </form>
        <button
          type="button"
          className="link-btn ghost"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setStep("phone");
            setCode("");
            setError(null);
          }}
        >
          שינוי מספר
        </button>
      </div>
    );
  }

  if (!guest) return null;

  const isNew = Boolean(guest.is_new);

  return (
    <form className="rsvp-form animate-fade-up" onSubmit={submitRsvp}>
      {isNew ? (
        <>
          <p className="rsvp-lead">
            ברוכים הבאים! מלאו את הפרטים לאישור הגעה.
          </p>
          <div className="field">
            <label htmlFor="full_name">שם מלא</label>
            <input
              id="full_name"
              required
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="שם פרטי ומשפחה"
            />
          </div>
        </>
      ) : (
        <p className="invitee-name">
          שלום <strong>{guest.full_name}</strong>
        </p>
      )}
      <p className="confirm-prompt">{confirmPrompt || CONFIRM_PROMPT}</p>
      {!isNew && guest.already_final && (
        <p className="rsvp-lead">כבר שלחתם אישור — אפשר לעדכן שוב.</p>
      )}

      <fieldset className="status-fieldset">
        <legend>האם תגיעו?</legend>
        <div className="status-options">
          {(
            [
              ["confirmed", "כן, מגיע/ה"],
              ["maybe", "עדיין לא בטוח/ה"],
              ["declined", "לא אוכל/ה להגיע"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={`status-option ${status === value ? "active" : ""}`}
            >
              <input
                type="radio"
                name="status"
                value={value}
                checked={status === value}
                onChange={() => setStatus(value)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {status !== "declined" && (
        <div className="field">
          <label htmlFor="guest_count">כמה תגיעו?</label>
          <select
            id="guest_count"
            value={guestCount}
            required
            onChange={(e) => setGuestCount(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="submit-btn" disabled={busy}>
        {busy ? "שולח…" : "שליחת אישור סופי"}
      </button>
      <button type="button" className="link-btn ghost" onClick={logout}>
        התנתקות
      </button>
    </form>
  );
}
