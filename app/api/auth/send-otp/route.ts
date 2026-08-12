import { z } from "zod";
import { hasGreenApiConfig, sendWhatsAppOtpWithRetry } from "@/lib/green-api";
import { normalizePhone, phoneValidationError } from "@/lib/phone";
import { generateOtpCode, getOtpAgeMs, saveOtp } from "@/lib/otp";
import { buildOtpMessage } from "@/lib/reminder-message";
import { getRsvpByPhone } from "@/lib/store";

export const runtime = "nodejs";

const bodySchema = z.object({
  phone: z.string().trim().min(1).max(20),
});

/** Don't send another WhatsApp to the same number within this window. */
const RESEND_COOLDOWN_MS = 90_000;

const rateMap = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string, max = 5): boolean {
  const now = Date.now();
  const entry = rateMap.get(key);
  if (!entry || entry.resetAt < now) {
    rateMap.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count += 1;
  return true;
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "נא להזין מספר טלפון" }, { status: 400 });
  }

  const validationError = phoneValidationError(parsed.data.phone);
  if (validationError) {
    return Response.json({ error: validationError }, { status: 400 });
  }

  const phone = normalizePhone(parsed.data.phone);
  if (!phone) {
    return Response.json(
      {
        error:
          "מספר טלפון לא תקין. השתמשו במספר נייד ישראלי, למשל 05X-XXXXXXX",
      },
      { status: 400 }
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`otp:${phone}`) || !rateLimit(`otp-ip:${ip}`, 20)) {
    return Response.json(
      { error: "יותר מדי ניסיונות. נסו שוב בעוד דקה." },
      { status: 429 }
    );
  }

  if (!hasGreenApiConfig()) {
    return Response.json(
      { error: "שליחת WhatsApp לא מוגדרת כרגע. נסו שוב מאוחר יותר." },
      { status: 503 }
    );
  }

  try {
    const guest = await getRsvpByPhone(phone);
    const isNew = !guest;

    const ageMs = await getOtpAgeMs(phone);
    if (ageMs !== null && ageMs < RESEND_COOLDOWN_MS) {
      const waitSec = Math.ceil((RESEND_COOLDOWN_MS - ageMs) / 1000);
      return Response.json({
        ok: true,
        reused: true,
        is_new: isNew,
        full_name: guest?.full_name ?? null,
        message: `הקוד כבר נשלח. אפשר לבקש קוד חדש בעוד ${waitSec} שניות.`,
        retry_after: waitSec,
      });
    }

    const code = generateOtpCode();
    await saveOtp(phone, code);
    const body = await buildOtpMessage(code);
    const sent = await sendWhatsAppOtpWithRetry(phone, body);
    if (!sent.ok) {
      return Response.json({ error: sent.error }, { status: 502 });
    }

    return Response.json({
      ok: true,
      reused: false,
      is_new: isNew,
      full_name: guest?.full_name ?? null,
      message: "קוד אימות נשלח אליכם ב־WhatsApp",
    });
  } catch (err) {
    console.error("send-otp failed", err);
    return Response.json({ error: "שגיאה בשליחת הקוד" }, { status: 500 });
  }
}
