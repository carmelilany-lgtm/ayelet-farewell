"use client";

import type { SiteContent } from "@/lib/site-content-defaults";
import type { RsvpStatus } from "@/lib/types";

type Status = Exclude<RsvpStatus, "imported">;

type Props = {
  content: SiteContent;
  status: Status;
  guestCount: number;
  onStatusChange: (status: Status) => void;
  onGuestCountChange: (count: number) => void;
  guestCountId?: string;
  maxGuests?: number;
};

const STATUS_ICONS: Record<Status, string> = {
  confirmed: "🎉",
  maybe: "💭",
  declined: "🤍",
};

export function RsvpChoiceFields({
  content,
  status,
  guestCount,
  onStatusChange,
  onGuestCountChange,
  guestCountId = "guest_count",
  maxGuests = 6,
}: Props) {
  return (
    <>
      <fieldset className="status-fieldset">
        <legend>{content.statusLegend}</legend>
        <div className="status-options">
          {(
            [
              ["confirmed", content.statusYesLabel],
              ["maybe", content.statusMaybeLabel],
              ["declined", content.statusNoLabel],
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
                onChange={() => onStatusChange(value)}
              />
              <span className="status-option-icon" aria-hidden="true">
                {STATUS_ICONS[value]}
              </span>
              <span className="status-option-label">{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {status !== "declined" && (
        <div className="field guest-stepper-field">
          <label htmlFor={guestCountId}>{content.guestCountLabel}</label>
          <div className="guest-stepper">
            <button
              type="button"
              className="guest-stepper-btn"
              aria-label="הפחת אורח"
              disabled={guestCount <= 1}
              onClick={() =>
                onGuestCountChange(Math.max(1, guestCount - 1))
              }
            >
              −
            </button>
            <span
              id={guestCountId}
              className="guest-stepper-value"
              aria-live="polite"
            >
              {guestCount}
            </span>
            <button
              type="button"
              className="guest-stepper-btn"
              aria-label="הוסף אורח"
              disabled={guestCount >= maxGuests}
              onClick={() =>
                onGuestCountChange(Math.min(maxGuests, guestCount + 1))
              }
            >
              +
            </button>
          </div>
        </div>
      )}
    </>
  );
}
