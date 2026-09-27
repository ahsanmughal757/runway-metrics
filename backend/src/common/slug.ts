import { randomBytes } from 'node:crypto';

/**
 * A company is addressed by slug in URLs, so the name has to be reduced to
 * something safe to put in one. Everything non-alphanumeric collapses to a
 * dash; an empty result (a name in another script, say) falls back to a
 * constant rather than producing an empty, unusable slug.
 */
export function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  return slug || 'company';
}

/**
 * Slugs are unique, and two people can both be called "Acme". Rather than
 * showing a uniqueness error on a perfectly reasonable name, append short
 * random entropy and let the caller retry on the (now vanishingly unlikely)
 * collision.
 */
export function slugWithSuffix(value: string): string {
  return `${slugify(value)}-${randomBytes(3).toString('hex')}`;
}
