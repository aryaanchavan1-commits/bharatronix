/**
 * Dodo's checkout only parses strict E.164 (+918857912586). Anything else - a
 * space in the number, a bare 10-digit mobile, a leading 0 - comes back as
 * `customer.phone_number: is invalid (Parse Error)`, which surfaced to the buyer
 * as "Could not start checkout. Please retry in a moment." on a perfectly good
 * order.
 *
 * Returns E.164, "" when there is no phone at all, or null when the input cannot
 * be a phone number (so the caller can say something useful instead of retrying).
 */
export function normalizePhone(value: string | undefined | null): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return "";

  // "088579 12586" -> "8857912586", so a trunk prefix does not look international.
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d{10}$)/, "");

  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`; // Indian mobile
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`; // Indian, already coded
  if (raw.startsWith("+") || raw.startsWith("00")) {
    const international = digits.replace(/^00/, "");
    if (international.length >= 8 && international.length <= 15) return `+${international}`;
  }
  return null;
}
