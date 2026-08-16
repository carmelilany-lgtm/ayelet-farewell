import {
  isManualPendingGuest,
  type Rsvp,
  type RsvpSummary,
} from "./types";

/** Single source of truth for admin / WhatsApp RSVP tallies. */
export function summarizeRsvps(rows: Rsvp[]): RsvpSummary {
  const eligibleForReminder = rows.filter(
    (r) =>
      r.status === "imported" ||
      r.status === "confirmed" ||
      r.status === "maybe"
  );
  const manualPending = rows.filter(isManualPendingGuest);
  return {
    total_records: rows.length,
    confirmed: rows.filter((r) => r.status === "confirmed").length,
    declined: rows.filter((r) => r.status === "declined").length,
    maybe: rows.filter((r) => r.status === "maybe").length,
    imported_pending: rows.filter(
      (r) => r.status === "imported" && !isManualPendingGuest(r)
    ).length,
    manual_pending: manualPending.length,
    /** Sum of guest_count for confirmed RSVPs only (includes the registrant). */
    total_guests_attending: rows
      .filter((r) => r.status === "confirmed")
      .reduce((sum, r) => sum + Math.max(r.guest_count || 1, 1), 0),
    reminders_sent: rows.filter((r) => Boolean(r.reminder_sent_at)).length,
    reminders_pending: eligibleForReminder.filter((r) => !r.reminder_sent_at)
      .length,
  };
}
