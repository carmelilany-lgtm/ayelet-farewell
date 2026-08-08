import type { RsvpStatus } from "@/lib/types";

export type ThankYouKind = "confirmed" | "updated" | "declined" | "maybe";

export type ThankYouMessages = {
  thankYouConfirmed: string;
  thankYouUpdated: string;
  thankYouDeclined: string;
  thankYouMaybe: string;
};

/** Normalize guest count for comparison (declined always counts as 0). */
export function effectiveGuestCount(
  status: RsvpStatus,
  guestCount: number
): number {
  if (status === "declined") return 0;
  return Math.max(guestCount || 0, status === "imported" ? 0 : 1);
}

/**
 * True when the guest resubmits the same final status + count.
 * First RSVP after `imported` is never treated as unchanged.
 */
export function isUnchangedRsvp(opts: {
  previousStatus: RsvpStatus | null | undefined;
  previousGuestCount: number;
  nextStatus: Exclude<RsvpStatus, "imported">;
  nextGuestCount: number;
}): boolean {
  const prev = opts.previousStatus;
  if (!prev || prev === "imported") return false;
  if (prev !== opts.nextStatus) return false;
  return (
    effectiveGuestCount(prev, opts.previousGuestCount) ===
    effectiveGuestCount(opts.nextStatus, opts.nextGuestCount)
  );
}

/**
 * Pick success copy based on what the guest changed.
 * Status changes after the first RSVP use "updated" when returning to confirmed.
 */
export function resolveThankYouKind(opts: {
  previousStatus: RsvpStatus;
  previousGuestCount: number;
  nextStatus: Exclude<RsvpStatus, "imported">;
  nextGuestCount: number;
}): ThankYouKind {
  if (opts.nextStatus === "declined") return "declined";
  if (opts.nextStatus === "maybe") return "maybe";

  // First confirmation after import / manual add — always "confirmed".
  if (opts.previousStatus === "imported") {
    return "confirmed";
  }

  // Returning to confirmed from maybe/declined, or changing guest count.
  if (opts.previousStatus !== "confirmed") {
    return "updated";
  }

  const baselineCount = effectiveGuestCount(
    opts.previousStatus,
    opts.previousGuestCount
  );
  const nextCount = effectiveGuestCount(opts.nextStatus, opts.nextGuestCount);

  if (baselineCount > 0 && nextCount !== baselineCount) {
    return "updated";
  }

  return "confirmed";
}

export function thankYouMessage(
  kind: ThankYouKind,
  messages: ThankYouMessages
): string {
  switch (kind) {
    case "declined":
      return messages.thankYouDeclined;
    case "updated":
      return messages.thankYouUpdated;
    case "maybe":
      return messages.thankYouMaybe;
    default:
      return messages.thankYouConfirmed;
  }
}
