import { normalizePhone } from "./phone";

export function hasGreenApiConfig(): boolean {
  return Boolean(
    process.env.GREEN_API_ID_INSTANCE?.trim() &&
      process.env.GREEN_API_TOKEN_INSTANCE?.trim()
  );
}

/** Prefer GREEN_API_URL; otherwise derive partner host from instance id prefix. */
export function greenApiHost(): string {
  const override = process.env.GREEN_API_URL?.trim().replace(/\/$/, "");
  if (override) return override;
  const id = process.env.GREEN_API_ID_INSTANCE?.trim() || "";
  if (id.length >= 4) {
    return `https://${id.slice(0, 4)}.api.greenapi.com`;
  }
  return "https://api.greenapi.com";
}

function apiUrl(method: string): string {
  const id = process.env.GREEN_API_ID_INSTANCE!.trim();
  const token = process.env.GREEN_API_TOKEN_INSTANCE!.trim();
  return `${greenApiHost()}/waInstance${id}/${method}/${token}`;
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

function phoneToCheckNumber(phone: string): string | null {
  const chatId = phoneToChatId(phone);
  if (!chatId) return null;
  return chatId.replace(/@c\.us$/, "");
}

export type GreenSendResult =
  | { ok: true; idMessage: string }
  | { ok: false; error: string };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Best-effort: wake / validate chat before first outbound message. */
async function ensureWhatsAppChat(phone: string): Promise<void> {
  const phoneNumber = phoneToCheckNumber(phone);
  if (!phoneNumber || !hasGreenApiConfig()) return;
  try {
    await fetch(apiUrl("checkWhatsapp"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber: Number(phoneNumber) }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // Non-fatal — send may still succeed.
  }
}

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
    const res = await fetch(apiUrl("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message }),
      signal: AbortSignal.timeout(25000),
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

/** OTP with a WhatsApp «העתק קוד» copy button (Green API interactive buttons). */
export async function sendWhatsAppOtpCopy(
  phone: string,
  code: string,
  body: string
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
    const res = await fetch(apiUrl("sendInteractiveButtons"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId,
        body,
        footer: "לחצו להעתקה והדביקו באתר",
        buttons: [
          {
            type: "copy",
            buttonId: "otp-copy",
            buttonText: "העתק קוד",
            copyCode: code,
          },
        ],
      }),
      signal: AbortSignal.timeout(25000),
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
    console.error("Green API OTP copy button send failed", err);
    return { ok: false, error: "כשל ברשת מול Green API" };
  }
}

/**
 * Send with retries. First attempt also runs checkWhatsapp (helps first-time chats).
 */
export async function sendWhatsAppTextWithRetry(
  phone: string,
  message: string,
  attempts = 3
): Promise<GreenSendResult> {
  let last: GreenSendResult = { ok: false, error: "לא נשלח" };
  for (let i = 0; i < attempts; i++) {
    if (i === 0) {
      await ensureWhatsAppChat(phone);
      await sleep(300);
    }
    last = await sendWhatsAppText(phone, message);
    if (last.ok) return last;
    console.warn("Green API send attempt failed", {
      phone,
      attempt: i + 1,
      error: last.error,
    });
    if (i < attempts - 1) {
      await sleep(700 * (i + 1));
    }
  }
  return last;
}

/** Prefer copy-button OTP; fall back to plain text if interactive send fails. */
export async function sendWhatsAppOtpWithRetry(
  phone: string,
  code: string,
  body: string,
  attempts = 3
): Promise<GreenSendResult> {
  let last: GreenSendResult = { ok: false, error: "לא נשלח" };
  for (let i = 0; i < attempts; i++) {
    if (i === 0) {
      await ensureWhatsAppChat(phone);
      await sleep(300);
    }
    last = await sendWhatsAppOtpCopy(phone, code, body);
    if (last.ok) return last;
    console.warn("Green API OTP copy send attempt failed", {
      phone,
      attempt: i + 1,
      error: last.error,
    });
    if (i < attempts - 1) {
      await sleep(700 * (i + 1));
    }
  }

  console.warn("Falling back to plain OTP text message", { phone, error: last.error });
  return sendWhatsAppTextWithRetry(phone, body, 2);
}

export type ReplyButton = {
  buttonId: string;
  buttonText: string;
};

/** Interactive reply buttons (max 3; label ≤25 chars). */
export async function sendWhatsAppReplyButtons(
  phone: string,
  body: string,
  buttons: ReplyButton[],
  footer?: string
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

  const trimmed = buttons.slice(0, 3).map((b) => ({
    buttonId: b.buttonId,
    buttonText: b.buttonText.slice(0, 25),
  }));
  if (trimmed.length === 0) {
    return sendWhatsAppText(phone, body);
  }

  try {
    const res = await fetch(apiUrl("sendInteractiveButtonsReply"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId,
        body,
        ...(footer ? { footer } : {}),
        buttons: trimmed,
      }),
      signal: AbortSignal.timeout(25000),
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
    console.error("Green API reply buttons send failed", err);
    return { ok: false, error: "כשל ברשת מול Green API" };
  }
}

/** Reply buttons with plain-text fallback. */
export async function sendWhatsAppReplyButtonsWithFallback(
  phone: string,
  body: string,
  buttons: ReplyButton[] | undefined,
  footer?: string
): Promise<GreenSendResult> {
  if (buttons && buttons.length > 0) {
    const sent = await sendWhatsAppReplyButtons(phone, body, buttons, footer);
    if (sent.ok) return sent;
    console.warn("Falling back to plain menu text", { phone, error: sent.error });
  }
  return sendWhatsAppText(phone, body);
}

export function organizerNotifyPhone(): string {
  return organizerNotifyPhones()[0] || "+972544854584";
}

/** One or more numbers: comma / semicolon / whitespace separated. */
export function organizerNotifyPhones(): string[] {
  const raw =
    process.env.ORGANIZER_NOTIFY_PHONES?.trim() ||
    process.env.ORGANIZER_NOTIFY_PHONE?.trim() ||
    "+972544854584,+972524059013";

  const phones = raw
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return [...new Set(phones)];
}

/** Notify every configured organizer number (sequential, with retry). */
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
    // Pace between organizers so Green API does not drop the next send.
    await sleep(600);
  }

  return { sent, failed };
}
