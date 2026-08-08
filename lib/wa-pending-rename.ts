import { promises as fs } from "fs";
import path from "path";
import { phoneIdentity } from "./phone";
import { getSupabaseAdmin, hasSupabaseConfig } from "./supabase";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "wa-pending-renames.json");
const SITE_CONTENT_ID = "wa_pending_renames";
const TTL_MS = 30 * 60 * 1000; // 30 minutes

export type PendingRename = {
  organizerKey: string;
  guestPhone: string;
  currentName: string;
  newName: string;
  createdAt: string;
};

type StoreShape = { items: PendingRename[] };

function organizerKeyFromPhone(phone: string): string | null {
  return phoneIdentity(phone);
}

function isFresh(item: PendingRename, now = Date.now()): boolean {
  const t = Date.parse(item.createdAt);
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

export async function setPendingRename(input: {
  organizerPhone: string;
  guestPhone: string;
  currentName: string;
  newName: string;
}): Promise<void> {
  const organizerKey = organizerKeyFromPhone(input.organizerPhone);
  if (!organizerKey) return;

  const store = await readStore();
  const next: PendingRename = {
    organizerKey,
    guestPhone: input.guestPhone,
    currentName: input.currentName.trim(),
    newName: input.newName.trim(),
    createdAt: new Date().toISOString(),
  };
  store.items = [
    ...store.items.filter(
      (i) => isFresh(i) && i.organizerKey !== organizerKey
    ),
    next,
  ];
  await writeStore(store);
}

export async function getPendingRename(
  organizerPhone: string
): Promise<PendingRename | null> {
  const organizerKey = organizerKeyFromPhone(organizerPhone);
  if (!organizerKey) return null;
  const store = await readStore();
  const item = store.items.find(
    (i) => i.organizerKey === organizerKey && isFresh(i)
  );
  return item || null;
}

export async function clearPendingRename(organizerPhone: string): Promise<void> {
  const organizerKey = organizerKeyFromPhone(organizerPhone);
  if (!organizerKey) return;
  const store = await readStore();
  store.items = store.items.filter(
    (i) => isFresh(i) && i.organizerKey !== organizerKey
  );
  await writeStore(store);
}

export function isRenameConfirm(text: string): boolean {
  const t = text.replace(/\r\n/g, "\n").trim().toLowerCase();
  return /^(כן|כן\.|עדכן|לעדכן|yes|y)$/i.test(t);
}

export function isRenameDecline(text: string): boolean {
  const t = text.replace(/\r\n/g, "\n").trim().toLowerCase();
  return /^(לא|לא\.|no|n)$/i.test(t);
}
