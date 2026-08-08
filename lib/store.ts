import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { createInviteToken } from "./invite-token";
import { normalizePhone, phonesMatch } from "./phone";
import { getSupabaseAdmin, hasSupabaseConfig } from "./supabase";
import type {
  PublicInviteView,
  Rsvp,
  RsvpImportRow,
  RsvpSummary,
  TokenUpdateInput,
} from "./types";
import { isManualPendingGuest, normalizeGuestName } from "./types";

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
    sheet_order:
      typeof row.sheet_order === "number" && Number.isFinite(row.sheet_order)
        ? row.sheet_order
        : null,
    reminder_sent_at: row.reminder_sent_at ?? null,
    reminder_message_id: row.reminder_message_id ?? null,
  };
}

function compareSheetOrder(a: Rsvp, b: Rsvp): number {
  const ao = a.sheet_order;
  const bo = b.sheet_order;
  if (ao != null && bo != null && ao !== bo) return ao - bo;
  if (ao != null && bo == null) return -1;
  if (ao == null && bo != null) return 1;
  const ai = a.imported_at || a.created_at;
  const bi = b.imported_at || b.created_at;
  const byTime = ai.localeCompare(bi);
  if (byTime !== 0) return byTime;
  return a.full_name.localeCompare(b.full_name, "he");
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
  const manualPending = rows.filter(isManualPendingGuest);
  return {
    total_records: rows.length,
    confirmed: rows.filter((r) => r.status === "confirmed").length,
    declined: rows.filter((r) => r.status === "declined").length,
    maybe: rows.filter((r) => r.status === "maybe").length,
    imported_pending: rows.filter(
      (r) => r.status === "imported" && !isManualPendingGuest(r)
    ).length,
    manual_pending: manualPending.length,
    total_guests_attending: rows
      .filter(
        (r) =>
          (r.status === "confirmed" || r.status === "imported") &&
          !isManualPendingGuest(r)
      )
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
    // Sort in app code so missing sheet_order column (pre-migration) still works.
    const { data, error } = await getSupabaseAdmin().from("rsvps").select("*");
    if (error) throw error;
    return ((data ?? []) as Rsvp[]).map(normalizeRow).sort(compareSheetOrder);
  }
  const rows = await readLocal();
  const missing = rows.some(
    (r) => !r.invite_token || r.reminder_sent_at === undefined
  );
  if (missing) await writeLocal(rows);
  return rows.map(normalizeRow).sort(compareSheetOrder);
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
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  if (hasSupabaseConfig()) {
    const exact = await getSupabaseAdmin()
      .from("rsvps")
      .select("*")
      .eq("phone", normalized)
      .maybeSingle();
    if (exact.error) throw exact.error;
    if (exact.data) return normalizeRow(exact.data as Rsvp);

    // Fallback: tolerate legacy / alternate formatting in DB
    const { data, error } = await getSupabaseAdmin()
      .from("rsvps")
      .select("*");
    if (error) throw error;
    const match = (data || []).find((row) =>
      phonesMatch((row as Rsvp).phone, normalized)
    );
    if (!match) return null;

    // Canonicalize stored phone so future lookups are exact
    if ((match as Rsvp).phone !== normalized) {
      const { data: fixed, error: fixErr } = await getSupabaseAdmin()
        .from("rsvps")
        .update({ phone: normalized })
        .eq("id", (match as Rsvp).id)
        .select("*")
        .maybeSingle();
      if (fixErr) throw fixErr;
      if (fixed) return normalizeRow(fixed as Rsvp);
    }
    return normalizeRow(match as Rsvp);
  }

  const rows = await readLocal();
  const exact = rows.find((r) => r.phone === normalized);
  if (exact) return exact;
  const match = rows.find((r) => phonesMatch(r.phone, normalized));
  if (!match) return null;
  if (match.phone !== normalized) {
    match.phone = normalized;
    match.updated_at = nowIso();
    await writeLocal(rows);
  }
  return match;
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
  const existing = await getRsvpByPhone(phone);
  if (!existing) return null;

  const timestamp = nowIso();
  const patch = {
    ...buildRsvpUpdate(input, timestamp),
    updated_at: timestamp,
  };

  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabaseAdmin()
      .from("rsvps")
      .update(patch)
      .eq("id", existing.id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ? normalizeRow(data as Rsvp) : null;
  }

  const rows = await readLocal();
  const idx = rows.findIndex((r) => r.id === existing.id);
  if (idx < 0) return null;
  rows[idx] = {
    ...rows[idx],
    ...patch,
  } as Rsvp;
  await writeLocal(rows);
  return rows[idx];
}

export async function updateRsvpById(
  id: string,
  input: {
    status: Rsvp["status"];
    guest_count: number;
    full_name?: string;
  }
): Promise<Rsvp | null> {
  const timestamp = nowIso();
  const status = input.status;
  const guest_count =
    status === "declined" ? 0 : Math.max(1, Math.min(10, input.guest_count));
  const patch: Record<string, unknown> = {
    status,
    guest_count,
    updated_at: timestamp,
    final_confirmed_at:
      status === "confirmed" || status === "declined" || status === "maybe"
        ? timestamp
        : null,
  };
  if (input.full_name !== undefined) {
    const name = input.full_name.trim();
    if (!name || name.length < 2) throw new Error("INVALID_NAME");
    patch.full_name = name;
  }

  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabaseAdmin()
      .from("rsvps")
      .update(patch)
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
    ...patch,
  } as Rsvp;
  await writeLocal(rows);
  return rows[idx];
}

export type GuestAddConflict = {
  code:
    | "ALREADY_CONFIRMED"
    | "ALREADY_DECLINED"
    | "PHONE_EXISTS"
    | "NAME_ALREADY_CONFIRMED";
  existing: Rsvp;
};

/** Detect if a manual add would duplicate someone already on the list. */
export async function findGuestAddConflict(input: {
  full_name: string;
  phone: string;
  /** When true, only reject on matching phone (ignore same-name confirmed). */
  phoneOnly?: boolean;
}): Promise<GuestAddConflict | null> {
  const phone = normalizePhone(input.phone);
  const fullName = input.full_name.trim();
  if (!phone || !fullName) return null;

  const byPhone = await getRsvpByPhone(phone);
  if (byPhone) {
    if (byPhone.status === "confirmed") {
      return { code: "ALREADY_CONFIRMED", existing: byPhone };
    }
    if (byPhone.status === "declined") {
      return { code: "ALREADY_DECLINED", existing: byPhone };
    }
    return { code: "PHONE_EXISTS", existing: byPhone };
  }

  if (input.phoneOnly) return null;

  const nameKey = normalizeGuestName(fullName);
  const sameNameConfirmed = (await listRsvps()).find(
    (r) =>
      r.status === "confirmed" && normalizeGuestName(r.full_name) === nameKey
  );
  if (sameNameConfirmed) {
    return { code: "NAME_ALREADY_CONFIRMED", existing: sameNameConfirmed };
  }

  return null;
}

/**
 * Manually add a guest who has not registered yet (admin only).
 * Creates status=imported so they appear in pending reminders.
 * Rejects if phone/name already exists among confirmed (or any) guests.
 */
export async function createImportedGuest(input: {
  full_name: string;
  phone: string;
  phoneOnly?: boolean;
}): Promise<Rsvp> {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new Error("INVALID_PHONE");

  const fullName = input.full_name.trim();
  if (!fullName) throw new Error("INVALID_NAME");

  const conflict = await findGuestAddConflict({
    full_name: fullName,
    phone,
    phoneOnly: input.phoneOnly,
  });
  if (conflict) throw new Error(conflict.code);

  const timestamp = nowIso();
  const row: Rsvp = {
    id: randomUUID(),
    invite_token: createInviteToken(),
    full_name: fullName,
    phone,
    guest_count: 1,
    status: "imported",
    final_confirmed_at: null,
    wants_video_blessing: null,
    wants_to_speak: null,
    excitement: null,
    notes: null,
    imported_at: null,
    sheet_order: null,
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
        final_confirmed_at: null,
        notes: null,
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("PHONE_EXISTS");
      throw error;
    }
    return normalizeRow(data as Rsvp);
  }

  const rows = await readLocal();
  rows.push(row);
  await writeLocal(rows);
  return row;
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
    sheet_order: null,
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
  const existing = await getRsvpByPhone(phone);
  if (!existing) return null;
  return updateGuestNameById(existing.id, fullName);
}

export async function updateGuestNameById(
  id: string,
  fullName: string
): Promise<Rsvp | null> {
  const name = fullName.trim();
  if (!name || name.length < 2) throw new Error("INVALID_NAME");

  const timestamp = nowIso();
  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabaseAdmin()
      .from("rsvps")
      .update({ full_name: name, updated_at: timestamp })
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
    full_name: name,
    updated_at: timestamp,
  };
  await writeLocal(rows);
  return rows[idx];
}

/** Rename guest by phone (WhatsApp organizer confirm flow). */
export async function renameGuestByPhone(
  phone: string,
  fullName: string
): Promise<Rsvp | null> {
  return updateGuestName(phone, fullName);
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
        const locked =
          Boolean(existing.data.final_confirmed_at) ||
          existing.data.status !== "imported";
        if (locked) {
          // Keep confirmation intact; only sync sheet order for admin list.
          const { error } = await getSupabaseAdmin()
            .from("rsvps")
            .update({ sheet_order: row.sheet_order })
            .eq("phone", row.phone);
          if (error) throw error;
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
            sheet_order: row.sheet_order,
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
          sheet_order: row.sheet_order,
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
      const locked =
        Boolean(existing.final_confirmed_at) || existing.status !== "imported";
      if (locked) {
        byPhone.set(row.phone, {
          ...existing,
          sheet_order: row.sheet_order,
        });
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
        sheet_order: row.sheet_order,
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
        sheet_order: row.sheet_order,
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
