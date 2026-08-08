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
  return (
    process.env.ORGANIZER_NOTIFY_PHONE?.trim() || "+972544854584"
  );
}
