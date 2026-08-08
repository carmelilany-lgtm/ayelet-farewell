import { formatPhoneDisplay } from "@/lib/phone";
import {
  organizerNotifyPhones,
  sendWhatsAppReplyButtonsWithFallback,
  sendWhatsAppText,
} from "@/lib/green-api";
import {
  buildOrganizerAddGuestFailure,
  buildOrganizerAddGuestSuccess,
  buildOrganizerGuestExistsAskRename,
  buildOrganizerGuestExistsSameName,
  buildOrganizerRenameCancelled,
  buildOrganizerRenameSuccess,
} from "@/lib/reminder-message";
import {
  createImportedGuest,
  findGuestAddConflict,
  renameGuestByPhone,
} from "@/lib/store";
import { normalizeGuestName } from "@/lib/types";
import { handleOrganizerMenu } from "@/lib/wa-organizer-menu";
import {
  isOrganizerSender,
  looksLikeAddGuestTemplate,
  parseAddGuestMessage,
  phoneFromWhatsAppId,
} from "@/lib/whatsapp-add-guest";
import {
  clearPendingRename,
  getPendingRename,
  isRenameConfirm,
  isRenameDecline,
  setPendingRename,
} from "@/lib/wa-pending-rename";

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
    buttonsResponseMessage?: {
      selectedButtonId?: string;
      selectedButtonText?: string;
    };
    templateButtonReplyMessage?: {
      selectedId?: string;
      selectedDisplayText?: string;
    };
    interactiveButtonsResponse?: {
      selectedId?: string;
      selectedDisplayText?: string;
    };
  };
};

type OrganizerInput = {
  text: string;
  buttonId: string | null;
};

function extractOrganizerInput(body: GreenWebhookBody): OrganizerInput | null {
  const data = body.messageData;
  if (!data) return null;

  if (data.typeMessage === "textMessage") {
    const text = data.textMessageData?.textMessage?.trim() || "";
    return text ? { text, buttonId: null } : null;
  }

  if (data.typeMessage === "extendedTextMessage") {
    const text = data.extendedTextMessageData?.text?.trim() || "";
    return text ? { text, buttonId: null } : null;
  }

  if (data.typeMessage === "buttonsResponseMessage") {
    const id = data.buttonsResponseMessage?.selectedButtonId?.trim() || null;
    const label =
      data.buttonsResponseMessage?.selectedButtonText?.trim() || "";
    if (!id && !label) return null;
    return { text: label || id || "", buttonId: id };
  }

  if (
    data.typeMessage === "interactiveButtonsResponse" ||
    data.typeMessage === "templateButtonReplyMessage"
  ) {
    const payload =
      data.interactiveButtonsResponse || data.templateButtonReplyMessage;
    const id = payload?.selectedId?.trim() || null;
    const label = payload?.selectedDisplayText?.trim() || "";
    if (!id && !label) return null;
    return { text: label || id || "", buttonId: id };
  }

  return null;
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
  if (!expected) return true;
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("token")?.trim();
  const fromHeader = request.headers.get("x-webhook-token")?.trim();
  return fromQuery === expected || fromHeader === expected;
}

/**
 * Green API incoming webhook for organizers:
 * - name + phone (2 lines) → add guest (unchanged)
 * - עזרה / תפריט / reply buttons → info menus (no messaging guests)
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

  if (body.typeWebhook !== "incomingMessageReceived") {
    return Response.json({ ok: true, ignored: body.typeWebhook || "unknown" });
  }

  const input = extractOrganizerInput(body);
  const senderChatId = body.senderData?.sender || body.senderData?.chatId || "";
  if (!input || !senderChatId) {
    return Response.json({ ok: true, ignored: "no_text" });
  }

  const text = input.text;
  const buttonId = input.buttonId;

  const organizers = organizerNotifyPhones();
  if (!isOrganizerSender(senderChatId, organizers)) {
    return Response.json({ ok: true, ignored: "not_organizer" });
  }

  const replyTo =
    phoneFromWhatsAppId(senderChatId) ||
    organizers[0] ||
    "";

  if (!replyTo) {
    return Response.json({ ok: true, ignored: "no_reply_to" });
  }

  // Button taps are never add-guest / rename free-text.
  const fromButton = Boolean(buttonId);

  // 1) Pending rename yes/no (only when there is a pending ask).
  if (!fromButton && (isRenameConfirm(text) || isRenameDecline(text))) {
    const pending = await getPendingRename(replyTo);
    if (pending) {
      if (isRenameDecline(text)) {
        await clearPendingRename(replyTo);
        await sendWhatsAppText(replyTo, buildOrganizerRenameCancelled());
        return Response.json({ ok: true, renamed: false, cancelled: true });
      }

      const updated = await renameGuestByPhone(
        pending.guestPhone,
        pending.newName
      );
      await clearPendingRename(replyTo);
      if (!updated) {
        await sendWhatsAppText(
          replyTo,
          buildOrganizerAddGuestFailure("לא מצאתי את האורח לעדכון.")
        );
        return Response.json({ ok: true, renamed: false, error: "NOT_FOUND" });
      }

      await sendWhatsAppText(
        replyTo,
        buildOrganizerRenameSuccess({
          phone: formatPhoneDisplay(updated.phone),
          oldName: pending.currentName,
          newName: updated.full_name,
        })
      );
      return Response.json({
        ok: true,
        renamed: true,
        guest: {
          id: updated.id,
          full_name: updated.full_name,
          phone: updated.phone,
        },
      });
    }
    // No pending rename — fall through (e.g. menu / help).
  }

  // 2) Manual add template always wins (do not break existing flow).
  if (!fromButton) {
    const parsed = parseAddGuestMessage(text);
    if (parsed) {
      const conflict = await findGuestAddConflict({
        full_name: parsed.fullName,
        phone: parsed.phone,
        phoneOnly: true,
      });

      if (conflict) {
        const phoneLabel = formatPhoneDisplay(conflict.existing.phone);
        const sameName =
          normalizeGuestName(conflict.existing.full_name) ===
          normalizeGuestName(parsed.fullName);

        if (sameName) {
          await clearPendingRename(replyTo);
          await sendWhatsAppText(
            replyTo,
            buildOrganizerGuestExistsSameName({
              fullName: conflict.existing.full_name,
              phone: phoneLabel,
            })
          );
        } else {
          await setPendingRename({
            organizerPhone: replyTo,
            guestPhone: conflict.existing.phone,
            currentName: conflict.existing.full_name,
            newName: parsed.fullName,
          });
          await sendWhatsAppText(
            replyTo,
            buildOrganizerGuestExistsAskRename({
              currentName: conflict.existing.full_name,
              newName: parsed.fullName,
              phone: phoneLabel,
            })
          );
        }

        return Response.json({
          ok: true,
          added: false,
          error: conflict.code,
          askRename: !sameName,
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

        await clearPendingRename(replyTo);
        await sendWhatsAppText(
          replyTo,
          buildOrganizerAddGuestSuccess(guest.full_name)
        );

        return Response.json({
          ok: true,
          added: true,
          guest: {
            id: guest.id,
            phone: guest.phone,
            full_name: guest.full_name,
          },
        });
      } catch (err) {
        const code = err instanceof Error ? err.message : "UNKNOWN";
        await sendWhatsAppText(
          replyTo,
          buildOrganizerAddGuestFailure(conflictMessage(code))
        );
        console.error("WhatsApp add guest failed", err);
        return Response.json({ ok: true, added: false, error: code });
      }
    }
  }

  // 3) Organizer info menu (עזרה / buttons / numbers / search).
  const menu = await handleOrganizerMenu({
    organizerPhone: replyTo,
    text,
    buttonId,
  });
  if (menu) {
    await sendWhatsAppReplyButtonsWithFallback(
      replyTo,
      menu.message,
      menu.buttons,
      menu.footer
    );
    return Response.json({
      ok: true,
      menu: true,
      exited: Boolean(menu.exited),
      buttons: Boolean(menu.buttons?.length),
    });
  }

  // 4) Almost-add template with bad values.
  if (!fromButton && looksLikeAddGuestTemplate(text)) {
    await sendWhatsAppText(
      replyTo,
      buildOrganizerAddGuestFailure(
        "התבנית לא תקינה. שלחו שם בשורה הראשונה ומספר נייד בשורה השנייה."
      )
    );
    return Response.json({ ok: true, ignored: "not_add_template" });
  }

  return Response.json({ ok: true, ignored: "unhandled" });
}

export async function GET() {
  return Response.json({
    ok: true,
    service: "ayelet-farewell-whatsapp-webhook",
    template: "שם\\nטלפון",
    menu: "עזרה",
  });
}
