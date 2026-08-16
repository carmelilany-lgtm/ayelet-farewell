import type { ReplyButton } from "./green-api";
import {
  notifyOrganizersWhatsApp,
  resolveWhatsAppChatId,
  sendWhatsAppReplyButtons,
  sendWhatsAppTextWithRetry,
} from "./green-api";
import { normalizePhone } from "./phone";
import {
  buildGuestThankYouWhatsApp,
  buildOrganizerConfirmMessage,
  thankYouKindForRsvpUpdate,
} from "./reminder-message";
import { getSiteContent } from "./site-content";
import { DEFAULT_SITE_CONTENT } from "./site-content-defaults";
import { getRsvpByPhone, updateRsvpByPhone } from "./store";
import { logWhatsAppOutbound } from "./system-log";
import { isUnchangedRsvp } from "./thank-you";
import type { Rsvp, RsvpStatus } from "./types";
import { rememberWaChatId, lookupPhoneByWaChatId } from "./wa-chat-index";
import {
  clearGuestRsvpSession,
  getGuestRsvpSession,
  setGuestRsvpSession,
} from "./wa-guest-rsvp-session";
import { phoneFromWhatsAppId } from "./whatsapp-add-guest";

const MAX_GUESTS = 3;

export const GUEST_RSVP_BUTTONS: ReplyButton[] = [
  { buttonId: "rsvp_yes", buttonText: "מגיע/ה" },
  { buttonId: "rsvp_no", buttonText: "לא מגיע/ה" },
  { buttonId: "rsvp_maybe", buttonText: "עדיין לא יודע/ת" },
];

export const GUEST_COUNT_BUTTONS: ReplyButton[] = [
  { buttonId: "rsvp_n1", buttonText: "1" },
  { buttonId: "rsvp_n2", buttonText: "2" },
  { buttonId: "rsvp_n3", buttonText: "3" },
];

async function guestRsvpPrompts(): Promise<{
  statusBody: string;
  countPrompt: string;
}> {
  const content = await getSiteContent();
  return {
    statusBody:
      content.waRsvpStatusPrompt?.trim() ||
      DEFAULT_SITE_CONTENT.waRsvpStatusPrompt,
    countPrompt:
      content.waRsvpCountPrompt?.trim() ||
      DEFAULT_SITE_CONTENT.waRsvpCountPrompt,
  };
}

export type GuestRsvpReply = {
  handled: true;
  message: string;
  buttons?: ReplyButton[];
  /** Body for the interactive buttons message when split from a link text. */
  buttonBody?: string;
};

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function parseStatusChoice(
  text: string,
  buttonId: string | null
): Exclude<RsvpStatus, "imported"> | null {
  const id = (buttonId || "").trim().toLowerCase();
  if (id === "rsvp_yes") return "confirmed";
  if (id === "rsvp_no") return "declined";
  if (id === "rsvp_maybe") return "maybe";

  const t = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return null;

  if (
    /^(לא מגיע\/ה|לא מגיע|לא מגיעה|לא)$/i.test(t) ||
    t === "rsvp_no"
  ) {
    return "declined";
  }
  if (
    /^(עדיין לא יודע\/ת|עדיין לא יודע|עדיין לא יודעת|עדיין לא|אולי)$/i.test(
      t
    ) ||
    t === "rsvp_maybe"
  ) {
    return "maybe";
  }
  if (/^(מגיע\/ה|מגיע|מגיעה|כן)$/i.test(t) || t === "rsvp_yes") {
    return "confirmed";
  }
  return null;
}

function parseGuestCount(
  text: string,
  buttonId: string | null
): number | null {
  const id = (buttonId || "").trim().toLowerCase();
  const fromId = id.match(/^rsvp_n(\d{1,2})$/);
  if (fromId) {
    const n = Number(fromId[1]);
    if (n >= 1 && n <= MAX_GUESTS) return n;
  }

  const t = text.trim();
  if (/^\d{1,2}$/.test(t)) {
    const n = Number(t);
    if (n >= 1 && n <= MAX_GUESTS) return n;
  }
  return null;
}

async function notifyOrganizer(rsvp: Rsvp) {
  const message = await buildOrganizerConfirmMessage({
    fullName: rsvp.full_name,
    phone: rsvp.phone,
    guestCount: rsvp.guest_count,
    status: rsvp.status,
    notes: rsvp.notes,
  });
  return notifyOrganizersWhatsApp(message);
}

async function buildThankYou(
  rsvp: Rsvp,
  previous: { status: Rsvp["status"]; guest_count: number } | null
): Promise<string> {
  const kind = thankYouKindForRsvpUpdate({
    previousStatus: previous?.status ?? null,
    previousGuestCount: previous?.guest_count ?? 0,
    nextStatus: rsvp.status as Exclude<RsvpStatus, "imported">,
    nextGuestCount: rsvp.guest_count,
  });
  return buildGuestThankYouWhatsApp({
    fullName: rsvp.full_name,
    kind,
    inviteToken: rsvp.invite_token,
  });
}

async function saveRsvp(opts: {
  phone: string;
  status: Exclude<RsvpStatus, "imported">;
  guestCount: number;
}): Promise<{
  rsvp: Rsvp;
  unchanged: boolean;
  thankYou: string;
} | null> {
  const before = await getRsvpByPhone(opts.phone);
  if (!before) return null;

  const guestCount =
    opts.status === "declined" ? 0 : Math.max(1, Math.min(MAX_GUESTS, opts.guestCount));

  if (
    isUnchangedRsvp({
      previousStatus: before.status,
      previousGuestCount: before.guest_count,
      nextStatus: opts.status,
      nextGuestCount: guestCount,
    })
  ) {
    return {
      rsvp: before,
      unchanged: true,
      thankYou: "כבר עדכנת את הסטטוס הזה. תודה!",
    };
  }

  const updated = await updateRsvpByPhone(opts.phone, {
    status: opts.status,
    guest_count: guestCount,
  });
  if (!updated) return null;

  // Await organizers first (same as /api/rsvp). Fire-and-forget is dropped
  // on Vercel when the webhook response returns.
  const organizerResult = await notifyOrganizer(updated);
  if (organizerResult.sent === 0) {
    console.error("Guest WA RSVP organizer notify failed", organizerResult.failed);
  }
  await sleep(500);

  const thankYou = await buildThankYou(updated, {
    status: before.status,
    guest_count: before.guest_count,
  });

  return { rsvp: updated, unchanged: false, thankYou };
}

async function countAskReply(): Promise<GuestRsvpReply> {
  const { countPrompt } = await guestRsvpPrompts();
  return {
    handled: true,
    message: countPrompt,
    buttons: GUEST_COUNT_BUTTONS,
  };
}

/**
 * Resolve a reminded guest phone from the webhook sender chat id.
 */
export async function resolveRemindedGuestPhone(
  senderChatId: string
): Promise<string | null> {
  const fromId = phoneFromWhatsAppId(senderChatId);
  if (fromId) {
    const rsvp = await getRsvpByPhone(fromId);
    if (rsvp?.reminder_sent_at) return normalizePhone(rsvp.phone) || rsvp.phone;
  }

  const mapped = await lookupPhoneByWaChatId(senderChatId);
  if (mapped) {
    const rsvp = await getRsvpByPhone(mapped);
    if (rsvp?.reminder_sent_at) return normalizePhone(rsvp.phone) || rsvp.phone;
  }

  return null;
}

/**
 * Handle guest RSVP replies after a reminder was sent.
 * Returns null if the message is unrelated (fall through).
 */
export async function handleGuestRsvp(opts: {
  phone: string;
  text: string;
  buttonId: string | null;
}): Promise<GuestRsvpReply | null> {
  const phone = normalizePhone(opts.phone) || opts.phone;
  const rsvp = await getRsvpByPhone(phone);
  if (!rsvp?.reminder_sent_at) return null;

  const pending = await getGuestRsvpSession(phone);
  const statusChoice = parseStatusChoice(opts.text, opts.buttonId);
  const countChoice = parseGuestCount(opts.text, opts.buttonId);
  const { countPrompt } = await guestRsvpPrompts();

  // Waiting for guest count (after "מגיע/ה").
  if (pending) {
    if (statusChoice === "declined") {
      await clearGuestRsvpSession(phone);
      const saved = await saveRsvp({
        phone,
        status: "declined",
        guestCount: 0,
      });
      if (!saved) {
        return { handled: true, message: "לא הצלחתי לשמור. נסו שוב." };
      }
      return { handled: true, message: saved.thankYou };
    }

    // "Maybe" should notify organizers immediately — no count step required.
    if (statusChoice === "maybe") {
      await clearGuestRsvpSession(phone);
      const saved = await saveRsvp({
        phone,
        status: "maybe",
        guestCount: Math.max(rsvp.guest_count || 1, 1),
      });
      if (!saved) {
        return { handled: true, message: "לא הצלחתי לשמור. נסו שוב." };
      }
      return { handled: true, message: saved.thankYou };
    }

    if (statusChoice === "confirmed") {
      await setGuestRsvpSession(phone, "confirmed");
      return countAskReply();
    }

    if (countChoice != null) {
      await clearGuestRsvpSession(phone);
      const saved = await saveRsvp({
        phone,
        status: pending.pendingStatus === "maybe" ? "maybe" : "confirmed",
        guestCount: countChoice,
      });
      if (!saved) {
        return { handled: true, message: "לא הצלחתי לשמור. נסו שוב." };
      }
      return { handled: true, message: saved.thankYou };
    }

    return {
      handled: true,
      message: `לא הבנתי את המספר.\n${countPrompt}`,
      buttons: GUEST_COUNT_BUTTONS,
    };
  }

  if (!statusChoice) return null;

  if (statusChoice === "declined") {
    const saved = await saveRsvp({
      phone,
      status: "declined",
      guestCount: 0,
    });
    if (!saved) {
      return { handled: true, message: "לא הצלחתי לשמור. נסו שוב." };
    }
    return { handled: true, message: saved.thankYou };
  }

  // Maybe: save + notify organizers right away (no guest-count prompt).
  if (statusChoice === "maybe") {
    const saved = await saveRsvp({
      phone,
      status: "maybe",
      guestCount: Math.max(rsvp.guest_count || 1, 1),
    });
    if (!saved) {
      return { handled: true, message: "לא הצלחתי לשמור. נסו שוב." };
    }
    return { handled: true, message: saved.thankYou };
  }

  await setGuestRsvpSession(phone, "confirmed");
  return countAskReply();
}

/** Send reminder text + RSVP buttons; index chat id for @lid replies. */
export async function sendReminderWithRsvpButtons(
  phone: string,
  message: string,
  meta?: {
    guestName?: string;
    rsvpId?: string;
  }
): Promise<{ ok: true; idMessage: string } | { ok: false; error: string }> {
  const chatId = await resolveWhatsAppChatId(phone);
  await rememberWaChatId(phone, chatId);
  const { statusBody } = await guestRsvpPrompts();

  const textFallback = `${message}

———
עדכון סטטוס: השיבו מגיע/ה · לא מגיע/ה · עדיין לא יודע/ת`;

  const textSent = await sendWhatsAppTextWithRetry(phone, message, 3, {
    purpose: "reminder",
    guestName: meta?.guestName,
    rsvpId: meta?.rsvpId,
    actor: "admin",
  });

  if (!textSent.ok) return textSent;

  await sleep(450);
  const buttonSent = await sendWhatsAppReplyButtons(
    phone,
    statusBody,
    GUEST_RSVP_BUTTONS,
    undefined,
    chatId
  );

  void logWhatsAppOutbound({
    phone,
    purpose: "reminder_buttons",
    ok: buttonSent.ok,
    error: buttonSent.ok ? undefined : buttonSent.error,
    message: statusBody,
    actor: "admin",
    messageId: buttonSent.ok ? buttonSent.idMessage : null,
    guestName: meta?.guestName,
    rsvpId: meta?.rsvpId,
  });

  if (!buttonSent.ok) {
    // Buttons failed — send plain-text instructions so RSVP still works.
    await sleep(400);
    await sendWhatsAppTextWithRetry(phone, textFallback, 2, {
      purpose: "reminder_fallback",
      guestName: meta?.guestName,
      rsvpId: meta?.rsvpId,
      actor: "admin",
    });
  }

  return textSent;
}

export async function sendGuestRsvpReply(
  phone: string,
  reply: GuestRsvpReply
): Promise<void> {
  if (reply.buttons?.length) {
    const chatId = await resolveWhatsAppChatId(phone);
    await rememberWaChatId(phone, chatId);
    const body = reply.buttonBody || reply.message;
    const sent = await sendWhatsAppReplyButtons(
      phone,
      body,
      reply.buttons,
      undefined,
      chatId
    );
    void logWhatsAppOutbound({
      phone,
      purpose: "guest_rsvp_prompt",
      ok: sent.ok,
      error: sent.ok ? undefined : sent.error,
      message: reply.message,
      actor: "whatsapp",
      messageId: sent.ok ? sent.idMessage : null,
    });
    if (!sent.ok) {
      await sendWhatsAppTextWithRetry(
        phone,
        `${reply.message}\n\nבחרו 1, 2 או 3.`,
        2,
        {
          purpose: "guest_rsvp_prompt",
          actor: "whatsapp",
        }
      );
    }
    return;
  }

  await sendWhatsAppTextWithRetry(phone, reply.message, 2, {
    purpose: "guest_rsvp_thanks",
    actor: "whatsapp",
  });
}
