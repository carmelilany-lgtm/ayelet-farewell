import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { getSupabaseAdmin, hasSupabaseConfig } from "./supabase";

const DATA_DIR = path.join(process.cwd(), "data");
const OTP_FILE = path.join(DATA_DIR, "otp-codes.json");
const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type OtpRow = {
  phone: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
  created_at: string;
};

function secret(): string {
  return (
    process.env.OTP_SECRET?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    process.env.ADMIN_PASSWORD?.trim() ||
    "ayelet-otp-dev"
  );
}

function hashCode(phone: string, code: string): string {
  return createHmac("sha256", secret()).update(`${phone}:${code}`).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

async function readLocal(): Promise<OtpRow[]> {
  try {
    const raw = await fs.readFile(OTP_FILE, "utf8");
    return JSON.parse(raw) as OtpRow[];
  } catch {
    return [];
  }
}

async function writeLocal(rows: OtpRow[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(OTP_FILE, JSON.stringify(rows, null, 2) + "\n", "utf8");
}

export function generateOtpCode(): string {
  return String(randomInt(100000, 999999));
}

export async function saveOtp(phone: string, code: string): Promise<void> {
  const now = new Date().toISOString();
  const row: OtpRow = {
    phone,
    code_hash: hashCode(phone, code),
    expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    attempts: 0,
    created_at: now,
  };

  if (hasSupabaseConfig()) {
    const { error } = await getSupabaseAdmin().from("otp_codes").upsert({
      phone: row.phone,
      code_hash: row.code_hash,
      expires_at: row.expires_at,
      attempts: 0,
      created_at: row.created_at,
    });
    if (error) throw error;
    return;
  }

  const all = (await readLocal()).filter((r) => r.phone !== phone);
  all.push(row);
  await writeLocal(all);
}

/** Returns ms since last OTP was created for this phone, or null if none. */
export async function getOtpAgeMs(phone: string): Promise<number | null> {
  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabaseAdmin()
      .from("otp_codes")
      .select("created_at, expires_at")
      .eq("phone", phone)
      .maybeSingle();
    if (error) throw error;
    if (!data?.created_at) return null;
    if (new Date(data.expires_at).getTime() < Date.now()) return null;
    return Date.now() - new Date(data.created_at).getTime();
  }

  const all = await readLocal();
  const row = all.find((r) => r.phone === phone);
  if (!row?.created_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return Date.now() - new Date(row.created_at).getTime();
}

export async function verifyOtp(
  phone: string,
  code: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabaseAdmin()
      .from("otp_codes")
      .select("*")
      .eq("phone", phone)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { ok: false, error: "לא נמצא קוד. בקשו קוד חדש." };
    if (new Date(data.expires_at).getTime() < Date.now()) {
      return { ok: false, error: "הקוד פג תוקף. בקשו קוד חדש." };
    }
    if (data.attempts >= MAX_ATTEMPTS) {
      return { ok: false, error: "יותר מדי ניסיונות. בקשו קוד חדש." };
    }
    const expected = hashCode(phone, code.trim());
    if (!safeEqual(expected, data.code_hash)) {
      await getSupabaseAdmin()
        .from("otp_codes")
        .update({ attempts: data.attempts + 1 })
        .eq("phone", phone);
      return { ok: false, error: "קוד שגוי" };
    }
    await getSupabaseAdmin().from("otp_codes").delete().eq("phone", phone);
    return { ok: true };
  }

  const all = await readLocal();
  const idx = all.findIndex((r) => r.phone === phone);
  if (idx < 0) return { ok: false, error: "לא נמצא קוד. בקשו קוד חדש." };
  const row = all[idx];
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "הקוד פג תוקף. בקשו קוד חדש." };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: "יותר מדי ניסיונות. בקשו קוד חדש." };
  }
  const expected = hashCode(phone, code.trim());
  if (!safeEqual(expected, row.code_hash)) {
    all[idx] = { ...row, attempts: row.attempts + 1 };
    await writeLocal(all);
    return { ok: false, error: "קוד שגוי" };
  }
  await writeLocal(all.filter((r) => r.phone !== phone));
  return { ok: true };
}
