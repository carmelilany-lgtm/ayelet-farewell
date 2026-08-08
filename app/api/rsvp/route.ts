import { z } from "zod";
import { parseGuestCookie } from "@/lib/guest-session";
import { notifyOrganizersWhatsApp, sendWhatsAppTextWithRetry } from "@/lib/green-api";
import {
  buildGuestThankYouWhatsApp,
  buildOrganizerConfirmMessage,
  thankYouKindForRsvpUpdate,
} from "@/lib/reminder-message";
import {
  getInviteByToken,
  getRsvpByPhone,
  getRsvpByToken,
  updateRsvpByPhone,
  updateRsvpByToken,
  upsertRsvpByPhone,
} from "@/lib/store";
import { isUnchangedRsvp } from "@/lib/thank-you";
import type { Rsvp } from "@/lib/types";

export const runtime = "nodejs";

const bodySchema = z.object({
  token: z.string().trim().min(6).max(64).optional(),
  full_name: z.string().trim().min(2).max(80).optional(),
  guest_count: z.coerce.number().int().min(1).max(10),
  status: z.enum(["confirmed", "declined", "maybe"]),
  notes: z.string().trim().max(1000).optional().nullable(),
  wants_video_blessing: z.string().trim().max(80).optional().nullable(),
  wants_to_speak: z.string().trim().max(40).optional().nullable(),
  excitement: z.coerce.number().int().min(1).max(5).optional().nullable(),
});

const rateMap = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || entry.resetAt < now) {
    rateMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 20) return false;
  entry.count += 1;
  return true;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function notifyOrganizer(rsvp: Rsvp) {
  const message = await buildOrganizerConfirmMessage({
    fullName: rsvp.full_name,
    phone: rsvp.phone,
    guestCount: rsvp.guest_count,
    status: rsvp.status,
    notes: rsvp.notes,
  });
  const result = await notifyOrganizersWhatsApp(message);
  if (result.sent === 0) {
    console.error("Organizer notify: no messages sent", result.failed);
  }
  return result;
}

async function notifyGuestThankYou(
  rsvp: Rsvp,
  previous: { status: Rsvp["status"]; guest_count: number } | null
) {
  if (rsvp.status === "imported") return { ok: true as const, skipped: true };

  const kind = thankYouKindForRsvpUpdate({
    previousStatus: previous?.status ?? null,
    previousGuestCount: previous?.guest_count ?? 0,
    nextStatus: rsvp.status,
    nextGuestCount: rsvp.guest_count,
  });

  const message = await buildGuestThankYouWhatsApp({
    fullName: rsvp.full_name,
    kind,
    inviteToken: rsvp.invite_token,
  });

  const result = await sendWhatsAppTextWithRetry(rsvp.phone, message, 3);
  if (!result.ok) {
    console.error("Guest thank-you WhatsApp failed", result.error);
  }
  return result;
}

function publicInvite(full: Rsvp) {
  return {
    full_name: full.full_name,
    guest_count: full.guest_count,
    status: full.status,
    notes: full.notes,
    already_final: true,
  };
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim() || "";
  if (!token) {
    return Response.json({ error: "חסר קישור" }, { status: 400 });
  }
  try {
    const invite = await getInviteByToken(token);
    if (!invite) {
      return Response.json(
        { error: "הקישור לא תקין או שפג תוקפו" },
        { status: 404 }
      );
    }
    return Response.json({ invite });
  } catch (err) {
    console.error("Invite lookup failed", err);
    return Response.json({ error: "שגיאה בטעינה" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  if (!rateLimit(ip)) {
    return Response.json(
      { error: "יותר מדי ניסיונות. נסו שוב בעוד דקה." },
      { status: 429 }
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "נא למלא את כל השדות כנדרש" },
      { status: 400 }
    );
  }

  const guestCount =
    parsed.data.status === "declined" ? 0 : parsed.data.guest_count;
  const count =
    guestCount || (parsed.data.status === "declined" ? 0 : 1);
  const sessionPhone = parseGuestCookie(request.headers.get("cookie"));

  try {
    let full: Rsvp | null = null;
    let previous: { status: Rsvp["status"]; guest_count: number } | null =
      null;

    if (parsed.data.token) {
      const before = await getRsvpByToken(parsed.data.token);
      if (before) {
        previous = {
          status: before.status,
          guest_count: before.guest_count,
        };
      }

      if (
        before &&
        isUnchangedRsvp({
          previousStatus: before.status,
          previousGuestCount: before.guest_count,
          nextStatus: parsed.data.status,
          nextGuestCount: count,
        })
      ) {
        return Response.json({
          ok: true,
          unchanged: true,
          invite: publicInvite(before),
          invite_token: before.invite_token,
        });
      }

      const invite = await updateRsvpByToken(parsed.data.token, {
        guest_count: count,
        status: parsed.data.status,
        notes: parsed.data.notes ?? null,
        wants_video_blessing: parsed.data.wants_video_blessing ?? null,
        wants_to_speak: parsed.data.wants_to_speak ?? null,
        excitement: parsed.data.excitement ?? null,
      });
      if (!invite) {
        return Response.json(
          { error: "הקישור לא תקין או שפג תוקפו" },
          { status: 404 }
        );
      }
      full = await getRsvpByToken(parsed.data.token);
    } else if (sessionPhone) {
      const before = await getRsvpByPhone(sessionPhone);
      if (before) {
        previous = {
          status: before.status,
          guest_count: before.guest_count,
        };
      }

      if (
        before &&
        !parsed.data.full_name &&
        isUnchangedRsvp({
          previousStatus: before.status,
          previousGuestCount: before.guest_count,
          nextStatus: parsed.data.status,
          nextGuestCount: count,
        })
      ) {
        return Response.json({
          ok: true,
          unchanged: true,
          invite: publicInvite(before),
          invite_token: before.invite_token,
        });
      }

      const existing = await updateRsvpByPhone(sessionPhone, {
        guest_count: count,
        status: parsed.data.status,
        notes: parsed.data.notes ?? null,
        wants_video_blessing: parsed.data.wants_video_blessing ?? null,
        wants_to_speak: parsed.data.wants_to_speak ?? null,
        excitement: parsed.data.excitement ?? null,
      });

      if (existing) {
        full = existing;
      } else {
        const name = parsed.data.full_name?.trim() || "";
        if (name.length < 2) {
          return Response.json(
            { error: "נא להזין שם מלא" },
            { status: 400 }
          );
        }
        full = await upsertRsvpByPhone({
          phone: sessionPhone,
          full_name: name,
          guest_count: count,
          status: parsed.data.status,
          notes: parsed.data.notes ?? null,
        });
      }
    } else {
      return Response.json(
        { error: "יש להתחבר עם מספר טלפון או להשתמש בקישור האישי" },
        { status: 401 }
      );
    }

    if (full) {
      // Sequential + gap: organizers first, then guest — Green API often drops
      // a second send if it fires too quickly after the first.
      const organizerResult = await notifyOrganizer(full);
      await sleep(900);
      const guestResult = await notifyGuestThankYou(full, previous);
      if (organizerResult.sent === 0) {
        console.error("RSVP organizer WhatsApp failed", organizerResult.failed);
      }
      if (
        guestResult &&
        "ok" in guestResult &&
        guestResult.ok === false &&
        !("skipped" in guestResult && guestResult.skipped)
      ) {
        console.error("RSVP guest WhatsApp failed", guestResult);
      }
    }

    return Response.json({
      ok: true,
      unchanged: false,
      invite: full ? publicInvite(full) : null,
      invite_token: full?.invite_token ?? null,
    });
  } catch (err) {
    console.error("RSVP update failed", err);
    return Response.json({ error: "שגיאה בשמירה. נסו שוב." }, { status: 500 });
  }
}
