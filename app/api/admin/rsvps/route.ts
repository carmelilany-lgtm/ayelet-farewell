import { z } from "zod";
import {
  createAdminSessionToken,
  getAdminCookieName,
  isValidAdminToken,
  parseBearerOrCookie,
  verifyAdminPassword,
} from "@/lib/admin-auth";
import { inviteAbsoluteUrl } from "@/lib/invite-token";
import { formatPhoneDisplay, phoneValidationError } from "@/lib/phone";
import {
  createImportedGuest,
  findGuestAddConflict,
  getSummary,
  listRsvps,
  updateRsvpById,
} from "@/lib/store";

export const runtime = "nodejs";

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

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const password =
    typeof json === "object" &&
    json &&
    "password" in json &&
    typeof (json as { password: unknown }).password === "string"
      ? (json as { password: string }).password
      : "";

  if (!verifyAdminPassword(password)) {
    return unauthorized();
  }

  const token = createAdminSessionToken();
  const cookie = `${getAdminCookieName()}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 14}`;

  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": cookie,
      },
    }
  );
}

export async function GET(request: Request) {
  if (!isAuthed(request)) return unauthorized();

  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  const origin = url.origin;

  try {
    const [rsvps, summary] = await Promise.all([listRsvps(), getSummary()]);

    if (format === "csv") {
      const header = [
        "full_name",
        "phone",
        "guest_count",
        "status",
        "invite_url",
        "final_confirmed_at",
        "wants_video_blessing",
        "wants_to_speak",
        "excitement",
        "notes",
        "imported_at",
        "updated_at",
      ];
      const escape = (v: unknown) => {
        const s = v === null || v === undefined ? "" : String(v);
        if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const lines = [
        header.join(","),
        ...rsvps.map((r) =>
          [
            r.full_name,
            r.phone,
            r.guest_count,
            r.status,
            inviteAbsoluteUrl(r.invite_token, origin),
            r.final_confirmed_at,
            r.wants_video_blessing,
            r.wants_to_speak,
            r.excitement,
            r.notes,
            r.imported_at,
            r.updated_at,
          ]
            .map(escape)
            .join(",")
        ),
      ];
      return new Response("\uFEFF" + lines.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="ayelet-rsvps.csv"',
        },
      });
    }

    return Response.json({ summary, rsvps });
  } catch (err) {
    console.error("Admin list failed", err);
    return Response.json({ error: "שגיאה בטעינה" }, { status: 500 });
  }
}

const createSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(9).max(20),
});

/** Manually add a guest (name + phone) who has not registered yet. */
export async function PUT(request: Request) {
  if (!isAuthed(request)) return unauthorized();

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "נא להזין שם ומספר טלפון תקינים" }, { status: 400 });
  }

  const phoneError = phoneValidationError(parsed.data.phone);
  if (phoneError) {
    return Response.json({ error: phoneError }, { status: 400 });
  }

  try {
    const conflict = await findGuestAddConflict({
      full_name: parsed.data.full_name,
      phone: parsed.data.phone,
    });
    if (conflict) {
      const who = conflict.existing.full_name;
      const phoneLabel = formatPhoneDisplay(conflict.existing.phone);
      const errors: Record<typeof conflict.code, string> = {
        ALREADY_CONFIRMED: `${who} כבר אישר/ה הגעה (${phoneLabel}) — לא ניתן להוסיף לטרם נרשמו`,
        ALREADY_DECLINED: `${who} כבר עודכן/ה כלא מגיע/ה (${phoneLabel})`,
        PHONE_EXISTS: `מספר הטלפון כבר קיים אצל ${who}`,
        NAME_ALREADY_CONFIRMED: `כבר יש אורח/ת מאושר/ת באותו שם: ${who} (${phoneLabel})`,
      };
      return Response.json({ error: errors[conflict.code] }, { status: 409 });
    }

    const rsvp = await createImportedGuest({
      full_name: parsed.data.full_name,
      phone: parsed.data.phone,
    });
    const summary = await getSummary();
    return Response.json({ ok: true, rsvp, summary }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (
      message === "PHONE_EXISTS" ||
      message === "ALREADY_CONFIRMED" ||
      message === "ALREADY_DECLINED" ||
      message === "NAME_ALREADY_CONFIRMED"
    ) {
      return Response.json(
        { error: "האורח כבר קיים ברשימה — בדקו את רשימת האורחים" },
        { status: 409 }
      );
    }
    if (message === "INVALID_PHONE" || message === "INVALID_NAME") {
      return Response.json({ error: "נתונים לא תקינים" }, { status: 400 });
    }
    console.error("Admin guest create failed", err);
    return Response.json({ error: "שגיאה בהוספת אורח" }, { status: 500 });
  }
}

const patchSchema = z.object({
  id: z.string().min(8),
  status: z.enum(["imported", "confirmed", "declined", "maybe"]),
  guest_count: z.coerce.number().int().min(0).max(10),
});

export async function PATCH(request: Request) {
  if (!isAuthed(request)) return unauthorized();

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "נתונים לא תקינים" }, { status: 400 });
  }

  try {
    const updated = await updateRsvpById(parsed.data.id, {
      status: parsed.data.status,
      guest_count: parsed.data.guest_count,
    });
    if (!updated) {
      return Response.json({ error: "אורח לא נמצא" }, { status: 404 });
    }
    const summary = await getSummary();
    return Response.json({ ok: true, rsvp: updated, summary });
  } catch (err) {
    console.error("Admin RSVP update failed", err);
    return Response.json({ error: "שגיאה בעדכון" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!isAuthed(request)) return unauthorized();
  const cookie = `${getAdminCookieName()}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
}
