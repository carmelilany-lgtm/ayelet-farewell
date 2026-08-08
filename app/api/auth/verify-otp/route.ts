import { z } from "zod";
import {
  createGuestSessionToken,
  guestSessionCookie,
} from "@/lib/guest-session";
import { normalizePhone } from "@/lib/phone";
import { verifyOtp } from "@/lib/otp";
import { getRsvpByPhone } from "@/lib/store";

export const runtime = "nodejs";

const bodySchema = z.object({
  phone: z.string().trim().min(9).max(20),
  code: z.string().trim().min(4).max(8),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "נא להזין טלפון וקוד" }, { status: 400 });
  }

  const phone = normalizePhone(parsed.data.phone);
  if (!phone) {
    return Response.json({ error: "מספר טלפון לא תקין" }, { status: 400 });
  }

  try {
    const result = await verifyOtp(phone, parsed.data.code);
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 401 });
    }

    const guest = await getRsvpByPhone(phone);
    if (!guest) {
      return Response.json({ error: "אורח לא נמצא" }, { status: 404 });
    }

    const token = createGuestSessionToken(phone);
    return Response.json(
      {
        ok: true,
        guest: {
          full_name: guest.full_name,
          phone: guest.phone,
          guest_count: guest.guest_count,
          status: guest.status,
          notes: guest.notes,
          wants_video_blessing: guest.wants_video_blessing,
          wants_to_speak: guest.wants_to_speak,
          excitement: guest.excitement,
          already_final: Boolean(guest.final_confirmed_at),
        },
      },
      { headers: { "Set-Cookie": guestSessionCookie(token) } }
    );
  } catch (err) {
    console.error("verify-otp failed", err);
    return Response.json({ error: "שגיאה באימות" }, { status: 500 });
  }
}
