/**
 * Global setup for the database integration suites.
 *
 * Creates the `runway_test` database if it is missing and brings it to the
 * current migration state, so a clean clone needs nothing but `docker compose up
 * -d postgres` and `pnpm test:db`.
 *
 * `migrate deploy` is used rather than `migrate dev` on purpose: these tests
 * must exercise the committed migrations exactly as production would apply
 * them. `migrate dev` is free to rewrite a migration, which would let a broken
 * migration pass its own test suite.
 */
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';

// 127.0.0.1 rather than "localhost": Node resolves localhost to ::1 first on
// Windows, and Docker's published port is not reliably reachable over the IPv6
// loopback, which shows up as an intermittent P1001 against a database that is
// plainly running. See the same note in setup-env.db.ts.
const HOST = '127.0.0.1:5432';
const DB_NAME = process.env.TEST_DATABASE_NAME ?? 'runway_test';
const DB_URL = `postgresql://postgres:postgres@${HOST}/${DB_NAME}`;
const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? `postgresql://postgres:postgres@${HOST}/postgres`;

export default async function globalSetup() {
  // 1. Make sure the database exists. Connecting to `postgres` (the maintenance
  //    database, which always exists) and issuing CREATE DATABASE is more
  //    portable than shelling out to createdb or psql.
  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });
  try {
    const existing = await admin.$queryRaw<{ datname: string }[]>`
      SELECT datname FROM pg_database WHERE datname = ${DB_NAME}
    `;
    if (existing.length === 0) {
      // CREATE DATABASE cannot be parameterised or run inside a transaction, so
      // the name is interpolated. It is not user input: it is a fixed default
      // that a developer may override, never anything from a request.
      await admin.$executeRawUnsafe(`CREATE DATABASE "${DB_NAME.replace(/"/g, '""')}"`);
      process.stdout.write(`[db-tests] created database ${DB_NAME}\n`);
    }
  } finally {
    await admin.$disconnect();
  }

  // 2. Apply migrations.
  //
  // The Prisma CLI is invoked through `process.execPath` and its resolved entry
  // point rather than through `npx`, because `npx` is a shell script (npx.cmd on
  // Windows) and execFileSync does not resolve it without a shell. Going
  // straight to the JS entry point is portable and skips a process spawn.
  const prismaCli = require.resolve('prisma/build/index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
  });
}
