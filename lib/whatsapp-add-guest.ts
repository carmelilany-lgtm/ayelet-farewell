import { normalizePhone, phoneIdentity } from "./phone";

/**
 * Fixed WhatsApp template organizers send to the Green API number:
 *
 * אורח חדש
 * שם: ישראל ישראלי
 * טלפון: 054-1234567
 */
export const ADD_GUEST_TEMPLATE_HINT = `אורח חדש
שם: ישראל ישראלי
טלפון: 054-1234567`;

export type ParsedAddGuest = {
  fullName: string;
  phone: string;
};

export function parseAddGuestMessage(text: string): ParsedAddGuest | null {
  const raw = text.replace(/\r\n/g, "\n").trim();
  if (!raw) return null;

  // Require the fixed header so casual chats are ignored.
  if (!/^אורח\s*חדש(?:\s|$)/im.test(raw)) return null;

  const nameMatch = raw.match(/^\s*שם\s*:\s*(.+)$/im);
  const phoneMatch = raw.match(/^\s*טלפון\s*:\s*(.+)$/im);
  if (!nameMatch || !phoneMatch) return null;

  const fullName = nameMatch[1]!.trim().replace(/\s+/g, " ");
  const phone = normalizePhone(phoneMatch[1]!.trim());
  if (!fullName || fullName.length < 2 || !phone) return null;

  return { fullName, phone };
}

/** Extract Israeli local phone (05…) from Green API chatId / sender. */
export function phoneFromWhatsAppId(chatId: string | null | undefined): string | null {
  if (!chatId) return null;
  const digits = chatId.replace(/@.*$/, "").replace(/\D/g, "");
  return normalizePhone(digits);
}

export function isOrganizerSender(
  senderChatId: string,
  organizerPhones: string[]
): boolean {
  const senderId = phoneIdentity(phoneFromWhatsAppId(senderChatId) || senderChatId);
  if (!senderId) return false;
  return organizerPhones.some((p) => phoneIdentity(p) === senderId);
}
