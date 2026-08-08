import { z } from "zod";
import { getInviteByToken, updateRsvpByToken } from "@/lib/store";

export const runtime = "nodejs";

const bodySchema = z.object({
  token: z.string().trim().min(16).max(64),
  guest_count: z.coerce.number().int().min(1).max(10),
  status: z.enum(["confirmed", "declined", "maybe"]),
  notes: z.string().trim().max(1000).optional().nullable(),
});

const rateMap = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const max = 20;
  const entry = rateMap.get(ip);
  if (!entry || entry.resetAt < now) {
    rateMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count += 1;
  return true;
}

/** Load invite by personal token — never looks up by phone. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim() || "";
  if (!token) {
    return Response.json({ error: "חסר קישור" }, { status: 400 });
  }

  try {
    const invite = await getInviteByToken(token);
    if (!invite) {
      // Same response shape for unknown tokens — no enumeration by phone
      return Response.json({ error: "הקישור לא תקין או שפג תוקפו" }, { status: 404 });
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
    request.headers.get("x-real-ip") ||
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
      { error: "נא למלא את כל השדות כנדרש", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const guestCount =
    parsed.data.status === "declined" ? 0 : parsed.data.guest_count;

  try {
    const invite = await updateRsvpByToken(parsed.data.token, {
      guest_count:
        guestCount || (parsed.data.status === "declined" ? 0 : 1),
      status: parsed.data.status,
      notes: parsed.data.notes ?? null,
    });

    if (!invite) {
      return Response.json(
        { error: "הקישור לא תקין או שפג תוקפו" },
        { status: 404 }
      );
    }

    return Response.json({ ok: true, invite });
  } catch (err) {
    console.error("RSVP token update failed", err);
    return Response.json({ error: "שגיאה בשמירה. נסו שוב." }, { status: 500 });
  }
}
