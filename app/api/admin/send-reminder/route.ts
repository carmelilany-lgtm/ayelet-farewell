import { z } from "zod";
import {
  isValidAdminToken,
  parseBearerOrCookie,
} from "@/lib/admin-auth";
import { hasGreenApiConfig } from "@/lib/green-api";
import { buildReminderMessage } from "@/lib/reminder-message";
import {
  getRsvpById,
  listRsvps,
  markReminderSent,
} from "@/lib/store";
import { isManualPendingGuest, type Rsvp } from "@/lib/types";
import { sendReminderWithRsvpButtons } from "@/lib/wa-guest-rsvp";

export const runtime = "nodejs";
/** Bulk sends pace several seconds between guests — allow long runs. */
export const maxDuration = 300;

/** Pause between guests on bulk send (WhatsApp / Green API anti-ban pacing). */
const BULK_SEND_GAP_MS = 4_000;

function unauthorized() {
  return Response.json({ error: "לא מורשה" }, { status: 401 });
}

function isAuthed(request: Request): boolean {
  const token = parseBearerOrCookie(
    request.headers.get("authorization"),
    request.headers.get("cookie")
  );
  return isValidAdminToken(token);
}

const bodySchema = z.object({
  id: z.string().min(1).optional(),
  /** Send to everyone who hasn't received a reminder yet (not declined). */
  pendingOnly: z.boolean().optional(),
  /** Send only to admin-added guests still waiting for first RSVP. */
  manualPendingOnly: z.boolean().optional(),
  /** Allow re-send even if already sent */
  force: z.boolean().optional(),
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendOne(
  rsvp: Rsvp,
  origin: string,
  force: boolean
): Promise<{ id: string; full_name: string; ok: boolean; error?: string }> {
  if (rsvp.status === "declined") {
    return {
      id: rsvp.id,
      full_name: rsvp.full_name,
      ok: false,
      error: "דולג - סומן כלא מגיע",
    };
  }

  if (rsvp.reminder_sent_at && !force) {
    return {
      id: rsvp.id,
      full_name: rsvp.full_name,
      ok: false,
      error: "כבר נשלחה תזכורת",
    };
  }

  const message = await buildReminderMessage({
    fullName: rsvp.full_name,
    inviteToken: rsvp.invite_token,
    origin,
    manualPending: isManualPendingGuest(rsvp),
  });

  const result = await sendReminderWithRsvpButtons(rsvp.phone, message, {
    guestName: rsvp.full_name,
    rsvpId: rsvp.id,
  });
  if (!result.ok) {
    return {
      id: rsvp.id,
      full_name: rsvp.full_name,
      ok: false,
      error: result.error,
    };
  }

  await markReminderSent(rsvp.id, result.idMessage);
  return { id: rsvp.id, full_name: rsvp.full_name, ok: true };
}

export async function POST(request: Request) {
  // Manual admin action only - no cron / auto-send.
  if (!isAuthed(request)) return unauthorized();

  if (!hasGreenApiConfig()) {
    return Response.json(
      {
        error:
          "Green API לא מוגדר. הוסיפו GREEN_API_ID_INSTANCE ו־GREEN_API_TOKEN_INSTANCE ל־.env.local",
      },
      { status: 400 }
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (
    !parsed.success ||
    (!parsed.data.id &&
      !parsed.data.pendingOnly &&
      !parsed.data.manualPendingOnly)
  ) {
    return Response.json(
      { error: "נא לציין id, pendingOnly או manualPendingOnly" },
      { status: 400 }
    );
  }

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin;
  const force = Boolean(parsed.data.force);

  try {
    if (parsed.data.id) {
      const rsvp = await getRsvpById(parsed.data.id);
      if (!rsvp) {
        return Response.json({ error: "אורח לא נמצא" }, { status: 404 });
      }
      const result = await sendOne(rsvp, origin, force);
      return Response.json({
        sent: result.ok ? 1 : 0,
        failed: result.ok ? 0 : 1,
        results: [result],
      });
    }

    const all = await listRsvps();
    const targets = all.filter((r) => {
      if (r.status === "declined") return false;
      if (parsed.data.manualPendingOnly && !isManualPendingGuest(r)) {
        return false;
      }
      if (
        (parsed.data.pendingOnly || parsed.data.manualPendingOnly) &&
        r.reminder_sent_at &&
        !force
      ) {
        return false;
      }
      return true;
    });

    const results: Awaited<ReturnType<typeof sendOne>>[] = [];
    for (let i = 0; i < targets.length; i++) {
      results.push(await sendOne(targets[i], origin, force));
      // Wait between guests so WhatsApp does not flag rapid bulk sends.
      if (i < targets.length - 1) {
        await sleep(BULK_SEND_GAP_MS);
      }
    }

    return Response.json({
      sent: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (err) {
    console.error("Send reminder failed", err);
    return Response.json({ error: "שגיאה בשליחה" }, { status: 500 });
  }
}
