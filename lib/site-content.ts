import { promises as fs } from "fs";
import path from "path";
import {
  DEFAULT_SITE_CONTENT,
  type SiteContent,
} from "./site-content-defaults";

const DATA_DIR = path.join(process.cwd(), "data");
const CONTENT_FILE = path.join(DATA_DIR, "site-content.json");

function mergeContent(partial: Partial<SiteContent> | null): SiteContent {
  const base = { ...DEFAULT_SITE_CONTENT, ...(partial || {}) };
  return {
    ...base,
    programItems:
      Array.isArray(partial?.programItems) && partial!.programItems!.length
        ? partial!.programItems!.map((s) => String(s).trim()).filter(Boolean)
        : DEFAULT_SITE_CONTENT.programItems,
  };
}

export async function getSiteContent(): Promise<SiteContent> {
  try {
    const raw = await fs.readFile(CONTENT_FILE, "utf8");
    return mergeContent(JSON.parse(raw) as Partial<SiteContent>);
  } catch {
    return { ...DEFAULT_SITE_CONTENT };
  }
}

export async function saveSiteContent(
  input: Partial<SiteContent>
): Promise<SiteContent> {
  const current = await getSiteContent();
  const next = mergeContent({ ...current, ...input });
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(CONTENT_FILE, JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}

export type { SiteContent };
