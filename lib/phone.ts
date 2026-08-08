/**
 * Normalize Israeli phone numbers to digits-only local form (05XXXXXXXX).
 * Accepts formats like 054-1234567, +97254..., 97254..., and numeric Excel values.
 */
export function normalizePhone(
  input: string | number | null | undefined
): string | null {
  if (input === null || input === undefined) return null;

  let raw = String(input).trim();
  if (!raw) return null;

  // Excel sometimes stores phones as numbers (e.g. 545495658)
  if (/^\d+(\.0+)?$/.test(raw)) {
    raw = raw.replace(/\.0+$/, "");
  }

  let digits = raw.replace(/\D/g, "");

  if (digits.startsWith("972")) {
    digits = "0" + digits.slice(3);
  }

  // Missing leading 0 for 9-digit mobiles (e.g. 545495658)
  if (digits.length === 9 && digits.startsWith("5")) {
    digits = "0" + digits;
  }

  if (!isValidIsraeliMobile(digits)) {
    return null;
  }

  return digits;
}

/** Israeli mobile: 05X + 7 digits (10 total). */
export function isValidIsraeliMobile(digits: string): boolean {
  return /^05[0-9]\d{7}$/.test(digits);
}

/** Last 9 digits — stable identity across 0 / 972 / formatting differences. */
export function phoneIdentity(
  input: string | number | null | undefined
): string | null {
  const normalized = normalizePhone(input);
  if (normalized) return normalized.slice(-9);
  const digits = String(input ?? "").replace(/\D/g, "");
  if (digits.length >= 9) return digits.slice(-9);
  return null;
}

export function phonesMatch(
  a: string | number | null | undefined,
  b: string | number | null | undefined
): boolean {
  const ia = phoneIdentity(a);
  const ib = phoneIdentity(b);
  return Boolean(ia && ib && ia === ib);
}

/** Client/server friendly validation message, or null if ok. */
export function phoneValidationError(
  input: string | number | null | undefined
): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return "נא להזין מספר טלפון";

  const digitsOnly = raw.replace(/\D/g, "");
  if (digitsOnly.length < 9) {
    return "מספר הטלפון קצר מדי. הזינו מספר נייד ישראלי מלא";
  }
  if (digitsOnly.length > 12) {
    return "מספר הטלפון ארוך מדי";
  }

  if (!normalizePhone(raw)) {
    return "מספר טלפון לא תקין. השתמשו במספר נייד ישראלי, למשל 05X-XXXXXXX";
  }

  return null;
}

export function formatPhoneDisplay(phone: string): string {
  const n = normalizePhone(phone) ?? phone;
  if (/^05\d{8}$/.test(n)) {
    return `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6)}`;
  }
  return n;
}
