import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { getSupabaseAdmin, hasSupabaseConfig } from "./supabase";

export type SystemLogSource =
  | "admin"
  | "guest"
  | "whatsapp"
  | "system"
  | "import";

export type SystemLogInput = {
  source: SystemLogSource;
  action: string;
  summary: string;
  actor?: string | null;
  guestName?: string | null;
  phone?: string | null;
  rsvpId?: string | null;
  ok?: boolean;
  detail?: Record<string, unknown>;
};

export type SystemEvent = {
  id: string;
  created_at: string;
  source: SystemLogSource | string;
  action: string;
  summary: string;
  actor: string | null;
  guest_name: string | null;
  phone: string | null;
  rsvp_id: string | null;
  ok: boolean;
  detail: Record<string, unknown>;
};

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "system-events.json");
const MAX_LOCAL = 2000;

async function ensureLocalFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, "[]\n", "utf8");
  }
}

async function readLocal(): Promise<SystemEvent[]> {
  await ensureLocalFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw) as SystemEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLocal(rows: SystemEvent[]): Promise<void> {
  await ensureLocalFile();
  await fs.writeFile(DATA_FILE, JSON.stringify(rows, null, 2) + "\n", "utf8");
}

function previewMessage(message: string, redactDigits = false): string {
  let text = message.replace(/\s+/g, " ").trim();
  if (redactDigits) {
    text = text.replace(/\b\d{4,8}\b/g, "••••");
  }
  if (text.length > 180) return `${text.slice(0, 177)}…`;
  return text;
}

/** Fire-and-forget safe logger — never throws to callers. */
export async function appendSystemLog(input: SystemLogInput): Promise<void> {
  try {
    const row = {
      source: input.source,
      action: input.action,
      summary: input.summary.slice(0, 500),
      actor: input.actor ?? null,
      guest_name: input.guestName ?? null,
      phone: input.phone ?? null,
      rsvp_id: input.rsvpId ?? null,
      ok: input.ok !== false,
      detail: input.detail ?? {},
    };

    if (hasSupabaseConfig()) {
      const { error } = await getSupabaseAdmin().from("system_events").insert(row);
      if (error) {
        console.error("system_events insert failed", error.message);
      }
      return;
    }

    const event: SystemEvent = {
      id: randomUUID(),
      created_at: new Date().toISOString(),
      ...row,
    };
    const rows = await readLocal();
    rows.unshift(event);
    await writeLocal(rows.slice(0, MAX_LOCAL));
  } catch (err) {
    console.error("appendSystemLog failed", err);
  }
}

export async function listSystemEvents(limit = 200): Promise<SystemEvent[]> {
  const safeLimit = Math.max(1, Math.min(500, limit));

  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabaseAdmin()
      .from("system_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(safeLimit);
    if (error) throw error;
    return (data ?? []) as SystemEvent[];
  }

  const rows = await readLocal();
  return rows.slice(0, safeLimit);
}

export async function logWhatsAppOutbound(input: {
  phone: string;
  purpose: string;
  ok: boolean;
  error?: string;
  message: string;
  guestName?: string | null;
  rsvpId?: string | null;
  messageId?: string | null;
  actor?: string | null;
}): Promise<void> {
  const isOtp = input.purpose === "otp";
  const preview = previewMessage(input.message, isOtp || input.purpose.includes("otp"));
  await appendSystemLog({
    source: "whatsapp",
    action: input.ok ? "wa_sent" : "wa_send_failed",
    summary: input.ok
      ? `וואטסאפ נשלח (${input.purpose})`
      : `שליחת וואטסאפ נכשלה (${input.purpose})`,
    actor: input.actor ?? "system",
    guestName: input.guestName ?? null,
    phone: input.phone,
    rsvpId: input.rsvpId ?? null,
    ok: input.ok,
    detail: {
      purpose: input.purpose,
      preview: isOtp ? "[קוד OTP]" : preview,
      error: input.error ?? null,
      messageId: input.messageId ?? null,
    },
  });
}

export const statusLabelHe: Record<string, string> = {
  imported: "ממתין לאישור",
  confirmed: "אושר סופית",
  declined: "לא מגיע/ה",
  maybe: "עדיין לא יודע/ת",
};
