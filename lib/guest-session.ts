import { createHmac, timingSafeEqual } from "crypto";

const COOKIE = "ayelet_guest";
const TTL_MS = 14 * 24 * 60 * 60 * 1000;

function secret(): string {
  return (
    process.env.GUEST_SESSION_SECRET?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    process.env.ADMIN_PASSWORD?.trim() ||
    "ayelet-guest-dev"
  );
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function getGuestCookieName(): string {
  return COOKIE;
}

export function createGuestSessionToken(phone: string): string {
  const exp = String(Date.now() + TTL_MS);
  const body = `${phone}.${exp}`;
  return `${body}.${sign(body)}`;
}

export function readGuestPhone(token: string | null | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [phone, exp, sig] = parts;
  const body = `${phone}.${exp}`;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;
  if (!/^05\d{8}$/.test(phone)) return null;
  return phone;
}

export function parseGuestCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const part of parts) {
    if (part.startsWith(`${COOKIE}=`)) {
      return readGuestPhone(decodeURIComponent(part.slice(COOKIE.length + 1)));
    }
  }
  return null;
}

export function guestSessionCookie(token: string): string {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(TTL_MS / 1000)}`;
}

export function clearGuestSessionCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
