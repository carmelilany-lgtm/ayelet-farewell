import { randomBytes } from "crypto";

/** Opaque invite token - short, not guessable from phone/name. */
export function createInviteToken(): string {
  // 6 bytes → 8 chars base64url (enough uniqueness for this guest list)
  return randomBytes(6).toString("base64url");
}

export function invitePath(token: string): string {
  return `/i/${token}`;
}

export function inviteAbsoluteUrl(token: string, origin?: string): string {
  const base =
    origin?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";
  return `${base}${invitePath(token)}`;
}

export function siteAbsoluteUrl(origin?: string): string {
  return (
    origin?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

export function whatsappShareUrl(token: string, fullName: string, origin?: string): string {
  const link = inviteAbsoluteUrl(token, origin);
  const site = siteAbsoluteUrl(origin);
  const text = `היי ${fullName}, תזכורת למסיבת הפרידה של איילת 🌿
7 בספטמבר 2026 | 18:00-21:00
תחנת רוח, כיכר בן גוריון 1, טבעון

לפרטים נוספים:
${site}

לעדכון סטטוס ההגעה שלכם:
${link}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
