import { formatPhoneDisplay } from "@/lib/phone";
import {
  organizerNotifyPhones,
  sendWhatsAppText,
} from "@/lib/green-api";
import {
  buildOrganizerAddGuestFailure,
  buildOrganizerAddGuestSuccess,
} from "@/lib/reminder-message";
import {
  createImportedGuest,
  findGuestAddConflict,
  type GuestAddConflict,
} from "@/lib/store";
import {
  isOrganizerSender,
  parseAddGuestMessage,
  phoneFromWhatsAppId,
} from "@/lib/whatsapp-add-guest";

export const runtime = "nodejs";

type GreenWebhookBody = {
  typeWebhook?: string;
  idMessage?: string;
  senderData?: {
    chatId?: string;
    sender?: string;
  };
  messageData?: {
    typeMessage?: string;
    textMessageData?: { textMessage?: string };
    extendedTextMessageData?: { text?: string };
  };
};

function extractText(body: GreenWebhookBody): string | null {
  const data = body.messageData;
  if (!data) return null;
  if (data.typeMessage === "textMessage") {
    return data.textMessageData?.textMessage?.trim() || null;
  }
  if (data.typeMessage === "extendedTextMessage") {
    return data.extendedTextMessageData?.text?.trim() || null;
  }
  return null;
}

function phoneConflictMessage(conflict: GuestAddConflict): string {
  const who = conflict.existing.full_name;
  const phone = formatPhoneDisplay(conflict.existing.phone);
  switch (conflict.code) {
    case "ALREADY_CONFIRMED":
      return `המספר ${phone} כבר קיים במערכת אצל ${who} (אישר/ה הגעה). לא נוסף שוב.`;
    case "ALREADY_DECLINED":
      return `המספר ${phone} כבר קיים במערכת אצל ${who} (לא מגיע/ה). לא נוסף שוב.`;
    case "PHONE_EXISTS":
      return `המספר ${phone} כבר קיים במערכת אצל ${who}. לא נוסף שוב.`;
    default:
      return `המספר ${phone} כבר קיים במערכת. לא נוסף שוב.`;
  }
}

function conflictMessage(code: string): string {
  switch (code) {
    case "ALREADY_CONFIRMED":
      return "המספר כבר רשום ומאושר במערכת. לא נוסף שוב.";
    case "ALREADY_DECLINED":
      return "המספר כבר רשום כמי שלא מגיע. לא נוסף שוב.";
    case "PHONE_EXISTS":
      return "המספר כבר קיים ברשימה. לא נוסף שוב.";
    case "INVALID_PHONE":
      return "מספר טלפון לא תקין.";
    case "INVALID_NAME":
      return "שם לא תקין.";
    default:
      return "שגיאה בהוספה. נסו שוב.";
  }
}

function webhookAuthorized(request: Request): boolean {
  const expected = process.env.GREEN_API_WEBHOOK_TOKEN?.trim();
  if (!expected) return true; // allow if not configured (dev); set token in prod
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("token")?.trim();
  const fromHeader = request.headers.get("x-webhook-token")?.trim();
  return fromQuery === expected || fromHeader === expected;
}

/**
 * Green API incoming webhook.
 * Organizers send a fixed template to the instance WhatsApp number to add one guest.
 */
export async function POST(request: Request) {
  if (!webhookAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: GreenWebhookBody;
  try {
    body = (await request.json()) as GreenWebhookBody;
  } catch {
    return Response.json({ ok: true, ignored: "invalid_json" });
  }

  // Always 200 quickly for unrelated webhook types so Green API doesn't retry forever.
  if (body.typeWebhook !== "incomingMessageReceived") {
    return Response.json({ ok: true, ignored: body.typeWebhook || "unknown" });
  }

  const text = extractText(body);
  const senderChatId = body.senderData?.sender || body.senderData?.chatId || "";
  if (!text || !senderChatId) {
    return Response.json({ ok: true, ignored: "no_text" });
  }

  const organizers = organizerNotifyPhones();
  if (!isOrganizerSender(senderChatId, organizers)) {
    return Response.json({ ok: true, ignored: "not_organizer" });
  }

  const parsed = parseAddGuestMessage(text);
  const replyTo =
    phoneFromWhatsAppId(senderChatId) ||
    organizers[0] ||
    "";

  if (!parsed) {
    // Only reply when it looks like an add attempt (has the header).
    if (/^אורח\s*חדש(?:\s|$)/im.test(text) && replyTo) {
      await sendWhatsAppText(
        replyTo,
        buildOrganizerAddGuestFailure(
          "התבנית לא מלאה. צריך שורה עם שם: ושורה עם טלפון:."
        )
      );
    }
    return Response.json({ ok: true, ignored: "not_add_template" });
  }

  // Block duplicates by phone before creating.
  const conflict = await findGuestAddConflict({
    full_name: parsed.fullName,
    phone: parsed.phone,
    phoneOnly: true,
  });
  if (conflict) {
    if (replyTo) {
      await sendWhatsAppText(
        replyTo,
        buildOrganizerAddGuestFailure(phoneConflictMessage(conflict))
      );
    }
    return Response.json({
      ok: true,
      added: false,
      error: conflict.code,
      existing: {
        id: conflict.existing.id,
        full_name: conflict.existing.full_name,
        phone: conflict.existing.phone,
        status: conflict.existing.status,
      },
    });
  }

  try {
    const guest = await createImportedGuest({
      full_name: parsed.fullName,
      phone: parsed.phone,
      phoneOnly: true,
    });

    if (replyTo) {
      await sendWhatsAppText(
        replyTo,
        buildOrganizerAddGuestSuccess(guest.full_name)
      );
    }

    return Response.json({
      ok: true,
      added: true,
      guest: { id: guest.id, phone: guest.phone, full_name: guest.full_name },
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "UNKNOWN";
    if (replyTo) {
      await sendWhatsAppText(
        replyTo,
        buildOrganizerAddGuestFailure(conflictMessage(code))
      );
    }
    console.error("WhatsApp add guest failed", err);
    return Response.json({ ok: true, added: false, error: code });
  }
}

/** Green API may probe with GET. */
export async function GET() {
  return Response.json({
    ok: true,
    service: "ayelet-farewell-whatsapp-webhook",
    template: "אורח חדש / שם: / טלפון:",
  });
}
