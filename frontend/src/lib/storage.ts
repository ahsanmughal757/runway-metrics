/**
 * Every localStorage key the app owns, in one place.
 *
 * These used to be raw string literals repeated across five call sites in four
 * files - `api.ts`, `AuthContext.tsx` and `CompanyContext.tsx` each carried their
 * own copy of `'runway_token'`. Renaming one then required finding all of them
 * by hand, and missing one produces a silent logout that only shows up in real
 * auth mode. The keys are load-bearing for the session; they are not string
 * literals.
 *
 * The access token is here and the refresh token is not, deliberately: the
 * refresh token is an httpOnly cookie the browser attaches on its own and
 * JavaScript cannot read. See `api.ts`.
 */

export const TOKEN_KEY = 'runway_token';
export const ACTIVE_COMPANY_KEY = 'runway_active_company_id';

/**
 * Demo-mode identity, sent as `X-Demo-*` and honoured by the API only when it is
 * running with `BYPASS_AUTH=true`. There is no company variant of this on
 * purpose: an earlier version read `runway_demo_company_id` from every request
 * and nothing in the app ever wrote it, so the header was dead code that looked
 * like a feature. The persona switcher picks a role; the tenant comes from the
 * session.
 */
export const DEMO_ROLE_KEY = 'runway_demo_role';

/** Reads a key, treating absent and empty as the same thing. */
export function readKey(key: string): string | null {
  const value = localStorage.getItem(key);
  return value ? value : null;
}

export function writeKey(key: string, value: string | null) {
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, value);
}

/**
 * Forgets the session, including the demo role.
 *
 * The demo keys used to survive a sign-out, so switching from the demo to real
 * auth left the last persona's role in localStorage where it would be sent to a
 * production server as a demo header. Harmless while the server ignores it in
 * real mode, which is exactly why it would have survived a long time.
 */
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ACTIVE_COMPANY_KEY);
  localStorage.removeItem(DEMO_ROLE_KEY);
}
