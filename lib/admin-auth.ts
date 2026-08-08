import { timingSafeEqual } from "crypto";

const COOKIE_NAME = "ayelet_admin";

function expectedPassword(): string {
  return process.env.ADMIN_PASSWORD?.trim() || "ayelet2026";
}

function expectedToken(): string {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim() || expectedPassword();
  return Buffer.from(`admin:${secret}`).toString("base64url");
}

export function verifyAdminPassword(password: string): boolean {
  const expected = expectedPassword();
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function createAdminSessionToken(): string {
  return expectedToken();
}

export function isValidAdminToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const expected = expectedToken();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function getAdminCookieName(): string {
  return COOKIE_NAME;
}

export function parseBearerOrCookie(
  authorization: string | null,
  cookieHeader: string | null
): string | null {
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const part of parts) {
    if (part.startsWith(`${COOKIE_NAME}=`)) {
      return decodeURIComponent(part.slice(COOKIE_NAME.length + 1));
    }
  }
  return null;
}
