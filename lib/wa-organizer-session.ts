import { promises as fs } from "fs";
import path from "path";
import { phoneIdentity } from "./phone";
import { getSupabaseAdmin, hasSupabaseConfig } from "./supabase";
import type { RsvpStatus } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "wa-organizer-sessions.json");
const SITE_CONTENT_ID = "wa_organizer_sessions";
const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export type ListFilter =
  | { kind: "status"; status: RsvpStatus }
  | { kind: "manual_pending" }
  | { kind: "search"; query: string };

export type MenuScreen =
  | { id: "main" }
  | { id: "summary" }
  | { id: "search_prompt" }
  | { id: "add_help" }
  | {
      id: "list";
      filter: ListFilter;
      ids: string[];
      page: number;
    }
  | {
      id: "guest";
      guestId: string;
      /** Snapshot of where we came from for back. */
      from: Exclude<MenuScreen, { id: "guest" }>;
    };

export type OrganizerMenuSession = {
  organizerKey: string;
  screen: MenuScreen;
  stack: MenuScreen[];
  updatedAt: string;
};

type StoreShape = { items: OrganizerMenuSession[] };

function organizerKeyFromPhone(phone: string): string | null {
  return phoneIdentity(phone);
}

function isFresh(item: OrganizerMenuSession, now = Date.now()): boolean {
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

export async function getOrganizerMenuSession(
  organizerPhone: string
): Promise<OrganizerMenuSession | null> {
  const organizerKey = organizerKeyFromPhone(organizerPhone);
  if (!organizerKey) return null;
  const store = await readStore();
  return (
    store.items.find((i) => i.organizerKey === organizerKey && isFresh(i)) ||
    null
  );
}

export async function saveOrganizerMenuSession(
  organizerPhone: string,
  screen: MenuScreen,
  stack: MenuScreen[]
): Promise<OrganizerMenuSession | null> {
  const organizerKey = organizerKeyFromPhone(organizerPhone);
  if (!organizerKey) return null;
  const next: OrganizerMenuSession = {
    organizerKey,
    screen,
    stack,
    updatedAt: new Date().toISOString(),
  };
  const store = await readStore();
  store.items = [
    ...store.items.filter(
      (i) => isFresh(i) && i.organizerKey !== organizerKey
    ),
    next,
  ];
  await writeStore(store);
  return next;
}

export async function clearOrganizerMenuSession(
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

export function isHelpOrMenuOpen(text: string): boolean {
  const t = text.replace(/\r\n/g, "\n").trim().toLowerCase();
  return /^(עזרה|תפריט|menu|help|\?)$/i.test(t);
}

export function isMenuHomeCommand(text: string): boolean {
  const t = text.replace(/\r\n/g, "\n").trim().toLowerCase();
  return /^(9|תפריט|ראשי|תפריט ראשי|home)$/i.test(t);
}

export function isMenuBackCommand(text: string): boolean {
  const t = text.replace(/\r\n/g, "\n").trim().toLowerCase();
  return /^(0|אחורה|חזרה|back)$/i.test(t);
}

export function isMenuExitCommand(text: string): boolean {
  const t = text.replace(/\r\n/g, "\n").trim().toLowerCase();
  return /^(יציאה|סגור|exit|bye)$/i.test(t);
}
