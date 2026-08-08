import {
  createAdminSessionToken,
  getAdminCookieName,
  isValidAdminToken,
  parseBearerOrCookie,
  verifyAdminPassword,
} from "@/lib/admin-auth";
import { inviteAbsoluteUrl } from "@/lib/invite-token";
import { getSummary, listRsvps } from "@/lib/store";

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

export async function DELETE(request: Request) {
  if (!isAuthed(request)) return unauthorized();
  const cookie = `${getAdminCookieName()}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
}
