/**
 * Shared helpers for the database integration suites.
 *
 * The important idea here is `freshDb()`: every suite starts from an empty
 * database, so a test can assert on exact row counts without another suite's
 * leftovers making it pass or fail for the wrong reason.
 */
import { PrismaClient } from '@prisma/client';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module';

/**
 * One shared client for direct assertion. Slower suites (register, invite
 * accept) open their own; the fast ones share this to keep connection churn
 * down.
 */
export const prisma = new PrismaClient();

/** Tables to clear, children first so foreign keys stay satisfied. */
const TABLES = [
  'AuditLog',
  'ShareLink',
  'Session',
  'Invite',
  'CustomerMonthlyValue',
  'Customer',
  'MetricSnapshot',
  'CompanyMembership',
  'Company',
  'User',
] as const;

export async function freshDb() {
  // TRUNCATE ... CASCADE in one statement: it needs no ordering, and CASCADE
  // means a table added later cannot break this list.
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} CASCADE`);
}

export async function makeApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  // Mirrors main.ts. Without the same ValidationPipe these suites would accept
  // payloads that production rejects, and pass anyway. cookieParser is here for
  // the same reason: the refresh token arrives as a cookie, so a session test
  // without this middleware would be testing a request the server never sees.
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  // The same global prefix, including the same exclusions. Without this the
  // suites exercised `/auth/refresh` while the server only ever serves
  // `/api/auth/refresh` - and the refresh cookie's `Path=/api/auth` did not even
  // match the URLs being called, so a routing or cookie-scoping mistake would
  // have passed here and failed in production. The exclusions are the health
  // checks, which stay at the root for orchestrators to probe.
  app.setGlobalPrefix('api', { exclude: ['health', 'health/ready'] });
  await app.init();
  return app;
}

export async function closeApp(app: INestApplication) {
  await app.close();
}

let seq = 0;
/** Unique per call, so suites never collide on the unique email index. */
export function uniqueEmail(prefix = 'user') {
  seq += 1;
  return `${prefix}-${seq}-${process.pid}@example.test`;
}

export const PASSWORD = 'correct-horse-battery-staple-42';

export interface Registered {
  accessToken: string;
  userId: string;
  companyId: string;
  email: string;
  role: string;
}

/** Registers a user (who becomes the company OWNER) and returns usable auth. */
export async function registerOwner(app: INestApplication, email = uniqueEmail('owner'), companyName = 'Test Co'): Promise<Registered> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email, password: PASSWORD, name: 'Test User', companyName })
    .expect(201);

  const membership = res.body.memberships[0] as { companyId: string; role: string } | undefined;
  if (!res.body.accessToken || !membership) {
    throw new Error(`unexpected register response: ${JSON.stringify(res.body)}`);
  }

  return {
    accessToken: res.body.accessToken,
    userId: res.body.user.id,
    companyId: membership.companyId,
    email,
    role: membership.role,
  };
}

export function auth(token: string, companyId?: string) {
  return (req: { set: (k: string, v: string) => void }) => {
    req.set('Authorization', `Bearer ${token}`);
    if (companyId) req.set('X-Company-Id', companyId);
  };
}

/** Absolute first day of the month `monthsAgo` before `from`. */
export function monthStart(monthsAgo: number, from = new Date()): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - monthsAgo, 1));
}
