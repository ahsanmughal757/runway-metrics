import type { CookieOptions, Response } from 'express';
import { env, isProduction } from '../config/env';

/**
 * The refresh cookie.
 *
 * httpOnly because its entire purpose is to be unreadable by script: an
 * access token in localStorage is one XSS away from being stolen, and a
 * refresh token is the prize - it mints new access tokens indefinitely, so
 * holding it is equivalent to holding the account.
 *
 * `path` is scoped to the auth routes, so the cookie is not attached to the
 * hundreds of ordinary API calls the SPA makes. That is a meaningful reduction
 * in how many places a token can end up being sent, and it means the public
 * share-link endpoint can never receive it.
 *
 * SameSite=Lax rather than Strict: Strict would drop the cookie when a user
 * follows a link into the app from an email, which is exactly how somebody
 * accepts an invitation or opens a shared dashboard, and they would land
 * apparently-signed-out. Lax still blocks cross-site POST, which is the case
 * that matters for CSRF against these endpoints.
 */
const baseOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction || env.COOKIE_SECURE,
  sameSite: 'lax',
  path: '/api/auth',
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
};

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(env.REFRESH_COOKIE_NAME, token, {
    ...baseOptions,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
  });
}

export function clearRefreshCookie(res: Response): void {
  // The attributes must match the ones used to set it, or the browser keeps the
  // original cookie and the "deletion" silently does nothing.
  res.clearCookie(env.REFRESH_COOKIE_NAME, baseOptions);
}
