/**
 * Normalize Israeli phone numbers to digits-only local form (05XXXXXXXX).
 * Accepts formats like 054-1234567, +97254..., 97254..., and numeric Excel values.
 */
export function normalizePhone(input: string | number | null | undefined): string | null {
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

  if (!/^05\d{8}$/.test(digits)) {
    return null;
  }

  return digits;
}

export function formatPhoneDisplay(phone: string): string {
  const n = normalizePhone(phone) ?? phone;
  if (/^05\d{8}$/.test(n)) {
    return `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6)}`;
  }
  return n;
}
