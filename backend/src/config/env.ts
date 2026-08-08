/**
 * Central toggle + config surface for the whole API.
 *
 * Every repository/service that touches persistence branches on
 * `env.ENABLE_DATABASE` here — never at the controller/API layer — so the
 * fake-data path and the real-Postgres path stay behaviorally identical from
 * the client's point of view. This mirrors the pattern used in Ledgerly.
 */
export const env = {
  ENABLE_DATABASE: process.env.ENABLE_DATABASE === 'true',
  BYPASS_AUTH: process.env.BYPASS_AUTH === 'true',
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  JWT_SECRET: process.env.JWT_SECRET ?? 'dev-only-secret-change-me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '7d',
  PORT: Number(process.env.PORT ?? 4000),
};

if (env.BYPASS_AUTH && process.env.NODE_ENV === 'production') {
  throw new Error('BYPASS_AUTH must never be true when NODE_ENV=production');
}
