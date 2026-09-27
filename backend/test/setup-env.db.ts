/**
 * Environment for the database-backed integration suites.
 *
 * These are the only tests that talk to a real PostgreSQL server, and they are
 * deliberately the *opposite* of `setup-env.ts`: `ENABLE_DATABASE` and
 * `BYPASS_AUTH` are both on, so the real Prisma repositories, the real tenant
 * resolution and the real permission checks are all in play. The e2e suite
 * bypasses both and therefore cannot catch a schema, migration or query bug -
 * which is exactly the class of bug this phase changed.
 *
 * They run against `runway_test`, never `runway`, so a developer's seeded
 * working data is never truncated by a test run.
 */
process.env.NODE_ENV = 'test';
process.env.RUNWAY_SKIP_DOTENV = 'true';
process.env.ENABLE_DATABASE = 'true';
process.env.BYPASS_AUTH = 'false';
process.env.JWT_SECRET = 'test-secret-not-a-placeholder-0123456789abcdef';
process.env.ACCESS_TOKEN_TTL_SECONDS = '900';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.LOG_LEVEL = 'silent';
process.env.LOG_PRETTY = 'false';
// High enough that the per-route throttlers cannot fail a test for making a
// handful of requests; the throttler itself is covered by its own unit tests.
process.env.RATE_LIMIT_TTL_SECONDS = '60';
process.env.RATE_LIMIT_MAX = '100000';
process.env.AUTH_RATE_LIMIT_MAX = '100000';
process.env.CREDENTIALS_MASTER_KEY = 'test-credentials-master-key-0123456789';

// 127.0.0.1 rather than "localhost": on Windows, Node resolves localhost to
// ::1 first, and Docker's published port is not reliably reachable over the
// IPv6 loopback. The result is an intermittent P1001 on a database that is
// demonstrably up and accepting connections.
const HOST = '127.0.0.1:5432';
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL ?? `postgresql://postgres:postgres@${HOST}/postgres`;
process.env.TEST_DATABASE_NAME = process.env.TEST_DATABASE_NAME ?? 'runway_test';
process.env.DATABASE_URL = `postgresql://postgres:postgres@${HOST}/${process.env.TEST_DATABASE_NAME}`;
process.env.TEST_DATABASE_ADMIN_URL = adminUrl;
