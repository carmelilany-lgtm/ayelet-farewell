"use client";

import { useEffect, useState } from "react";
import { OtpCodeInput } from "@/components/OtpCodeInput";
import { RsvpChoiceFields } from "@/components/RsvpChoiceFields";
import { applyTemplate, type SiteContent } from "@/lib/site-content-defaults";
import { formatPhoneDisplay, phoneValidationError } from "@/lib/phone";
import {
  resolveThankYouKind,
  thankYouMessage,
  type ThankYouKind,
} from "@/lib/thank-you";
import type { RsvpStatus } from "@/lib/types";

type Status = Exclude<RsvpStatus, "imported">;

type Guest = {
  full_name: string;
  phone: string;
  guest_count: number;
  status: RsvpStatus;
  notes: string | null;
  already_final: boolean;
  /** On the list (e.g. manual add) but has not confirmed/declined yet */
  pending_rsvp?: boolean;
  is_new?: boolean;
};

type Step = "phone" | "code" | "confirm";

type Props = {
  content: SiteContent;
};

export function PhoneAuthRsvp({ content }: Props) {
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
  const [lastOtpPhone, setLastOtpPhone] = useState<string | null>(null);
  const [otpCooldownUntil, setOtpCooldownUntil] = useState(0);
  const [editing, setEditing] = useState(false);

  function applyGuest(next: Guest) {
    setGuest(next);
    setFullName(next.full_name || "");
    setGuestCount(Math.max(next.guest_count || 1, 1));
    setStatus(
      next.status === "declined" ||
        next.status === "maybe" ||
        next.status === "confirmed"
        ? next.status
        : "confirmed"
    );
    // Summary + "עדכון סטטוס" only after a prior confirmation.
    setEditing(!next.already_final);
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
      if (data.unchanged) {
        setEditing(false);
        return;
      }
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
  }

  if (loading) {
    return <p className="rsvp-lead">{content.loadingLabel}</p>;
  }

  if (done && doneKind) {
    return (
      <div className="success-panel animate-fade-up" role="status">
        <p className="success-body">
          {thankYouMessage(doneKind, content)}
        </p>
        <button
          type="button"
          className="text-link-btn"
          onClick={() => {
            setDone(false);
            setDoneKind(null);
            setEditing(true);
          }}
        >
          {content.updateStatusLabel}
        </button>
      </div>
    );
  }

  if (step === "phone") {
    return (
      <form className="rsvp-form animate-fade-up" onSubmit={sendOtp}>
        {content.rsvpLeadHome && (
          <p className="rsvp-lead">{content.rsvpLeadHome}</p>
        )}
        <div className="field">
          <label htmlFor="phone">{content.phoneLabel}</label>
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
              setError(phoneValidationError(phone));
            }}
          />
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="submit-btn" disabled={busy}>
          {busy ? "…" : content.sendOtpLabel}
        </button>
        {content.rsvpHelp && <p className="rsvp-lead">{content.rsvpHelp}</p>}
      </form>
    );
  }

  if (step === "code") {
    return (
      <form className="rsvp-form otp-step animate-fade-up" onSubmit={verifyOtp}>
        <p className="otp-kicker">{content.codeLabel}</p>
        <p className="otp-lead">{content.otpSentLead}</p>
        <p className="otp-phone" dir="ltr">
          {formatPhoneDisplay(phone)}
        </p>

        <OtpCodeInput
          value={code}
          onChange={setCode}
          label={content.codeLabel}
          disabled={busy}
        />

        {error && (
          <p className="form-error otp-error" role="alert">
            {error}
          </p>
        )}

        <div className="otp-actions">
          <button
            type="submit"
            className="submit-btn"
            disabled={busy || code.length < 6}
          >
            {busy ? "…" : content.verifyOtpLabel}
          </button>
          <button
            type="button"
            className="text-link-btn otp-change-phone"
            onClick={() => {
              setStep("phone");
              setCode("");
              setError(null);
            }}
          >
            {content.changePhoneLabel}
          </button>
        </div>
      </form>
    );
  }

  if (!guest) return null;

  const isNew = Boolean(guest.is_new);
  const pendingRsvp =
    Boolean(guest.pending_rsvp) || guest.status === "imported";

  if (!isNew && guest.already_final && !editing) {
    const statusText =
      status === "declined"
        ? content.statusNoLabel
        : status === "maybe"
          ? content.statusMaybeLabel
          : content.statusYesLabel;

    return (
      <div className="rsvp-form rsvp-summary animate-fade-up">
        <p className="invitee-name">
          {applyTemplate(content.guestGreeting, { name: guest.full_name })}
        </p>
        <p className="rsvp-lead">{content.alreadyConfirmedNote}</p>
        <div className="rsvp-current">
          <p>
            <span className="rsvp-current-label">{content.statusLegend}</span>
            <strong>{statusText}</strong>
          </p>
          {status !== "declined" && (
            <p>
              <span className="rsvp-current-label">
                {content.guestCountLabel}
              </span>
              <strong>{guestCount}</strong>
            </p>
          )}
        </div>
        <button
          type="button"
          className="submit-btn"
          onClick={() => setEditing(true)}
        >
          {content.updateStatusLabel}
        </button>
        <button type="button" className="text-link-btn" onClick={logout}>
          {content.logoutLabel}
        </button>
      </div>
    );
  }

  return (
    <form className="rsvp-form animate-fade-up" onSubmit={submitRsvp}>
      {isNew ? (
        <>
          <p className="rsvp-lead">{content.newGuestWelcome}</p>
          <div className="field">
            <label htmlFor="full_name">{content.fullNameLabel}</label>
            <input
              id="full_name"
              required
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={content.fullNamePlaceholder}
            />
          </div>
        </>
      ) : (
        <>
          <p className="invitee-name">
            {applyTemplate(content.guestGreeting, { name: guest.full_name })}
          </p>
          {pendingRsvp ? (
            <p className="confirm-prompt">{content.confirmPrompt}</p>
          ) : null}
        </>
      )}
      {!isNew && !pendingRsvp && !guest.already_final && (
        <p className="confirm-prompt">{content.confirmPrompt}</p>
      )}
      {!isNew && guest.already_final && (
        <p className="rsvp-lead">{content.alreadyConfirmedNote}</p>
      )}

      <RsvpChoiceFields
        content={content}
        status={status}
        guestCount={guestCount}
        onStatusChange={setStatus}
        onGuestCountChange={setGuestCount}
      />

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="submit-btn" disabled={busy}>
        {busy ? "…" : content.submitRsvpLabel}
      </button>
      {!isNew && guest.already_final ? (
        <button
          type="button"
          className="text-link-btn"
          onClick={() => {
            setStatus(
              guest.status === "declined" ||
                guest.status === "maybe" ||
                guest.status === "confirmed"
                ? guest.status
                : "confirmed"
            );
            setGuestCount(Math.max(guest.guest_count || 1, 1));
            setError(null);
            setEditing(false);
          }}
        >
          {content.cancelUpdateLabel}
        </button>
      ) : (
        <button type="button" className="link-btn ghost" onClick={logout}>
          {content.logoutLabel}
        </button>
      )}
    </form>
  );
}
