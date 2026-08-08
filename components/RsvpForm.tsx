"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RsvpChoiceFields } from "@/components/RsvpChoiceFields";
import { SmoothScrollLink } from "@/components/SmoothScrollLink";
import { applyTemplate, type SiteContent } from "@/lib/site-content-defaults";
import {
  resolveThankYouKind,
  thankYouMessage,
  type ThankYouKind,
} from "@/lib/thank-you";
import type { PublicInviteView, RsvpStatus } from "@/lib/types";

type Status = Exclude<RsvpStatus, "imported">;

type Props = {
  token: string;
  invite: PublicInviteView;
  content: SiteContent;
};

export function RsvpForm({ token, invite, content }: Props) {
  const router = useRouter();
  const initialStatus: Status =
    invite.status === "declined" ||
    invite.status === "maybe" ||
    invite.status === "confirmed"
      ? invite.status
      : "confirmed";

  const [guestCount, setGuestCount] = useState(
    Math.max(invite.guest_count || 1, 1)
  );
  const [status, setStatus] = useState<Status>(initialStatus);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [doneKind, setDoneKind] = useState<ThankYouKind | null>(null);
  const [editing, setEditing] = useState(!invite.already_final);

  async function logout() {
    await fetch("/api/auth/me", { method: "DELETE" });
    router.replace("/#rsvp");
  }

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
      if (data.unchanged) {
        setEditing(false);
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

  const logoutBtn = (
    <button type="button" className="text-link-btn" onClick={logout}>
      {content.logoutLabel}
    </button>
  );

  if (done && doneKind) {
    return (
      <div className="success-panel animate-fade-up" role="status">
        <p className="success-body">
          {thankYouMessage(doneKind, content)}
        </p>
        <div className="rsvp-summary-actions">
          <button
            type="button"
            className="submit-btn"
            onClick={() => {
              setDone(false);
              setDoneKind(null);
              setEditing(true);
            }}
          >
            {content.updateStatusLabel}
          </button>
          <SmoothScrollLink className="submit-btn ghost" href="#details">
            {content.viewProgramLabel}
          </SmoothScrollLink>
        </div>
        {logoutBtn}
      </div>
    );
  }

  if (invite.already_final && !editing) {
    const statusText =
      status === "declined"
        ? content.statusNoLabel
        : status === "maybe"
          ? content.statusMaybeLabel
          : content.statusYesLabel;

    return (
      <div className="rsvp-form rsvp-summary animate-fade-up delay-2">
        <p className="invitee-name">
          {applyTemplate(content.guestGreeting, { name: invite.full_name })}
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
        <div className="rsvp-summary-actions">
          <button
            type="button"
            className="submit-btn"
            onClick={() => setEditing(true)}
          >
            {content.updateStatusLabel}
          </button>
          <SmoothScrollLink className="submit-btn ghost" href="#details">
            {content.viewProgramLabel}
          </SmoothScrollLink>
        </div>
        {logoutBtn}
      </div>
    );
  }

  return (
    <form className="rsvp-form animate-fade-up delay-2" onSubmit={onSubmit}>
      <p className="invitee-name">
        {applyTemplate(content.guestGreeting, { name: invite.full_name })}
      </p>
      {!invite.already_final && (
        <p className="confirm-prompt">{content.confirmPrompt}</p>
      )}
      {invite.already_final && (
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

      <button type="submit" className="submit-btn" disabled={submitting}>
        {submitting ? "…" : content.submitRsvpLabel}
      </button>
      {invite.already_final ? (
        <button
          type="button"
          className="text-link-btn"
          onClick={() => {
            setStatus(initialStatus);
            setGuestCount(Math.max(invite.guest_count || 1, 1));
            setError(null);
            setEditing(false);
          }}
        >
          {content.cancelUpdateLabel}
        </button>
      ) : null}
      {logoutBtn}
    </form>
  );
}
