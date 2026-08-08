import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { createInviteToken } from "./invite-token";
import { getSupabaseAdmin, hasSupabaseConfig } from "./supabase";
import type {
  PublicInviteView,
  Rsvp,
  RsvpImportRow,
  RsvpSummary,
  TokenUpdateInput,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "rsvps.json");

async function ensureLocalFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, "[]\n", "utf8");
  }
}

function normalizeRow(row: Rsvp): Rsvp {
  return {
    ...row,
    invite_token: row.invite_token || createInviteToken(),
    reminder_sent_at: row.reminder_sent_at ?? null,
    reminder_message_id: row.reminder_message_id ?? null,
  };
}

async function readLocal(): Promise<Rsvp[]> {
  await ensureLocalFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  return (JSON.parse(raw) as Rsvp[]).map(normalizeRow);
}

async function writeLocal(rows: Rsvp[]): Promise<void> {
  await ensureLocalFile();
  await fs.writeFile(
    DATA_FILE,
    JSON.stringify(rows.map(normalizeRow), null, 2) + "\n",
    "utf8"
  );
}

function nowIso(): string {
  return new Date().toISOString();
}

function summarize(rows: Rsvp[]): RsvpSummary {
  const eligibleForReminder = rows.filter(
    (r) => r.status === "imported" || r.status === "confirmed" || r.status === "maybe"
  );
  return {
    total_records: rows.length,
    confirmed: rows.filter((r) => r.status === "confirmed").length,
    declined: rows.filter((r) => r.status === "declined").length,
    maybe: rows.filter((r) => r.status === "maybe").length,
    imported_pending: rows.filter((r) => r.status === "imported").length,
    total_guests_attending: rows
      .filter((r) => r.status === "confirmed" || r.status === "imported")
      .reduce((sum, r) => sum + r.guest_count, 0),
    reminders_sent: rows.filter((r) => Boolean(r.reminder_sent_at)).length,
    reminders_pending: eligibleForReminder.filter((r) => !r.reminder_sent_at)
      .length,
  };
}

function toPublicView(row: Rsvp): PublicInviteView {
  return {
    full_name: row.full_name,
    guest_count: Math.max(row.guest_count, 1),
    status: row.status,
    notes: row.notes,
    wants_video_blessing: row.wants_video_blessing,
    wants_to_speak: row.wants_to_speak,
    excitement: row.excitement,
    already_final: Boolean(row.final_confirmed_at),
  };
}

export async function listRsvps(): Promise<Rsvp[]> {
  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabaseAdmin()
      .from("rsvps")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as Rsvp[]).map(normalizeRow);
  }
  const rows = await readLocal();
  const missing = rows.some(
    (r) => !r.invite_token || r.reminder_sent_at === undefined
  );
  if (missing) await writeLocal(rows);
  return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function getSummary(): Promise<RsvpSummary> {
  return summarize(await listRsvps());
}

export async function getRsvpById(id: string): Promise<Rsvp | null> {
  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabaseAdmin()
      .from("rsvps")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? normalizeRow(data as Rsvp) : null;
  }
  const rows = await readLocal();
  return rows.find((r) => r.id === id) ?? null;
}

export async function markReminderSent(
  id: string,
  messageId: string
): Promise<Rsvp | null> {
  const timestamp = nowIso();

  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabaseAdmin()
      .from("rsvps")
      .update({
        reminder_sent_at: timestamp,
        reminder_message_id: messageId,
      })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ? normalizeRow(data as Rsvp) : null;
  }

  const rows = await readLocal();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  rows[idx] = {
    ...rows[idx],
    reminder_sent_at: timestamp,
    reminder_message_id: messageId,
    updated_at: timestamp,
  };
  await writeLocal(rows);
  return rows[idx];
}

export async function clearReminderSent(
  id?: string
): Promise<{ cleared: number }> {
  if (hasSupabaseConfig()) {
    let query = getSupabaseAdmin()
      .from("rsvps")
      .update({
        reminder_sent_at: null,
        reminder_message_id: null,
      })
      .not("reminder_sent_at", "is", null);

    if (id) {
      query = query.eq("id", id);
    }

    const { data, error } = await query.select("id");
    if (error) throw error;
    return { cleared: data?.length ?? 0 };
  }

  const rows = await readLocal();
  let cleared = 0;
  const next = rows.map((r) => {
    if (id && r.id !== id) return r;
    if (!r.reminder_sent_at) return r;
    cleared += 1;
    return {
      ...r,
      reminder_sent_at: null,
      reminder_message_id: null,
      updated_at: nowIso(),
    };
  });
  await writeLocal(next);
  return { cleared };
}

export async function getRsvpByPhone(phone: string): Promise<Rsvp | null> {
  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabaseAdmin()
      .from("rsvps")
      .select("*")
      .eq("phone", phone)
      .maybeSingle();
    if (error) throw error;
    return data ? normalizeRow(data as Rsvp) : null;
  }
  const rows = await readLocal();
  return rows.find((r) => r.phone === phone) ?? null;
}

function buildRsvpUpdate(input: TokenUpdateInput, timestamp: string) {
  const patch: Record<string, unknown> = {
    guest_count: input.guest_count,
    status: input.status,
    notes: input.notes ?? null,
    final_confirmed_at: timestamp,
  };
  if (input.wants_video_blessing !== undefined) {
    patch.wants_video_blessing = input.wants_video_blessing;
  }
  if (input.wants_to_speak !== undefined) {
    patch.wants_to_speak = input.wants_to_speak;
  }
  if (input.excitement !== undefined) {
    patch.excitement = input.excitement;
  }
  return patch;
}

export async function updateRsvpByPhone(
  phone: string,
  input: TokenUpdateInput
): Promise<Rsvp | null> {
  const timestamp = nowIso();
  const patch = buildRsvpUpdate(input, timestamp);

  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabaseAdmin()
      .from("rsvps")
      .update(patch)
      .eq("phone", phone)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ? normalizeRow(data as Rsvp) : null;
  }

  const rows = await readLocal();
  const idx = rows.findIndex((r) => r.phone === phone);
  if (idx < 0) return null;
  rows[idx] = {
    ...rows[idx],
    ...patch,
    updated_at: timestamp,
  } as Rsvp;
  await writeLocal(rows);
  return rows[idx];
}

/** Create a new guest from phone OTP self-registration, or update if exists. */
export async function upsertRsvpByPhone(input: {
  phone: string;
  full_name: string;
  guest_count: number;
  status: Exclude<Rsvp["status"], "imported">;
  notes?: string | null;
}): Promise<Rsvp> {
  const existing = await getRsvpByPhone(input.phone);
  if (existing) {
    const updated = await updateRsvpByPhone(input.phone, {
      guest_count: input.guest_count,
      status: input.status,
      notes: input.notes ?? existing.notes,
    });
    if (!updated) throw new Error("Failed to update RSVP");
    if (input.full_name.trim() && input.full_name.trim() !== existing.full_name) {
      const renamed = await updateGuestName(input.phone, input.full_name.trim());
      return renamed ?? updated;
    }
    return updated;
  }

  const timestamp = nowIso();
  const count =
    input.status === "declined" ? 0 : Math.max(input.guest_count, 1);
  const row: Rsvp = {
    id: randomUUID(),
    invite_token: createInviteToken(),
    full_name: input.full_name.trim(),
    phone: input.phone,
    guest_count: count,
    status: input.status,
    final_confirmed_at: timestamp,
    wants_video_blessing: null,
    wants_to_speak: null,
    excitement: null,
    notes: input.notes ?? null,
    imported_at: null,
    reminder_sent_at: null,
    reminder_message_id: null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabaseAdmin()
      .from("rsvps")
      .insert({
        full_name: row.full_name,
        phone: row.phone,
        guest_count: row.guest_count,
        status: row.status,
        invite_token: row.invite_token,
        final_confirmed_at: row.final_confirmed_at,
        notes: row.notes,
      })
      .select("*")
      .single();
    if (error) throw error;
    return normalizeRow(data as Rsvp);
  }

  const rows = await readLocal();
  rows.push(row);
  await writeLocal(rows);
  return row;
}

async function updateGuestName(
  phone: string,
  fullName: string
): Promise<Rsvp | null> {
  const timestamp = nowIso();
  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabaseAdmin()
      .from("rsvps")
      .update({ full_name: fullName, updated_at: timestamp })
      .eq("phone", phone)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ? normalizeRow(data as Rsvp) : null;
  }
  const rows = await readLocal();
  const idx = rows.findIndex((r) => r.phone === phone);
  if (idx < 0) return null;
  rows[idx] = {
    ...rows[idx],
    full_name: fullName,
    updated_at: timestamp,
  };
  await writeLocal(rows);
  return rows[idx];
}

export async function getRsvpByToken(token: string): Promise<Rsvp | null> {
  if (!token || token.length < 6) return null;
  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabaseAdmin()
      .from("rsvps")
      .select("*")
      .eq("invite_token", token)
      .maybeSingle();
    if (error) throw error;
    return data ? normalizeRow(data as Rsvp) : null;
  }
  const rows = await readLocal();
  return rows.find((r) => r.invite_token === token) ?? null;
}

export async function getInviteByToken(
  token: string
): Promise<PublicInviteView | null> {
  const row = await getRsvpByToken(token);
  return row ? toPublicView(row) : null;
}

export async function updateRsvpByToken(
  token: string,
  input: TokenUpdateInput
): Promise<PublicInviteView | null> {
  if (!token || token.length < 6) return null;
  const timestamp = nowIso();
  const patch = buildRsvpUpdate(input, timestamp);

  if (hasSupabaseConfig()) {
    const existing = await getSupabaseAdmin()
      .from("rsvps")
      .select("id")
      .eq("invite_token", token)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) return null;

    const { data, error } = await getSupabaseAdmin()
      .from("rsvps")
      .update(patch)
      .eq("invite_token", token)
      .select("*")
      .single();
    if (error) throw error;
    return toPublicView(normalizeRow(data as Rsvp));
  }

  const rows = await readLocal();
  const idx = rows.findIndex((r) => r.invite_token === token);
  if (idx < 0) return null;

  rows[idx] = {
    ...rows[idx],
    ...patch,
    updated_at: timestamp,
  } as Rsvp;
  await writeLocal(rows);
  return toPublicView(rows[idx]);
}

export async function importRsvps(rows: RsvpImportRow[]): Promise<{
  inserted: number;
  updated: number;
  skipped: number;
}> {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  if (hasSupabaseConfig()) {
    for (const row of rows) {
      const existing = await getSupabaseAdmin()
        .from("rsvps")
        .select("id, status, final_confirmed_at, invite_token")
        .eq("phone", row.phone)
        .maybeSingle();
      if (existing.error) throw existing.error;

      if (existing.data) {
        if (existing.data.final_confirmed_at) {
          skipped += 1;
          continue;
        }
        const { error } = await getSupabaseAdmin()
          .from("rsvps")
          .update({
            full_name: row.full_name,
            guest_count: row.guest_count,
            wants_video_blessing: row.wants_video_blessing,
            wants_to_speak: row.wants_to_speak,
            excitement: row.excitement,
            notes: row.notes,
            imported_at: row.imported_at,
            status: "imported",
            invite_token: existing.data.invite_token || createInviteToken(),
          })
          .eq("phone", row.phone);
        if (error) throw error;
        updated += 1;
      } else {
        const { error } = await getSupabaseAdmin().from("rsvps").insert({
          full_name: row.full_name,
          phone: row.phone,
          guest_count: row.guest_count,
          status: "imported",
          invite_token: createInviteToken(),
          wants_video_blessing: row.wants_video_blessing,
          wants_to_speak: row.wants_to_speak,
          excitement: row.excitement,
          notes: row.notes,
          imported_at: row.imported_at,
        });
        if (error) throw error;
        inserted += 1;
      }
    }
    return { inserted, updated, skipped };
  }

  const all = await readLocal();
  const byPhone = new Map(all.map((r) => [r.phone, normalizeRow(r)]));

  for (const row of rows) {
    const existing = byPhone.get(row.phone);
    if (existing) {
      if (existing.final_confirmed_at) {
        skipped += 1;
        continue;
      }
      const next: Rsvp = {
        ...existing,
        invite_token: existing.invite_token || createInviteToken(),
        full_name: row.full_name,
        guest_count: row.guest_count,
        wants_video_blessing: row.wants_video_blessing,
        wants_to_speak: row.wants_to_speak,
        excitement: row.excitement,
        notes: row.notes,
        imported_at: row.imported_at,
        status: "imported",
        updated_at: nowIso(),
      };
      byPhone.set(row.phone, next);
      updated += 1;
    } else {
      const created: Rsvp = {
        id: randomUUID(),
        invite_token: createInviteToken(),
        full_name: row.full_name,
        phone: row.phone,
        guest_count: row.guest_count,
        status: "imported",
        final_confirmed_at: null,
        wants_video_blessing: row.wants_video_blessing,
        wants_to_speak: row.wants_to_speak,
        excitement: row.excitement,
        notes: row.notes,
        imported_at: row.imported_at,
        reminder_sent_at: null,
        reminder_message_id: null,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      byPhone.set(row.phone, created);
      inserted += 1;
    }
  }

  await writeLocal(Array.from(byPhone.values()));
  return { inserted, updated, skipped };
}
