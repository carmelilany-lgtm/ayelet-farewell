import { formatPhoneDisplay } from "@/lib/phone";
import {
  organizerNotifyPhones,
  sendOrganizerMenuMessage,
  sendWhatsAppReplyButtons,
  sendWhatsAppText,
} from "@/lib/green-api";
import {
  buildAskSendInviteNow,
  buildInviteSendFailed,
  buildInviteSendSkipped,
  buildInviteSendSuccess,
  buildOrganizerAddGuestFailure,
  buildOrganizerGuestExistsAskRename,
  buildOrganizerGuestExistsSameName,
  buildOrganizerRenameCancelled,
  buildOrganizerRenameSuccess,
  buildReminderMessage,
} from "@/lib/reminder-message";
import {
  createImportedGuest,
  findGuestAddConflict,
  getRsvpById,
  markReminderSent,
  renameGuestByPhone,
} from "@/lib/store";
import { logWhatsAppOutbound } from "@/lib/system-log";
import { isManualPendingGuest, normalizeGuestName } from "@/lib/types";
import {
  fetchShortJoke,
  isJokeMoreRequest,
  isJokePrimaryRequest,
  jokeAuthorizedPhones,
  JOKE_MORE_BUTTON,
  resolveAllowlistedPhone,
} from "@/lib/wa-joke";
import {
  getRecentJokeKeys,
  hasJokeSession,
  markJokeSession,
} from "@/lib/wa-joke-session";
import {
  handleGuestRsvp,
  resolveRemindedGuestPhone,
  sendGuestRsvpReply,
  sendReminderWithRsvpButtons,
} from "@/lib/wa-guest-rsvp";
import { handleOrganizerMenu } from "@/lib/wa-organizer-menu";
import {
  looksLikeAddGuestTemplate,
  parseAddGuestMessage,
} from "@/lib/whatsapp-add-guest";
import {
  clearPendingInviteSend,
  getPendingInviteSend,
  isInviteSendConfirm,
  isInviteSendDecline,
  setPendingInviteSend,
} from "@/lib/wa-pending-invite-send";
import {
  clearPendingRename,
  getPendingRename,
  isRenameConfirm,
  isRenameDecline,
  setPendingRename,
} from "@/lib/wa-pending-rename";

export const runtime = "nodejs";

const INVITE_SEND_BUTTONS = [
  { buttonId: "invite_yes", buttonText: "כן" },
  { buttonId: "invite_no", buttonText: "לא" },
];

async function replyWhatsApp(
  phone: string,
  message: string,
  purpose: string
) {
  const result = await sendWhatsAppText(phone, message);
  void logWhatsAppOutbound({
    phone,
    purpose,
    ok: result.ok,
    error: result.ok ? undefined : result.error,
    message,
    actor: "whatsapp",
    messageId: result.ok ? result.idMessage : null,
  });
  return result;
}

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
    listResponseMessage?: {
      title?: string;
      /** Green API documents this as a string row id. */
      singleSelectReply?: string | { selectedRowId?: string };
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

  if (data.typeMessage === "listResponseMessage") {
    const payload = data.listResponseMessage;
    const reply = payload?.singleSelectReply;
    const id =
      (typeof reply === "string"
        ? reply
        : reply?.selectedRowId
      )?.trim() || null;
    const label = payload?.title?.trim() || "";
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
 * Green API incoming webhook:
 * - Organizers: add guest, rename, info menus, jokes
 * - Guests who received a reminder: RSVP buttons / guest count
 * - Joke-authorized phones (JOKE_AUTHORIZED_PHONES): jokes only
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
  const jokePhones = jokeAuthorizedPhones();
  const organizerPhone = await resolveAllowlistedPhone(
    senderChatId,
    organizers
  );
  const jokePhone =
    organizerPhone ||
    (await resolveAllowlistedPhone(senderChatId, jokePhones));
  const guestPhone = organizerPhone
    ? null
    : await resolveRemindedGuestPhone(senderChatId);

  if (!jokePhone && !guestPhone) {
    return Response.json({ ok: true, ignored: "not_authorized" });
  }

  const isOrganizer = Boolean(organizerPhone);
  const replyTo = jokePhone || guestPhone!;

  // Jokes: wake only on "בדיחה". "עוד" only after at least one joke was sent.
  if (jokePhone) {
    const wantsPrimary = isJokePrimaryRequest(text, buttonId);
    const wantsMore =
      !wantsPrimary &&
      isJokeMoreRequest(text, buttonId, { allowMoreText: !isOrganizer }) &&
      (await hasJokeSession(jokePhone));

    if (wantsPrimary || wantsMore) {
      const joke = await fetchShortJoke(await getRecentJokeKeys(jokePhone));
      await sendOrganizerMenuMessage(jokePhone, {
        body: joke,
        buttons: [JOKE_MORE_BUTTON],
      });
      await markJokeSession(jokePhone, joke);
      return Response.json({
        ok: true,
        joke: true,
        more: wantsMore,
        organizer: isOrganizer,
      });
    }
  }

  // Reminded guests (non-organizers): RSVP via WhatsApp buttons / text.
  if (guestPhone && !isOrganizer) {
    const guestReply = await handleGuestRsvp({
      phone: guestPhone,
      text,
      buttonId,
    });
    if (guestReply) {
      await sendGuestRsvpReply(guestPhone, guestReply);
      return Response.json({
        ok: true,
        guestRsvp: true,
        askedCount: Boolean(guestReply.buttons?.length),
      });
    }
    return Response.json({ ok: true, ignored: "guest_unhandled" });
  }

  // Joke-only numbers: silent ignore unless they wrote בדיחה / valid עוד.
  if (!isOrganizer) {
    return Response.json({ ok: true, ignored: "joke_only_silent" });
  }

  // Button taps are never add-guest / rename free-text.
  const fromButton = Boolean(buttonId);

  // 0) After manual add: ask whether to send invite now (כן / לא).
  if (
    isInviteSendConfirm(text, buttonId) ||
    isInviteSendDecline(text, buttonId)
  ) {
    const pendingInvite = await getPendingInviteSend(replyTo);
    if (pendingInvite) {
      if (isInviteSendDecline(text, buttonId)) {
        await clearPendingInviteSend(replyTo);
        await replyWhatsApp(
          replyTo,
          buildInviteSendSkipped(pendingInvite.guestName),
          "invite_send_skipped"
        );
        return Response.json({
          ok: true,
          inviteSent: false,
          skipped: true,
          guestId: pendingInvite.guestId,
        });
      }

      await clearPendingInviteSend(replyTo);
      const guest = await getRsvpById(pendingInvite.guestId);
      if (!guest) {
        await replyWhatsApp(
          replyTo,
          buildInviteSendFailed("לא מצאתי את האורח במערכת."),
          "invite_send_failed"
        );
        return Response.json({
          ok: true,
          inviteSent: false,
          error: "NOT_FOUND",
        });
      }

      if (guest.reminder_sent_at) {
        await replyWhatsApp(
          replyTo,
          `כבר נשלחה הזמנה ל-${guest.full_name} בעבר.`,
          "invite_send_already"
        );
        return Response.json({
          ok: true,
          inviteSent: false,
          already: true,
          guestId: guest.id,
        });
      }

      const message = await buildReminderMessage({
        fullName: guest.full_name,
        inviteToken: guest.invite_token,
        manualPending: isManualPendingGuest(guest),
      });
      const sent = await sendReminderWithRsvpButtons(guest.phone, message, {
        guestName: guest.full_name,
        rsvpId: guest.id,
      });
      if (!sent.ok) {
        await replyWhatsApp(
          replyTo,
          buildInviteSendFailed(sent.error || "שגיאה בשליחה"),
          "invite_send_failed"
        );
        return Response.json({
          ok: true,
          inviteSent: false,
          error: sent.error,
          guestId: guest.id,
        });
      }

      await markReminderSent(guest.id, sent.idMessage);
      await replyWhatsApp(
        replyTo,
        buildInviteSendSuccess(guest.full_name),
        "invite_send_success"
      );
      return Response.json({
        ok: true,
        inviteSent: true,
        guestId: guest.id,
      });
    }
  }

  // 1) Pending rename yes/no (only when there is a pending ask).
  if (!fromButton && (isRenameConfirm(text) || isRenameDecline(text))) {
    const pending = await getPendingRename(replyTo);
    if (pending) {
      if (isRenameDecline(text)) {
        await clearPendingRename(replyTo);
        await replyWhatsApp(
          replyTo,
          buildOrganizerRenameCancelled(),
          "rename_cancel"
        );
        return Response.json({ ok: true, renamed: false, cancelled: true });
      }

      const updated = await renameGuestByPhone(
        pending.guestPhone,
        pending.newName
      );
      await clearPendingRename(replyTo);
      if (!updated) {
        await replyWhatsApp(
          replyTo,
          buildOrganizerAddGuestFailure("לא מצאתי את האורח לעדכון."),
          "rename_failed"
        );
        return Response.json({ ok: true, renamed: false, error: "NOT_FOUND" });
      }

      await replyWhatsApp(
        replyTo,
        buildOrganizerRenameSuccess({
          phone: formatPhoneDisplay(updated.phone),
          oldName: pending.currentName,
          newName: updated.full_name,
        }),
        "rename_success"
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
          await clearPendingInviteSend(replyTo);
          await replyWhatsApp(
            replyTo,
            buildOrganizerGuestExistsSameName({
              fullName: conflict.existing.full_name,
              phone: phoneLabel,
            }),
            "add_guest_exists"
          );
        } else {
          await clearPendingInviteSend(replyTo);
          await setPendingRename({
            organizerPhone: replyTo,
            guestPhone: conflict.existing.phone,
            currentName: conflict.existing.full_name,
            newName: parsed.fullName,
          });
          await replyWhatsApp(
            replyTo,
            buildOrganizerGuestExistsAskRename({
              currentName: conflict.existing.full_name,
              newName: parsed.fullName,
              phone: phoneLabel,
            }),
            "add_guest_ask_rename"
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
          source: "whatsapp",
        });

        await clearPendingRename(replyTo);
        await setPendingInviteSend({
          organizerPhone: replyTo,
          guestId: guest.id,
          guestPhone: guest.phone,
          guestName: guest.full_name,
        });

        const ask = buildAskSendInviteNow(guest.full_name);
        const buttonsSent = await sendWhatsAppReplyButtons(
          replyTo,
          ask,
          INVITE_SEND_BUTTONS
        );
        void logWhatsAppOutbound({
          phone: replyTo,
          purpose: "ask_send_invite",
          ok: buttonsSent.ok,
          error: buttonsSent.ok ? undefined : buttonsSent.error,
          message: ask,
          actor: "whatsapp",
          messageId: buttonsSent.ok ? buttonsSent.idMessage : null,
          guestName: guest.full_name,
          rsvpId: guest.id,
        });
        if (!buttonsSent.ok) {
          await replyWhatsApp(
            replyTo,
            `${ask}\n\nהשיבו: כן\nאו: לא`,
            "ask_send_invite"
          );
        }

        return Response.json({
          ok: true,
          added: true,
          askSendInvite: true,
          guest: {
            id: guest.id,
            phone: guest.phone,
            full_name: guest.full_name,
          },
        });
      } catch (err) {
        const code = err instanceof Error ? err.message : "UNKNOWN";
        await replyWhatsApp(
          replyTo,
          buildOrganizerAddGuestFailure(conflictMessage(code)),
          "add_guest_failed"
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
    await sendOrganizerMenuMessage(replyTo, {
      body: menu.message,
      textFallback: menu.textFallback,
      buttons: menu.buttons,
      footer: menu.footer,
      list: menu.list,
    });
    if (menu.followUpMessages?.length) {
      for (const part of menu.followUpMessages) {
        await sendWhatsAppText(replyTo, part);
      }
    }
    return Response.json({
      ok: true,
      menu: true,
      exited: Boolean(menu.exited),
      buttons: Boolean(menu.buttons?.length),
      list: Boolean(menu.list),
      followUps: menu.followUpMessages?.length ?? 0,
    });
  }

  // 4) Almost-add template with bad values.
  if (!fromButton && looksLikeAddGuestTemplate(text)) {
    await replyWhatsApp(
      replyTo,
      buildOrganizerAddGuestFailure(
        "התבנית לא תקינה. שלחו שם בשורה הראשונה ומספר נייד בשורה השנייה."
      ),
      "add_guest_bad_template"
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
    joke: "בדיחה",
    guestRsvp: "מגיע/ה | לא מגיע/ה | עדיין לא יודע/ת",
  });
}
