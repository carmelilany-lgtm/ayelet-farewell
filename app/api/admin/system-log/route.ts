import {
  isValidAdminToken,
  parseBearerOrCookie,
} from "@/lib/admin-auth";
import { listSystemEvents } from "@/lib/system-log";

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

export async function GET(request: Request) {
  if (!isAuthed(request)) return unauthorized();

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || "200");

  try {
    const events = await listSystemEvents(limit);
    return Response.json({ events });
  } catch (err) {
    console.error("system log list failed", err);
    return Response.json({ error: "שגיאה בטעינת היומן" }, { status: 500 });
  }
}
