import { normalizePhone } from "./phone";
import { resolveWhatsAppChatId } from "./green-api";
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

export function isJokeRequest(
  text: string,
  buttonId?: string | null,
  opts?: { allowMoreText?: boolean }
): boolean {
  if (buttonId && /^(joke|joke-more)$/i.test(buttonId.trim())) return true;
  const t = text.trim();
  if (!t) return false;
  if (/^(בדיחה|joke|jokes|dad\s*joke)[!?.]*$/i.test(t)) return true;
  // Plain "עוד" only for joke-only numbers — organizers use "עוד" in the menu.
  if (opts?.allowMoreText && /^עוד[!?.]*$/i.test(t)) return true;
  return false;
}

export const JOKE_MORE_BUTTON = {
  buttonId: "joke",
  buttonText: "עוד",
} as const;

export const JOKE_ONLY_HINT =
  "יש לך גישה רק לבדיחות.\nשלחו: בדיחה";

/** Short Hebrew backups when every public API is down. */
const HEBREW_FALLBACKS = [
  "למה המחשב הלך לרופא?\nכי היה לו וירוס.",
  "מה אומר גרב אחד לשני?\nנתראה בכביסה.",
  "למה הספר הלך לרופא?\nכי היו לו יותר מדי דפים.",
  "מה עושה דג במחשב?\nשולח מייל בים.",
  "למה הענן לא הלך למסיבה?\nכי היה לו מצב רוח גשום.",
  "איך קוראים לעטלף ששר?\nבאטמן.",
  "למה העיפרון לא הצליח במבחן?\nכי הוא היה שבור בפנים.",
  "מה אומרת סוללה לסוללה אחרת?\nאני חיובית לגבינו.",
];

function pickFallback(): string {
  const i = Math.floor(Math.random() * HEBREW_FALLBACKS.length);
  return HEBREW_FALLBACKS[i]!;
}

function cleanJoke(text: string): string | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 8 || t.length > 280) return null;
  return t;
}

function formatTwoPart(setup: string, punchline: string): string | null {
  const a = setup.replace(/\s+/g, " ").trim();
  const b = punchline.replace(/\s+/g, " ").trim();
  if (!a || !b) return null;
  const combined = `${a}\n${b}`;
  return combined.length <= 280 ? combined : null;
}

async function fetchIcanhaz(): Promise<string | null> {
  const res = await fetch("https://icanhazdadjoke.com/", {
    headers: {
      Accept: "application/json",
      "User-Agent": "ayelet-farewell-whatsapp (joke bot)",
    },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { joke?: string };
  return data.joke ? cleanJoke(data.joke) : null;
}

async function fetchJokeApi(): Promise<string | null> {
  const res = await fetch(
    "https://v2.jokeapi.dev/joke/Pun,Miscellaneous,Programming?safe-mode&maxLength=160",
    { signal: AbortSignal.timeout(6000) }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    error?: boolean;
    type?: string;
    joke?: string;
    setup?: string;
    delivery?: string;
  };
  if (data.error) return null;
  if (data.type === "single" && data.joke) return cleanJoke(data.joke);
  if (data.type === "twopart" && data.setup && data.delivery) {
    return formatTwoPart(data.setup, data.delivery);
  }
  return null;
}

async function fetchOfficialJoke(): Promise<string | null> {
  const res = await fetch("https://official-joke-api.appspot.com/random_joke", {
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { setup?: string; punchline?: string };
  if (data.setup && data.punchline) {
    return formatTwoPart(data.setup, data.punchline);
  }
  return null;
}

/**
 * Short joke from public APIs; Hebrew fallback if the network fails.
 */
export async function fetchShortJoke(): Promise<string> {
  const sources = [fetchIcanhaz, fetchJokeApi, fetchOfficialJoke];
  // Shuffle so we do not hammer one API.
  for (let i = sources.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [sources[i], sources[j]] = [sources[j]!, sources[i]!];
  }

  for (const source of sources) {
    try {
      const joke = await source();
      if (joke) return joke;
    } catch {
      // try next
    }
  }

  return pickFallback();
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
