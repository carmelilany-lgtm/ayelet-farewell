import {
  applyTemplate,
  DEFAULT_SITE_CONTENT,
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
  if (status === "maybe") return "עדיין לא יודע/ת 🤔";
  return "ממתין לאישור";
}

function waThankYouTemplate(
  content: SiteContent,
  kind: ThankYouKind
): string {
  if (kind === "declined") {
    return sanitizeDeclinedWaTemplate(content.waThankYouDeclined);
  }
  if (kind === "updated") return content.waThankYouUpdated;
  if (kind === "maybe") {
    return (
      content.waThankYouMaybe?.trim() ||
      DEFAULT_SITE_CONTENT.waThankYouMaybe
    );
  }
  return content.waThankYouConfirmed;
}

export async function buildReminderMessage(opts: {
  fullName: string;
  inviteToken: string;
  origin?: string;
  /** Admin-added guest still waiting — invite wording instead of "reminder". */
  manualPending?: boolean;
}): Promise<string> {
  const content = await getSiteContent();
  const siteUrl = siteAbsoluteUrl(opts.origin);
  const personalLink = inviteAbsoluteUrl(opts.inviteToken, siteUrl);

  const message = applyTemplate(content.reminderTemplate, {
    name: opts.fullName,
    dateTime: content.dateTime,
    place: content.place,
    siteUrl,
    personalLink,
  });

  if (!opts.manualPending) return message;
  return adaptReminderForManualInvite(message);
}

/** Manual pending list: first line should invite, not remind. */
function adaptReminderForManualInvite(message: string): string {
  const inviteLine = "מזמינים אותך למסיבת הפרידה של איילת";

  if (/זוהי תזכורת לעדכון סטטוס הגעה לקראת מסיבת הפרידה של איילת/.test(message)) {
    return message.replace(
      /זוהי תזכורת לעדכון סטטוס הגעה לקראת מסיבת הפרידה של איילת/g,
      inviteLine
    );
  }

  if (/תזכורת למסיבת הפרידה של איילת/.test(message)) {
    return message.replace(/תזכורת למסיבת הפרידה של איילת/g, inviteLine);
  }

  if (/תזכורת למסיבת/.test(message)) {
    return message.replace(/תזכורת למסיבת/g, "מזמינים אותך למסיבת");
  }

  // Default / older templates that talk about "haven't registered yet".
  return message
    .replace(
      /ראינו שעדיין לא נרשמת למסיבת הפרידה של איילת[^\n]*/g,
      inviteLine
    )
    .replace(/\nנשמח אם תעדכנו את סטטוס ההגעה שלכם בהקדם\.\n*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildOrganizerAddGuestSuccess(fullName: string): string {
  return `${fullName} נוסף/ה לרשימה הידנית ✅`;
}

export function buildOrganizerGuestExistsSameName(opts: {
  fullName: string;
  phone: string;
}): string {
  return `המספר ${opts.phone} כבר מופיע במערכת בשם ${opts.fullName}. לא נוסף שוב.`;
}

export function buildOrganizerGuestExistsAskRename(opts: {
  currentName: string;
  newName: string;
  phone: string;
}): string {
  return `המספר ${opts.phone} כבר מופיע במערכת בשם ${opts.currentName}.

לעדכן את השם ל-${opts.newName}?
השיבו: כן
או: לא`;
}

export function buildOrganizerRenameSuccess(opts: {
  phone: string;
  oldName: string;
  newName: string;
}): string {
  return `עודכן ✅
${opts.oldName} → ${opts.newName}
(${opts.phone})`;
}

export function buildOrganizerRenameCancelled(): string {
  return `לא עודכן. השם נשאר כמו שהוא.`;
}

export function buildOrganizerAddGuestFailure(reason: string): string {
  return `לא הצלחתי להוסיף אורח ❌

${reason}

שלחו שוב לפי התבנית:
כרמל אילני
0500000000`;
}

export async function buildGuestThankYouWhatsApp(opts: {
  fullName: string;
  kind: ThankYouKind;
  inviteToken?: string;
  origin?: string;
}): Promise<string> {
  const content = await getSiteContent();
  const siteUrl = siteAbsoluteUrl(opts.origin);
  const personalLink = opts.inviteToken
    ? inviteAbsoluteUrl(opts.inviteToken, siteUrl)
    : siteUrl;

  return applyTemplate(waThankYouTemplate(content, opts.kind), {
    name: opts.fullName,
    personalLink,
    siteUrl,
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
