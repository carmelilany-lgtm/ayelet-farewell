import { promises as fs } from "fs";
import path from "path";
import {
  DEFAULT_SITE_CONTENT,
  normalizeProgramItems,
  type SiteContent,
} from "./site-content-defaults";
import { getSupabaseAdmin, hasSupabaseConfig } from "./supabase";

const DATA_DIR = path.join(process.cwd(), "data");
const CONTENT_FILE = path.join(DATA_DIR, "site-content.json");

function mergeContent(partial: Partial<SiteContent> | null): SiteContent {
  const base = { ...DEFAULT_SITE_CONTENT, ...(partial || {}) };
  return {
    ...base,
    programItems: normalizeProgramItems(
      partial?.programItems ?? DEFAULT_SITE_CONTENT.programItems
    ),
  };
}

async function readLocal(): Promise<SiteContent> {
  try {
    const raw = await fs.readFile(CONTENT_FILE, "utf8");
    return mergeContent(JSON.parse(raw) as Partial<SiteContent>);
  } catch {
    return { ...DEFAULT_SITE_CONTENT };
  }
}

async function writeLocal(content: SiteContent): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(CONTENT_FILE, JSON.stringify(content, null, 2) + "\n", "utf8");
}

export async function getSiteContent(): Promise<SiteContent> {
  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabaseAdmin()
      .from("site_content")
      .select("content")
      .eq("id", "main")
      .maybeSingle();
    if (error) throw error;
    return mergeContent((data?.content as Partial<SiteContent>) || null);
  }
  return readLocal();
}

export async function saveSiteContent(
  input: Partial<SiteContent>
): Promise<SiteContent> {
  const current = await getSiteContent();
  const next = mergeContent({ ...current, ...input });

  if (hasSupabaseConfig()) {
    const { error } = await getSupabaseAdmin().from("site_content").upsert({
      id: "main",
      content: next,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return next;
  }

  await writeLocal(next);
  return next;
}

export type { SiteContent };
