import path from "path";
import * as XLSX from "xlsx";
import { config } from "dotenv";
import { normalizePhone } from "../lib/phone";
import { importRsvps } from "../lib/store";
import type { RsvpImportRow } from "../lib/types";

config({ path: ".env.local" });
config();

const DEFAULT_XLSX =
  "/Users/carmelilany/Downloads/טופס הרשמה למסיבת פרישה (תגובות).xlsx";

function cellStr(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function parseExcitement(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
}

function parseGuestCount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 20) return null;
  return rounded;
}

function parseImportedAt(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

export function parseXlsxToImportRows(filePath: string): RsvpImportRow[] {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(
    sheet,
    { header: 1, defval: null, raw: true }
  );

  // Skip header
  const body = matrix.slice(1);
  const byPhone = new Map<string, RsvpImportRow>();

  for (const row of body) {
    const fullName = cellStr(row[1]);
    const phoneRaw = row[2];
    const guestCount = parseGuestCount(row[3]);

    if (!fullName || guestCount === null) continue;

    const phone = normalizePhone(phoneRaw as string | number | null);
    if (!phone) {
      console.warn(`Skipping "${fullName}" — invalid phone: ${phoneRaw}`);
      continue;
    }

    const next: RsvpImportRow = {
      full_name: fullName,
      phone,
      guest_count: guestCount,
      wants_video_blessing: cellStr(row[4]),
      wants_to_speak: cellStr(row[5]),
      excitement: parseExcitement(row[6]),
      notes: cellStr(row[7]),
      imported_at: parseImportedAt(row[0]),
    };

    // Keep the latest row for duplicate phones (e.g. יעל גילעת)
    byPhone.set(phone, next);
  }

  return Array.from(byPhone.values());
}

async function main() {
  const filePath =
    process.env.IMPORT_XLSX_PATH?.trim() ||
    process.argv[2] ||
    DEFAULT_XLSX;

  const absolute = path.resolve(filePath);
  console.log(`Reading: ${absolute}`);

  const rows = parseXlsxToImportRows(absolute);
  console.log(`Parsed ${rows.length} valid unique guests`);

  const result = await importRsvps(rows);
  console.log(
    `Import done — inserted: ${result.inserted}, updated: ${result.updated}, skipped: ${result.skipped}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
