"use client";

import { useState } from "react";
import { CONFIRM_PROMPT } from "@/lib/copy";
import {
  resolveThankYouKind,
  thankYouMessage,
  type ThankYouKind,
  type ThankYouMessages,
} from "@/lib/thank-you";
import type { PublicInviteView, RsvpStatus } from "@/lib/types";

type Status = Exclude<RsvpStatus, "imported">;

type Props = {
  token: string;
  invite: PublicInviteView;
  lead?: string;
  confirmPrompt?: string;
  thankYou?: ThankYouMessages;
};

const DEFAULT_THANK_YOU: ThankYouMessages = {
  thankYouConfirmed: "תודה שאישרת את הגעתך. נתראה ב־7 בספטמבר בתחנת רוח, טבעון.",
  thankYouUpdated: "תודה שעדכנת אותנו — נדע להיערך יותר טוב.",
  thankYouDeclined: "תודה על העדכון. נתראה באירוע אחר בקרוב.",
  thankYouMaybe: "קיבלנו את העדכון. אפשר לחזור ולעדכן בכל רגע.",
};

export function RsvpForm({
  token,
  invite,
  lead,
  confirmPrompt,
  thankYou = DEFAULT_THANK_YOU,
}: Props) {
  const initialStatus: Status =
    invite.status === "imported" ? "confirmed" : (invite.status as Status);

  const [guestCount, setGuestCount] = useState(
    Math.max(invite.guest_count || 1, 1)
  );
  const [status, setStatus] = useState<Status>(initialStatus);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [doneKind, setDoneKind] = useState<ThankYouKind | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          guest_count: guestCount,
          status,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "שגיאה בשליחה");
        return;
      }
      setDoneKind(
        resolveThankYouKind({
          previousStatus: invite.status,
          previousGuestCount: invite.guest_count,
          nextStatus: status,
          nextGuestCount: guestCount,
        })
      );
      setDone(true);
    } catch {
      setError("בעיית רשת. נסו שוב.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done && doneKind) {
    return (
      <div className="success-panel animate-fade-up" role="status">
        <p className="success-title">תודה, {invite.full_name}!</p>
        <p className="success-body">
          {thankYouMessage(doneKind, thankYou)}
        </p>
      </div>
    );
  }

  return (
    <form className="rsvp-form animate-fade-up delay-2" onSubmit={onSubmit}>
      <p className="invitee-name">
        שלום <strong>{invite.full_name}</strong>
      </p>
      {lead && (
        <p className="rsvp-lead">
          {lead.replace("{name}", invite.full_name)}
        </p>
      )}
      <p className="confirm-prompt">{confirmPrompt || CONFIRM_PROMPT}</p>
      {invite.already_final && (
        <p className="rsvp-lead">
          כבר שלחתם אישור — אפשר לעדכן שוב אם משהו השתנה.
        </p>
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

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="submit-btn" disabled={submitting}>
        {submitting ? "שולח…" : "שליחת אישור סופי"}
      </button>
    </form>
  );
}
