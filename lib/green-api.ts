import { normalizePhone } from "./phone";

export function hasGreenApiConfig(): boolean {
  return Boolean(
    process.env.GREEN_API_ID_INSTANCE?.trim() &&
      process.env.GREEN_API_TOKEN_INSTANCE?.trim()
  );
}

function apiBaseUrl(): string {
  const host =
    process.env.GREEN_API_URL?.trim().replace(/\/$/, "") ||
    "https://api.greenapi.com";
  const id = process.env.GREEN_API_ID_INSTANCE!.trim();
  const token = process.env.GREEN_API_TOKEN_INSTANCE!.trim();
  return `${host}/waInstance${id}/sendMessage/${token}`;
}

/** Accepts 05…, +9725…, 9725… → chatId */
export function phoneToChatId(phone: string): string | null {
  const digits = String(phone).replace(/\D/g, "");
  if (digits.startsWith("972") && digits.length >= 11) {
    return `${digits}@c.us`;
  }
  const local = normalizePhone(phone);
  if (!local) return null;
  return `972${local.slice(1)}@c.us`;
}

export type GreenSendResult =
  | { ok: true; idMessage: string }
  | { ok: false; error: string };

export async function sendWhatsAppText(
  phone: string,
  message: string
): Promise<GreenSendResult> {
  if (!hasGreenApiConfig()) {
    return {
      ok: false,
      error:
        "Green API לא מוגדר. הוסיפו GREEN_API_ID_INSTANCE ו־GREEN_API_TOKEN_INSTANCE",
    };
  }

  const chatId = phoneToChatId(phone);
  if (!chatId) {
    return { ok: false, error: "מספר טלפון לא תקין לשליחה" };
  }

  try {
    const res = await fetch(apiBaseUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      idMessage?: string;
      message?: string;
    };

    if (!res.ok) {
      return {
        ok: false,
        error: data.message || `שגיאת Green API (${res.status})`,
      };
    }

    if (!data.idMessage) {
      return { ok: false, error: "תשובה לא צפויה מ־Green API" };
    }

    return { ok: true, idMessage: data.idMessage };
  } catch (err) {
    console.error("Green API send failed", err);
    return { ok: false, error: "כשל ברשת מול Green API" };
  }
}

export function organizerNotifyPhone(): string {
  return organizerNotifyPhones()[0] || "+972544854584";
}

/** One or more numbers: comma / semicolon / whitespace separated. */
export function organizerNotifyPhones(): string[] {
  const raw =
    process.env.ORGANIZER_NOTIFY_PHONES?.trim() ||
    process.env.ORGANIZER_NOTIFY_PHONE?.trim() ||
    "+972544854584";

  const phones = raw
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return [...new Set(phones)];
}

async function sendWhatsAppTextWithRetry(
  phone: string,
  message: string,
  attempts = 2
): Promise<GreenSendResult> {
  let last: GreenSendResult = { ok: false, error: "לא נשלח" };
  for (let i = 0; i < attempts; i++) {
    last = await sendWhatsAppText(phone, message);
    if (last.ok) return last;
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  return last;
}

/** Notify every configured organizer number (sequential, with light retry). */
export async function notifyOrganizersWhatsApp(
  message: string
): Promise<{ sent: number; failed: string[] }> {
  const phones = organizerNotifyPhones();
  let sent = 0;
  const failed: string[] = [];

  for (const phone of phones) {
    const result = await sendWhatsAppTextWithRetry(phone, message);
    if (result.ok) {
      sent += 1;
    } else {
      failed.push(`${phone}: ${result.error}`);
      console.error("Organizer notify failed", phone, result.error);
    }
  }

  return { sent, failed };
}
