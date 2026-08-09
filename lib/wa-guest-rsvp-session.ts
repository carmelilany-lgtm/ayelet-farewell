import { promises as fs } from "fs";
import path from "path";
import { phoneIdentity } from "./phone";
import { getSupabaseAdmin, hasSupabaseConfig } from "./supabase";
import type { RsvpStatus } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "wa-guest-rsvp-sessions.json");
const SITE_CONTENT_ID = "wa_guest_rsvp_sessions";
const TTL_MS = 30 * 60 * 1000; // 30 min to answer guest count

export type GuestRsvpPendingStatus = Exclude<RsvpStatus, "imported" | "declined">;

export type GuestRsvpSession = {
  phoneKey: string;
  /** Waiting for guest count after מגיע/ה or עדיין לא יודע/ת */
  pendingStatus: GuestRsvpPendingStatus;
  updatedAt: string;
};

type StoreShape = { items: GuestRsvpSession[] };

function keyFromPhone(phone: string): string | null {
  return phoneIdentity(phone);
}

function isFresh(item: GuestRsvpSession, now = Date.now()): boolean {
  const t = Date.parse(item.updatedAt);
  return Number.isFinite(t) && now - t < TTL_MS;
}

async function readStore(): Promise<StoreShape> {
  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabaseAdmin()
      .from("site_content")
      .select("content")
      .eq("id", SITE_CONTENT_ID)
      .maybeSingle();
    if (error) throw error;
    const content = (data?.content as StoreShape | null) || null;
    return { items: Array.isArray(content?.items) ? content.items : [] };
  }
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as StoreShape;
    return { items: Array.isArray(parsed.items) ? parsed.items : [] };
  } catch {
    return { items: [] };
  }
}

async function writeStore(store: StoreShape): Promise<void> {
  const cleaned: StoreShape = {
    items: store.items.filter((item) => isFresh(item)),
  };
  if (hasSupabaseConfig()) {
    const { error } = await getSupabaseAdmin().from("site_content").upsert({
      id: SITE_CONTENT_ID,
      content: cleaned,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(cleaned, null, 2) + "\n", "utf8");
}

export async function getGuestRsvpSession(
  phone: string
): Promise<GuestRsvpSession | null> {
  const phoneKey = keyFromPhone(phone);
  if (!phoneKey) return null;
  const store = await readStore();
  return (
    store.items.find((i) => i.phoneKey === phoneKey && isFresh(i)) || null
  );
}

export async function setGuestRsvpSession(
  phone: string,
  pendingStatus: GuestRsvpPendingStatus
): Promise<void> {
  const phoneKey = keyFromPhone(phone);
  if (!phoneKey) return;
  const next: GuestRsvpSession = {
    phoneKey,
    pendingStatus,
    updatedAt: new Date().toISOString(),
  };
  const store = await readStore();
  store.items = [
    ...store.items.filter((i) => isFresh(i) && i.phoneKey !== phoneKey),
    next,
  ];
  await writeStore(store);
}

export async function clearGuestRsvpSession(phone: string): Promise<void> {
  const phoneKey = keyFromPhone(phone);
  if (!phoneKey) return;
  const store = await readStore();
  store.items = store.items.filter(
    (i) => isFresh(i) && i.phoneKey !== phoneKey
  );
  await writeStore(store);
}
