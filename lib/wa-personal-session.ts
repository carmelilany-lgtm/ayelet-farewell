import { promises as fs } from "fs";
import path from "path";
import { phoneIdentity } from "./phone";
import { getSupabaseAdmin, hasSupabaseConfig } from "./supabase";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "wa-personal-sessions.json");
const SITE_CONTENT_ID = "wa_personal_sessions";
/** Keep rolling chat memory for a week. */
const TTL_MS = 7 * 24 * 60 * 1000;
const MAX_HISTORY = 40;
const MAX_PENDING = 12;
const MAX_SEEN_IDS = 80;

export type PersonalChatTurn = {
  role: "her" | "him";
  text: string;
  at: string;
};

export type PersonalPending = {
  text: string;
  at: string;
  messageId?: string | null;
};

export type PersonalSession = {
  phoneKey: string;
  updatedAt: string;
  /** Monotonic token — newer inbound bumps this so older handlers abort. */
  seq: number;
  history: PersonalChatTurn[];
  pending: PersonalPending[];
  /** Green API inbound ids already claimed (dedupe webhook retries). */
  seenMessageIds: string[];
};

type StoreShape = { items: PersonalSession[] };

function keyFromPhone(phone: string): string | null {
  return phoneIdentity(phone);
}

function isFresh(item: PersonalSession, now = Date.now()): boolean {
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

function emptySession(phoneKey: string): PersonalSession {
  return {
    phoneKey,
    updatedAt: new Date().toISOString(),
    seq: 0,
    history: [],
    pending: [],
    seenMessageIds: [],
  };
}

function normalizeSession(item: PersonalSession): PersonalSession {
  return {
    ...item,
    history: Array.isArray(item.history) ? item.history : [],
    pending: Array.isArray(item.pending) ? item.pending : [],
    seenMessageIds: Array.isArray(item.seenMessageIds)
      ? item.seenMessageIds
      : [],
  };
}

export async function getPersonalSession(
  phone: string
): Promise<PersonalSession | null> {
  const phoneKey = keyFromPhone(phone);
  if (!phoneKey) return null;
  const store = await readStore();
  const found = store.items.find((i) => i.phoneKey === phoneKey && isFresh(i));
  return found ? normalizeSession(found) : null;
}

/**
 * Queue her inbound text and bump seq.
 * If messageId was already claimed (webhook retry), returns null.
 */
export async function enqueuePersonalInbound(
  phone: string,
  text: string,
  messageId?: string | null
): Promise<{ seq: number } | null> {
  const phoneKey = keyFromPhone(phone);
  if (!phoneKey) return null;
  const store = await readStore();
  const existing = normalizeSession(
    store.items.find((i) => i.phoneKey === phoneKey && isFresh(i)) ||
      emptySession(phoneKey)
  );

  const mid = messageId?.trim() || "";
  if (mid && existing.seenMessageIds.includes(mid)) {
    return null;
  }

  const seenMessageIds = mid
    ? [...existing.seenMessageIds, mid].slice(-MAX_SEEN_IDS)
    : existing.seenMessageIds;

  const next: PersonalSession = {
    ...existing,
    updatedAt: new Date().toISOString(),
    seq: existing.seq + 1,
    seenMessageIds,
    pending: [
      ...existing.pending.slice(-(MAX_PENDING - 1)),
      { text, at: new Date().toISOString(), messageId: mid || null },
    ],
  };

  store.items = [
    ...store.items.filter((i) => isFresh(i) && i.phoneKey !== phoneKey),
    next,
  ];
  await writeStore(store);
  return { seq: next.seq };
}

export async function isPersonalSeqCurrent(
  phone: string,
  seq: number
): Promise<boolean> {
  const session = await getPersonalSession(phone);
  return Boolean(session && session.seq === seq);
}

/**
 * Commit pending her-messages + his bubbles into history, clear pending.
 * Only if seq still matches (won the debounce race).
 */
export async function commitPersonalReply(opts: {
  phone: string;
  seq: number;
  bubbles: string[];
}): Promise<boolean> {
  const phoneKey = keyFromPhone(opts.phone);
  if (!phoneKey) return false;
  const store = await readStore();
  const existingRaw = store.items.find(
    (i) => i.phoneKey === phoneKey && isFresh(i)
  );
  if (!existingRaw) return false;
  const existing = normalizeSession(existingRaw);
  if (existing.seq !== opts.seq) return false;

  const now = new Date().toISOString();
  const herTurns: PersonalChatTurn[] = existing.pending.map((p) => ({
    role: "her" as const,
    text: p.text,
    at: p.at,
  }));
  const himTurns: PersonalChatTurn[] = opts.bubbles.map((text) => ({
    role: "him" as const,
    text,
    at: now,
  }));

  const history = [...existing.history, ...herTurns, ...himTurns].slice(
    -MAX_HISTORY
  );

  const next: PersonalSession = {
    ...existing,
    updatedAt: now,
    history,
    pending: [],
  };

  store.items = [
    ...store.items.filter((i) => isFresh(i) && i.phoneKey !== phoneKey),
    next,
  ];
  await writeStore(store);
  return true;
}

/** Drop pending for this seq without sending (e.g. model failure). */
export async function clearPersonalPendingIfSeq(
  phone: string,
  seq: number
): Promise<void> {
  const phoneKey = keyFromPhone(phone);
  if (!phoneKey) return;
  const store = await readStore();
  const existingRaw = store.items.find(
    (i) => i.phoneKey === phoneKey && isFresh(i)
  );
  if (!existingRaw) return;
  const existing = normalizeSession(existingRaw);
  if (existing.seq !== seq) return;

  const next: PersonalSession = {
    ...existing,
    updatedAt: new Date().toISOString(),
    pending: [],
  };
  store.items = [
    ...store.items.filter((i) => isFresh(i) && i.phoneKey !== phoneKey),
    next,
  ];
  await writeStore(store);
}
