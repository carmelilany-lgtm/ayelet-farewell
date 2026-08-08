import type { RsvpStatus } from "@/lib/types";

export type ThankYouKind = "confirmed" | "updated" | "declined" | "maybe";

export type ThankYouMessages = {
  thankYouConfirmed: string;
  thankYouUpdated: string;
  thankYouDeclined: string;
  thankYouMaybe: string;
};

/** Pick success copy based on what the guest changed. */
export function resolveThankYouKind(opts: {
  previousStatus: RsvpStatus;
  previousGuestCount: number;
  nextStatus: Exclude<RsvpStatus, "imported">;
  nextGuestCount: number;
}): ThankYouKind {
  if (opts.nextStatus === "declined") return "declined";
  if (opts.nextStatus === "maybe") return "maybe";

  const baselineCount =
    opts.previousStatus === "declined"
      ? 0
      : Math.max(opts.previousGuestCount || 1, 1);
  const nextCount = Math.max(opts.nextGuestCount || 1, 1);

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
