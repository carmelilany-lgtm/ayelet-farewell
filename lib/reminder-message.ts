import {
  applyTemplate,
  sanitizeDeclinedWaTemplate,
  type SiteContent,
} from "./site-content-defaults";
import { inviteAbsoluteUrl, siteAbsoluteUrl } from "./invite-token";
import { getSiteContent } from "./site-content";
import {
  resolveThankYouKind,
  type ThankYouKind,
} from "./thank-you";
import type { RsvpStatus } from "./types";

export { CONFIRM_PROMPT } from "./copy";

function statusLabelForOrganizer(status: string): string {
  if (status === "confirmed") return "מגיע/ה ✅";
  if (status === "declined") return "לא מגיע/ה ❌";
  return "לא בטוח/ה 🤔";
}

function waThankYouTemplate(
  content: SiteContent,
  kind: ThankYouKind
): string {
  if (kind === "declined") {
    return sanitizeDeclinedWaTemplate(content.waThankYouDeclined);
  }
  if (kind === "updated") return content.waThankYouUpdated;
  // confirmed + maybe (maybe removed from guest UI)
  return content.waThankYouConfirmed;
}

export async function buildReminderMessage(opts: {
  fullName: string;
  inviteToken: string;
  origin?: string;
}): Promise<string> {
  const content = await getSiteContent();
  const siteUrl = siteAbsoluteUrl(opts.origin);
  const personalLink = inviteAbsoluteUrl(opts.inviteToken, siteUrl);

  return applyTemplate(content.reminderTemplate, {
    name: opts.fullName,
    dateTime: content.dateTime,
    place: content.place,
    siteUrl,
    personalLink,
  });
}

export async function buildGuestThankYouWhatsApp(opts: {
  fullName: string;
  kind: ThankYouKind;
}): Promise<string> {
  const content = await getSiteContent();
  return applyTemplate(waThankYouTemplate(content, opts.kind), {
    name: opts.fullName,
  });
}

export function thankYouKindForRsvpUpdate(opts: {
  previousStatus: RsvpStatus | null;
  previousGuestCount: number;
  nextStatus: Exclude<RsvpStatus, "imported">;
  nextGuestCount: number;
}): ThankYouKind {
  return resolveThankYouKind({
    previousStatus: opts.previousStatus ?? "imported",
    previousGuestCount: opts.previousGuestCount,
    nextStatus: opts.nextStatus,
    nextGuestCount: opts.nextGuestCount,
  });
}

export async function buildOtpMessage(code: string): Promise<string> {
  const content = await getSiteContent();
  return applyTemplate(content.otpMessageTemplate, { code });
}

export async function buildOrganizerConfirmMessage(opts: {
  fullName: string;
  phone: string;
  guestCount: number;
  status: string;
  notes?: string | null;
}): Promise<string> {
  const content = await getSiteContent();
  return applyTemplate(content.organizerNotifyTemplate, {
    name: opts.fullName,
    phone: opts.phone,
    status: statusLabelForOrganizer(opts.status),
    guestCount: String(opts.guestCount),
    notes: opts.notes?.trim() ? `הערות: ${opts.notes.trim()}` : "",
  });
}

export type { SiteContent };
