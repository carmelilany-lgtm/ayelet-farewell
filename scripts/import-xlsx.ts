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
  // Excel serial date (days since 1899-12-30)
  if (typeof value === "number" && Number.isFinite(value) && value > 20000) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const ms = excelEpoch + value * 24 * 60 * 60 * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime()) && d.getFullYear() > 1990) {
      return d.toISOString();
    }
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
  let nextOrder = 0;

  for (const row of body) {
    const fullName = cellStr(row[1]);
    const phoneRaw = row[2];
    const guestCount = parseGuestCount(row[3]);

    if (!fullName || guestCount === null) continue;

    const phone = normalizePhone(phoneRaw as string | number | null);
    if (!phone) {
      console.warn(`Skipping "${fullName}" - invalid phone: ${phoneRaw}`);
      continue;
    }

    const existing = byPhone.get(phone);
    const next: RsvpImportRow = {
      full_name: fullName,
      phone,
      guest_count: guestCount,
      wants_video_blessing: cellStr(row[4]),
      wants_to_speak: cellStr(row[5]),
      excitement: parseExcitement(row[6]),
      notes: cellStr(row[7]),
      imported_at: parseImportedAt(row[0]),
      // Keep first appearance order in the sheet for unique phones
      sheet_order: existing?.sheet_order ?? nextOrder++,
    };

    // Keep the latest row for duplicate phones (e.g. יעל גילעת)
    byPhone.set(phone, next);
  }

  return Array.from(byPhone.values()).sort(
    (a, b) => a.sheet_order - b.sheet_order
  );
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
    `Import done - inserted: ${result.inserted}, updated: ${result.updated}, skipped: ${result.skipped}`
  );

  // Verify every imported phone is findable
  const { getRsvpByPhone } = await import("../lib/store");
  const missing: string[] = [];
  for (const row of rows) {
    const found = await getRsvpByPhone(row.phone);
    if (!found) missing.push(`${row.full_name} (${row.phone})`);
  }
  if (missing.length) {
    console.error("IMPORT VERIFY FAILED — missing phones:");
    missing.forEach((m) => console.error("  -", m));
    process.exit(1);
  }
  console.log(`Import verify OK — all ${rows.length} phones found in store`);
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  /import-xlsx\.(ts|js|mjs|cjs)$/.test(process.argv[1]);

if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
