/**
 * Email is the login identity, so "Alice@x.com" and "alice@x.com" must not be
 * two accounts. The database refuses unnormalised addresses outright (see the
 * baseline migration), so every write path normalises first and the error
 * surfaces as a clear 400 rather than an opaque constraint violation.
 *
 * Domains are case-insensitive; the local part is treated the same way on
 * purpose. Splitting them is technically more correct for a handful of
 * historical mail systems and produces support tickets about "lost accounts",
 * which is the worse trade.
 */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * class-validator transform for `@Transform`, so `@IsEmail()` sees the same
 * string the service will store.
 *
 * Without this, pasting an address that carries a trailing space or newline -
 * which is what a copied value off a mail client or a spreadsheet cell usually
 * has - fails validation with a bare 400 "email must be an email" even though
 * `normalizeEmail` would have handled it. Normalising at the edge also means a
 * row can never be written that `normalizeEmail` would later change, which is
 * the whole reason the database rejects unnormalised addresses.
 */
export const Trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Lower bound only. Length limits are enforced by the DTOs. */
export function isValidEmail(value: string): boolean {
  // Deliberately permissive: the only authority on whether an address is
  // deliverable is sending to it, and a strict regex here would reject valid
  // addresses while still accepting undeliverable ones.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}
