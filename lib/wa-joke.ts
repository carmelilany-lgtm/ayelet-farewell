import { normalizePhone } from "./phone";
import { resolveWhatsAppChatId } from "./green-api";
import { pickHebrewJoke } from "./wa-hebrew-jokes";
import {
  isOrganizerSender,
  phoneFromWhatsAppId,
} from "./whatsapp-add-guest";

/** Env allowlist for joke-only WhatsApp senders (not organizers). */
export function jokeAuthorizedPhones(): string[] {
  const raw = process.env.JOKE_AUTHORIZED_PHONES?.trim() || "";
  const phones = raw
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return [...new Set(phones)];
}

export function isJokePrimaryRequest(
  text: string,
  buttonId?: string | null
): boolean {
  // "עוד" uses buttonId joke — that is a "more" request, not a primary wake word.
  if (buttonId && /^(joke|joke-more)$/i.test(buttonId.trim())) {
    const label = text.trim();
    // Primary only if the button itself says בדיחה / joke (not עוד).
    if (label && /^(בדיחה|joke|jokes|dad\s*joke)[!?.]*$/i.test(label)) {
      return true;
    }
    return false;
  }
  const t = text.trim();
  if (!t) return false;
  return /^(בדיחה|joke|jokes|dad\s*joke)[!?.]*$/i.test(t);
}

/** "עוד" after at least one joke was already sent (button or plain text). */
export function isJokeMoreRequest(
  text: string,
  buttonId?: string | null,
  opts?: { allowMoreText?: boolean }
): boolean {
  if (buttonId && /^(joke|joke-more)$/i.test(buttonId.trim())) {
    const label = text.trim();
    // Treat unlabeled / "עוד" button taps as more; "בדיחה" button is primary.
    if (label && /^(בדיחה|joke|jokes|dad\s*joke)[!?.]*$/i.test(label)) {
      return false;
    }
    return true;
  }
  const t = text.trim();
  if (!t) return false;
  if (!opts?.allowMoreText) return false;
  return /^עוד[!?.]*$/i.test(t);
}

export const JOKE_MORE_BUTTON = {
  buttonId: "joke",
  buttonText: "עוד",
} as const;

/** Short Hebrew joke; skips recently sent ones when possible. */
export async function fetchShortJoke(
  excludeKeys: readonly string[] = []
): Promise<string> {
  return pickHebrewJoke(excludeKeys);
}

/**
 * Map webhook sender to a local phone if they are on the given allowlist
 * (@c.us or privacy @lid via Green checkWhatsapp).
 */
export async function resolveAllowlistedPhone(
  senderChatId: string,
  phones: string[]
): Promise<string | null> {
  if (phones.length === 0) return null;

  if (isOrganizerSender(senderChatId, phones)) {
    return (
      phoneFromWhatsAppId(senderChatId) ||
      normalizePhone(phones[0] || "") ||
      null
    );
  }

  const senderKey = senderChatId.trim().toLowerCase();
  for (const phone of phones) {
    const resolved = await resolveWhatsAppChatId(phone);
    if (!resolved) continue;
    if (resolved.trim().toLowerCase() === senderKey) {
      return normalizePhone(phone);
    }
  }
  return null;
}
