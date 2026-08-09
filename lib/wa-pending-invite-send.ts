import { promises as fs } from "fs";
import path from "path";
import { phoneIdentity } from "./phone";
import { getSupabaseAdmin, hasSupabaseConfig } from "./supabase";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "wa-pending-invite-sends.json");
const SITE_CONTENT_ID = "wa_pending_invite_sends";
const TTL_MS = 30 * 60 * 1000; // 30 minutes

export type PendingInviteSend = {
  organizerKey: string;
  guestId: string;
  guestPhone: string;
  guestName: string;
  createdAt: string;
};

type StoreShape = { items: PendingInviteSend[] };

function organizerKeyFromPhone(phone: string): string | null {
  return phoneIdentity(phone);
}

function isFresh(item: PendingInviteSend, now = Date.now()): boolean {
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

export async function setPendingInviteSend(input: {
  organizerPhone: string;
  guestId: string;
  guestPhone: string;
  guestName: string;
}): Promise<void> {
  const organizerKey = organizerKeyFromPhone(input.organizerPhone);
  if (!organizerKey) return;

  const next: PendingInviteSend = {
    organizerKey,
    guestId: input.guestId,
    guestPhone: input.guestPhone,
    guestName: input.guestName.trim(),
    createdAt: new Date().toISOString(),
  };
  const store = await readStore();
  store.items = [
    ...store.items.filter(
      (i) => isFresh(i) && i.organizerKey !== organizerKey
    ),
    next,
  ];
  await writeStore(store);
}

export async function getPendingInviteSend(
  organizerPhone: string
): Promise<PendingInviteSend | null> {
  const organizerKey = organizerKeyFromPhone(organizerPhone);
  if (!organizerKey) return null;
  const store = await readStore();
  return (
    store.items.find((i) => i.organizerKey === organizerKey && isFresh(i)) ||
    null
  );
}

export async function clearPendingInviteSend(
  organizerPhone: string
): Promise<void> {
  const organizerKey = organizerKeyFromPhone(organizerPhone);
  if (!organizerKey) return;
  const store = await readStore();
  store.items = store.items.filter(
    (i) => isFresh(i) && i.organizerKey !== organizerKey
  );
  await writeStore(store);
}

export function isInviteSendConfirm(
  text: string,
  buttonId: string | null
): boolean {
  const id = (buttonId || "").trim().toLowerCase();
  if (id === "invite_yes") return true;
  const t = text.replace(/\r\n/g, "\n").trim().toLowerCase();
  return /^(כן|כן\.|שלח|לשלוח|yes|y)$/i.test(t);
}

export function isInviteSendDecline(
  text: string,
  buttonId: string | null
): boolean {
  const id = (buttonId || "").trim().toLowerCase();
  if (id === "invite_no") return true;
  const t = text.replace(/\r\n/g, "\n").trim().toLowerCase();
  return /^(לא|לא\.|no|n)$/i.test(t);
}
