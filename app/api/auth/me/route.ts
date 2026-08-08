import {
  clearGuestSessionCookie,
  parseGuestCookie,
} from "@/lib/guest-session";
import { getRsvpByPhone } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const phone = parseGuestCookie(request.headers.get("cookie"));
  if (!phone) {
    return Response.json({ guest: null });
  }

  try {
    const guest = await getRsvpByPhone(phone);
    if (!guest) {
      return Response.json(
        { guest: null },
        { headers: { "Set-Cookie": clearGuestSessionCookie() } }
      );
    }
    return Response.json({
      guest: {
        full_name: guest.full_name,
        phone: guest.phone,
        guest_count: guest.guest_count,
        status: guest.status,
        notes: guest.notes,
        already_final: Boolean(guest.final_confirmed_at),
      },
    });
  } catch (err) {
    console.error("auth/me failed", err);
    return Response.json({ error: "שגיאה" }, { status: 500 });
  }
}

export async function DELETE() {
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": clearGuestSessionCookie() } }
  );
}
