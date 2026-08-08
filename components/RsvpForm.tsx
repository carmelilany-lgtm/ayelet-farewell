"use client";

import { useState } from "react";
import { CONFIRM_PROMPT } from "@/lib/copy";
import type { PublicInviteView, RsvpStatus } from "@/lib/types";

type Status = Exclude<RsvpStatus, "imported">;

type Props = {
  token: string;
  invite: PublicInviteView;
};

export function RsvpForm({ token, invite }: Props) {
  const initialStatus: Status =
    invite.status === "imported" ? "confirmed" : (invite.status as Status);

  const [guestCount, setGuestCount] = useState(
    Math.max(invite.guest_count || 1, 1)
  );
  const [status, setStatus] = useState<Status>(initialStatus);
  const [notes, setNotes] = useState(invite.notes || "");
  const [video, setVideo] = useState(invite.wants_video_blessing || "");
  const [speak, setSpeak] = useState(invite.wants_to_speak || "");
  const [excitement, setExcitement] = useState(
    invite.excitement ? String(invite.excitement) : ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [doneStatus, setDoneStatus] = useState<Status | null>(null);

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
          notes: notes.trim() || null,
          wants_video_blessing: video.trim() || null,
          wants_to_speak: speak.trim() || null,
          excitement: excitement ? Number(excitement) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "שגיאה בשליחה");
        return;
      }
      setDoneStatus(status);
      setDone(true);
    } catch {
      setError("בעיית רשת. נסו שוב.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    const message =
      doneStatus === "declined"
        ? "עדכנו שלא תוכלו להגיע. תודה שעדכנתם — נתראה בהזדמנות אחרת."
        : doneStatus === "maybe"
          ? "קיבלנו את העדכון. אפשר לחזור לקישור האישי בכל רגע ולעדכן."
          : "האישור הסופי התקבל. נתראה ב־7 בספטמבר בתחנת רוח, טבעון.";

    return (
      <div className="success-panel animate-fade-up" role="status">
        <p className="success-title">תודה, {invite.full_name}!</p>
        <p className="success-body">{message}</p>
      </div>
    );
  }

  return (
    <form className="rsvp-form animate-fade-up delay-2" onSubmit={onSubmit}>
      <p className="invitee-name">
        שלום <strong>{invite.full_name}</strong>
      </p>
      <p className="confirm-prompt">{CONFIRM_PROMPT}</p>
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

      <button type="submit" className="submit-btn" disabled={submitting}>
        {submitting ? "שולח…" : "שליחת אישור סופי"}
      </button>
    </form>
  );
}
