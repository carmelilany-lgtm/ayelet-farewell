import { normalizePhone, phoneIdentity } from "./phone";

/**
 * Fixed WhatsApp template organizers send to the Green API number:
 *
 * כרמל אילני
 * 0500000000
 */
export const ADD_GUEST_TEMPLATE_HINT = `כרמל אילני
0500000000`;

export type ParsedAddGuest = {
  fullName: string;
  phone: string;
};

/** True when the message looks like name + phone (2+ non-empty lines). */
export function looksLikeAddGuestTemplate(text: string): boolean {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return false;
  // Second line (or any later line) looks phone-ish.
  return lines.slice(1).some((l) => /\d{8,}/.test(l.replace(/\D/g, "")));
}

export function parseAddGuestMessage(text: string): ParsedAddGuest | null {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    // Ignore legacy header if still pasted.
    .filter((l) => !/^אורח\s*חדש$/i.test(l));
  if (lines.length < 2) return null;

  // Prefer labeled format if present, else plain: name then phone.
  const labeledName = text.match(/^\s*שם\s*:\s*(.+)$/im)?.[1]?.trim();
  const labeledPhone = text.match(/^\s*טלפון\s*:\s*(.+)$/im)?.[1]?.trim();

  let fullName: string;
  let phoneRaw: string;

  if (labeledName && labeledPhone) {
    fullName = labeledName.replace(/\s+/g, " ");
    phoneRaw = labeledPhone;
  } else {
    // First non-phone-looking line(s) as name; last phone-looking line as phone.
    // Default: line 1 = name, line 2 = phone (exactly as organizers will send).
    fullName = lines[0]!.replace(/\s+/g, " ");
    phoneRaw = lines[1]!;

    // If first line is accidentally the phone, swap when second looks like a name.
    if (normalizePhone(fullName) && !normalizePhone(phoneRaw) && lines[1]) {
      fullName = lines[1]!.replace(/\s+/g, " ");
      phoneRaw = lines[0]!;
    }
  }

  // Strip accidental "שם:" / "טלפון:" prefixes if pasted partially.
  fullName = fullName.replace(/^שם\s*:\s*/i, "").trim();
  phoneRaw = phoneRaw.replace(/^טלפון\s*:\s*/i, "").trim();

  const phone = normalizePhone(phoneRaw);
  if (!fullName || fullName.length < 2 || !phone) return null;
  // Don't treat a phone number as a name.
  if (normalizePhone(fullName)) return null;

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
