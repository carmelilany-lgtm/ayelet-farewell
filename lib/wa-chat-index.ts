import { promises as fs } from "fs";
import path from "path";
import { normalizePhone, phoneIdentity } from "./phone";
import { getSupabaseAdmin, hasSupabaseConfig } from "./supabase";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "wa-chat-index.json");
const SITE_CONTENT_ID = "wa_chat_index";
/** Keep mapping long enough to cover the RSVP window after a reminder. */
const TTL_MS = 45 * 24 * 60 * 60 * 1000;

type ChatIndexItem = {
  chatKey: string;
  phone: string;
  updatedAt: string;
};

type StoreShape = { items: ChatIndexItem[] };

function chatKey(chatId: string): string {
  return chatId.trim().toLowerCase();
}

function isFresh(item: ChatIndexItem, now = Date.now()): boolean {
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

/** Remember WhatsApp chatId → phone after sending a reminder (helps @lid replies). */
export async function rememberWaChatId(
  phone: string,
  chatId: string | null | undefined
): Promise<void> {
  const normalized = normalizePhone(phone);
  const id = chatId?.trim();
  if (!normalized || !id || !id.includes("@")) return;

  const key = chatKey(id);
  const next: ChatIndexItem = {
    chatKey: key,
    phone: normalized,
    updatedAt: new Date().toISOString(),
  };
  const store = await readStore();
  store.items = [
    ...store.items.filter(
      (i) =>
        isFresh(i) &&
        i.chatKey !== key &&
        phoneIdentity(i.phone) !== phoneIdentity(normalized)
    ),
    next,
  ];
  await writeStore(store);
}

export async function lookupPhoneByWaChatId(
  chatId: string | null | undefined
): Promise<string | null> {
  const id = chatId?.trim();
  if (!id) return null;
  const store = await readStore();
  const found = store.items.find(
    (i) => i.chatKey === chatKey(id) && isFresh(i)
  );
  return found?.phone ?? null;
}
