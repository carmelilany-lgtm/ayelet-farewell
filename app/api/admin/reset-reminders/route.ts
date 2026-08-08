import { z } from "zod";
import {
  isValidAdminToken,
  parseBearerOrCookie,
} from "@/lib/admin-auth";
import { clearReminderSent } from "@/lib/store";

export const runtime = "nodejs";

function unauthorized() {
  return Response.json({ error: "לא מורשה" }, { status: 401 });
}

function isAuthed(request: Request): boolean {
  return isValidAdminToken(
    parseBearerOrCookie(
      request.headers.get("authorization"),
      request.headers.get("cookie")
    )
  );
}

const bodySchema = z.object({
  id: z.string().min(1).optional(),
  all: z.boolean().optional(),
});

export async function POST(request: Request) {
  if (!isAuthed(request)) return unauthorized();

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success || (!parsed.data.id && !parsed.data.all)) {
    return Response.json(
      { error: "נא לציין id או all" },
      { status: 400 }
    );
  }

  try {
    const result = await clearReminderSent(
      parsed.data.all ? undefined : parsed.data.id
    );
    return Response.json({
      ok: true,
      cleared: result.cleared,
      message:
        result.cleared === 0
          ? "אין תזכורות לאיפוס"
          : parsed.data.all
            ? `אופסו ${result.cleared} תזכורות`
            : "סטטוס התזכורת אופס",
    });
  } catch (err) {
    console.error("reset reminders failed", err);
    return Response.json({ error: "שגיאה באיפוס" }, { status: 500 });
  }
}
