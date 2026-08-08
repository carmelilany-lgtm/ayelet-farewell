import { inviteAbsoluteUrl, siteAbsoluteUrl } from "./invite-token";
import { getSiteContent } from "./site-content";

export { CONFIRM_PROMPT } from "./copy";

export async function buildReminderMessage(opts: {
  fullName: string;
  inviteToken: string;
  origin?: string;
}): Promise<string> {
  const content = await getSiteContent();
  const siteUrl = siteAbsoluteUrl(opts.origin);
  const personalLink = inviteAbsoluteUrl(opts.inviteToken, siteUrl);

  return `שלום ${opts.fullName},

${content.reminderIntro}

📅 ${content.dateTime}
📍 ${content.place}

${content.reminderSiteLabel}:
${siteUrl}

${content.reminderLinkLabel}:
${personalLink}

${content.reminderOutro}`;
}

export function buildOtpMessage(code: string): string {
  return `קוד האימות למסיבת הפרידה של איילת: ${code}

הקוד תקף ל־10 דקות.
אל תשתפו את הקוד עם אחרים.`;
}

export function buildOrganizerConfirmMessage(opts: {
  fullName: string;
  phone: string;
  guestCount: number;
  status: string;
  notes?: string | null;
}): string {
  const statusLabel =
    opts.status === "confirmed"
      ? "מגיע/ה ✅"
      : opts.status === "declined"
        ? "לא מגיע/ה ❌"
        : "לא בטוח/ה 🤔";

  return `עדכון אישור הגעה — מסיבת פרידה

שם: ${opts.fullName}
טלפון: ${opts.phone}
סטטוס: ${statusLabel}
מספר אורחים: ${opts.guestCount}
${opts.notes ? `הערות: ${opts.notes}` : ""}`.trim();
}
