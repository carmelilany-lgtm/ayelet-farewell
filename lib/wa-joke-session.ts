import { promises as fs } from "fs";
import path from "path";
import { phoneIdentity } from "./phone";
import { getSupabaseAdmin, hasSupabaseConfig } from "./supabase";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "wa-joke-sessions.json");
const SITE_CONTENT_ID = "wa_joke_sessions";
/** "עוד" stays valid for 2 minutes after the last joke. */
const TTL_MS = 2 * 60 * 1000;

type JokeSession = {
  phoneKey: string;
  updatedAt: string;
};

type StoreShape = { items: JokeSession[] };

function keyFromPhone(phone: string): string | null {
  return phoneIdentity(phone);
}

function isFresh(item: JokeSession, now = Date.now()): boolean {
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

export async function hasJokeSession(phone: string): Promise<boolean> {
  const phoneKey = keyFromPhone(phone);
  if (!phoneKey) return false;
  const store = await readStore();
  return store.items.some((i) => i.phoneKey === phoneKey && isFresh(i));
}

export async function markJokeSession(phone: string): Promise<void> {
  const phoneKey = keyFromPhone(phone);
  if (!phoneKey) return;
  const next: JokeSession = {
    phoneKey,
    updatedAt: new Date().toISOString(),
  };
  const store = await readStore();
  store.items = [
    ...store.items.filter((i) => isFresh(i) && i.phoneKey !== phoneKey),
    next,
  ];
  await writeStore(store);
}
