import {
  isValidAdminToken,
  parseBearerOrCookie,
} from "@/lib/admin-auth";
import { getSiteContent, saveSiteContent } from "@/lib/site-content";
import { DEFAULT_SITE_CONTENT, type SiteContent } from "@/lib/site-content-defaults";

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
  const content = await getSiteContent();
  return Response.json({ content });
}

export async function PUT(request: Request) {
  if (!isAuthed(request)) return unauthorized();

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const body =
    typeof json === "object" && json && "content" in json
      ? (json as { content: Partial<SiteContent> }).content
      : (json as Partial<SiteContent>);

  if (!body || typeof body !== "object") {
    return Response.json({ error: "תוכן חסר" }, { status: 400 });
  }

  const next: Partial<SiteContent> = {};
  for (const key of Object.keys(DEFAULT_SITE_CONTENT) as (keyof SiteContent)[]) {
    if (key in body) {
      // @ts-expect-error dynamic assign
      next[key] = body[key];
    }
  }

  if (Array.isArray(body.programItems)) {
    next.programItems = body.programItems as SiteContent["programItems"];
  }

  const content = await saveSiteContent(next);
  return Response.json({ ok: true, content });
}
