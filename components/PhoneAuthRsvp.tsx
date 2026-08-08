"use client";

import { useEffect, useState } from "react";
import { CONFIRM_PROMPT } from "@/lib/copy";
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
};

type Step = "phone" | "code" | "confirm";

export function PhoneAuthRsvp() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [guest, setGuest] = useState<Guest | null>(null);
  const [status, setStatus] = useState<Status>("confirmed");
  const [guestCount, setGuestCount] = useState(1);
  const [notes, setNotes] = useState("");
  const [video, setVideo] = useState("");
  const [speak, setSpeak] = useState("");
  const [excitement, setExcitement] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [doneStatus, setDoneStatus] = useState<Status | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.guest) {
          setGuest(data.guest);
          setGuestCount(Math.max(data.guest.guest_count || 1, 1));
          setNotes(data.guest.notes || "");
          setVideo(data.guest.wants_video_blessing || "");
          setSpeak(data.guest.wants_to_speak || "");
          setExcitement(
            data.guest.excitement ? String(data.guest.excitement) : ""
          );
          setStatus(
            data.guest.status === "imported"
              ? "confirmed"
              : (data.guest.status as Status)
          );
          setStep("confirm");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "שגיאה בשליחת הקוד");
        return;
      }
      setStep("code");
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
      setGuest(data.guest);
      setGuestCount(Math.max(data.guest.guest_count || 1, 1));
      setNotes(data.guest.notes || "");
      setVideo(data.guest.wants_video_blessing || "");
      setSpeak(data.guest.wants_to_speak || "");
      setExcitement(
        data.guest.excitement ? String(data.guest.excitement) : ""
      );
      setStatus(
        data.guest.status === "imported"
          ? "confirmed"
          : (data.guest.status as Status)
      );
      setStep("confirm");
    } catch {
      setError("בעיית רשת");
    } finally {
      setBusy(false);
    }
  }

  async function submitRsvp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guest_count: guestCount,
          status,
          notes: notes.trim() || null,
          wants_video_blessing: video.trim() || null,
          wants_to_speak: speak.trim() || null,
          excitement: excitement ? Number(excitement) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "שגיאה בשמירה");
        return;
      }
      setDoneStatus(status);
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
    setStep("phone");
    setCode("");
    setDone(false);
  }

  if (loading) {
    return <p className="rsvp-lead">טוען…</p>;
  }

  if (done && guest) {
    const message =
      doneStatus === "declined"
        ? "עדכנו שלא תוכלו להגיע. תודה שעדכנתם."
        : doneStatus === "maybe"
          ? "קיבלנו את העדכון. אפשר להתחבר שוב ולשנות בכל רגע."
          : "האישור הסופי התקבל. נתראה ב־7 בספטמבר בתחנת רוח, טבעון.";
    return (
      <div className="success-panel animate-fade-up" role="status">
        <p className="success-title">תודה, {guest.full_name}!</p>
        <p className="success-body">{message}</p>
      </div>
    );
  }

  if (step === "phone") {
    return (
      <form className="rsvp-form animate-fade-up" onSubmit={sendOtp}>
        <p className="confirm-prompt">{CONFIRM_PROMPT}</p>
        <div className="field">
          <label htmlFor="phone">מספר טלפון</label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            dir="ltr"
            required
            placeholder="05X-XXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
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
      </form>
    );
  }

  if (step === "code") {
    return (
      <form className="rsvp-form animate-fade-up" onSubmit={verifyOtp}>
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
        <button
          type="button"
          className="link-btn ghost"
          onClick={() => {
            setStep("phone");
            setError(null);
          }}
        >
          שינוי מספר
        </button>
      </form>
    );
  }

  if (!guest) return null;

  return (
    <form className="rsvp-form animate-fade-up" onSubmit={submitRsvp}>
      <p className="invitee-name">
        שלום <strong>{guest.full_name}</strong>
      </p>
      <p className="confirm-prompt">{CONFIRM_PROMPT}</p>
      {guest.already_final && (
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

      <div className="field">
        <label htmlFor="video">הקלטה מצולמת לברכה?</label>
        <select
          id="video"
          value={video}
          onChange={(e) => setVideo(e.target.value)}
        >
          <option value="">לא צוין</option>
          <option value="כן, אשמח">כן, אשמח</option>
          <option value="לא, תודה">לא, תודה</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="speak">לברך / לשאת דברים באירוע?</label>
        <select
          id="speak"
          value={speak}
          onChange={(e) => setSpeak(e.target.value)}
        >
          <option value="">לא צוין</option>
          <option value="כן">כן</option>
          <option value="לא">לא</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="excitement">כמה את/ה נרגש/ת? (1–5)</label>
        <select
          id="excitement"
          value={excitement}
          onChange={(e) => setExcitement(e.target.value)}
        >
          <option value="">לא צוין</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="notes">הערות / בקשות מיוחדות</label>
        <textarea
          id="notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

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
