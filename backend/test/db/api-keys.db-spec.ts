import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { closeApp, freshDb, makeApp, prisma, registerOwner, type Registered } from './harness';

/**
 * The persistence and tenancy rules for API keys. All of it lives here rather
 * than in a unit spec because the interesting claims are enforced by the
 * database -- the CHECK constraint on scopes, the uniqueness of the hash, the
 * tenant scoping of every query -- and a mocked Prisma asserts only that the
 * code asked the right question, not that the answer was right.
 */
describe('API keys (db)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await freshDb();
    app = await makeApp();
  });

  afterAll(async () => {
    await closeApp(app);
  });

  beforeEach(async () => {
    await freshDb();
  });

  const as = (owner: Registered) => ({ Authorization: `Bearer ${owner.accessToken}`, 'X-Company-Id': owner.companyId });

  // Not async: awaiting here would wrap supertest's Test in a Promise and
  // take .expect() with it, which turns every assertion into a 500.
  function issue(owner: Registered, overrides: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post('/api/companies/api-keys')
      .set(as(owner))
      .send({ name: 'Reporting', scopes: ['metrics:read'], ...overrides });
  }

  describe('creation', () => {
    it('returns the secret exactly once and never stores it', async () => {
      const owner = await registerOwner(app);
      const created = await issue(owner).expect(201);

      const secret = created.body.secret as string;
      expect(secret).toMatch(/^rw_live_[0-9a-f]{32}$/);

      // The claim that matters: the table is not a list of working credentials.
      const row = await prisma.apiKey.findFirstOrThrow({ where: { companyId: owner.companyId } });
      expect(JSON.stringify(row)).not.toContain(secret);
      expect(row.secretHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('stores an indexed prefix that is safe to display', async () => {
      const owner = await registerOwner(app);
      const created = await issue(owner).expect(201);
      const row = await prisma.apiKey.findFirstOrThrow({ where: { companyId: owner.companyId } });

      // 8 for the `rw_live_` marker plus 8 hex characters of the body. Long
      // enough to be recognisable in a list and to be worth indexing, short
      // enough that the prefix reveals nothing the secret-hash does not already
      // protect.
      expect(row.prefix).toBe((created.body.secret as string).slice(0, 16));
      expect(row.prefix.length).toBe(16);
    });

    it('refuses a scope the product does not have', async () => {
      const owner = await registerOwner(app);
      const res = await issue(owner, { scopes: ['metrics:read', 'root:everything'] }).expect(400);

      expect(res.body.message).toContain('root:everything');
    });

    it('refuses a key that could mint more keys', async () => {
      // A key with apiKeys:manage could mint itself a key with every scope,
      // which turns revocation into a race against the attacker.
      const owner = await registerOwner(app);
      await issue(owner, { scopes: ['apiKeys:manage'] }).expect(403);
    });

    it('refuses the constraint even when the application is bypassed', async () => {
      // The CHECK constraint is the backstop for a direct database write or a
      // future script that forgets to call normaliseScopes.
      const owner = await registerOwner(app);
      await expect(
        prisma.apiKey.create({
          data: {
            companyId: owner.companyId,
            name: 'smuggled',
            prefix: `rw_live_${'9'.repeat(8)}`,
            secretHash: '9'.repeat(64),
            scopes: ['apiKeys:manage'],
            createdById: owner.userId,
          },
        }),
      ).rejects.toThrow();
    });

    it('refuses an empty scope list', async () => {
      const owner = await registerOwner(app);
      await issue(owner, { scopes: [] }).expect(400);
    });
  });

  describe('authorisation', () => {
    it('lets an admin issue a key, which is the intended behaviour', async () => {
      // Deliberate, not an oversight: see the ROLE_PERMISSIONS comment in
      // auth/permissions.ts. The test exists so the choice cannot drift.
      const owner = await registerOwner(app);
      const admin = await joinAs(app, owner, 'ADMIN');

      const created = await request(app.getHttpServer())
        .post('/api/companies/api-keys')
        .set(asUser(admin))
        .send({ name: 'Admin key', scopes: ['metrics:read'] })
        .expect(201);

      // And the key they minted works, which is the part that makes the
      // permission parity useful rather than merely granted.
      await request(app.getHttpServer()).get('/api/metrics/dashboard').set({ 'X-Api-Key': created.body.secret }).expect(200);
    });

    it('refuses an analyst, who cannot manage keys', async () => {
      const owner = await registerOwner(app);
      const analyst = await joinAs(app, owner, 'ANALYST');
      // Awaited rather than .expect(403, fn): the status callback runs before
      // superagent has parsed the body, so res.body is still null there.
      const res = await request(app.getHttpServer())
        .post('/api/companies/api-keys')
        .set(asUser(analyst))
        .send({ name: 'nope', scopes: ['metrics:read'] })
        .expect(403);

      // The message names the permission, not the role, so the caller is told
      // what to fix.
      expect(res.body.message).toContain('apiKeys:manage');
    });

    it('refuses a key that tries to manage keys', async () => {
      const owner = await registerOwner(app);
      const created = await issue(owner, { scopes: ['metrics:read', 'reports:read'] }).expect(201);

      await request(app.getHttpServer())
        .get('/api/companies/api-keys')
        .set({ 'X-Api-Key': created.body.secret })
        .expect(403);
    });
  });

  describe('authentication', () => {
    it('accepts a live key on a normal endpoint', async () => {
      const owner = await registerOwner(app);
      const created = await issue(owner, { scopes: ['metrics:read'] }).expect(201);

      await request(app.getHttpServer()).get('/api/metrics/dashboard').set({ 'X-Api-Key': created.body.secret }).expect(200);
    });

    it('refuses a key whose scope does not cover the endpoint', async () => {
      const owner = await registerOwner(app);
      const created = await issue(owner, { scopes: ['metrics:read'] }).expect(201);

      // Scopes are enforced, not just the presence of a key.
      await request(app.getHttpServer()).post('/api/metrics/snapshot').set({ 'X-Api-Key': created.body.secret }).send({}).expect(403);
    });

    it('refuses a revoked key', async () => {
      const owner = await registerOwner(app);
      const created = await issue(owner, { scopes: ['metrics:read'] }).expect(201);

      await request(app.getHttpServer()).delete(`/api/companies/api-keys/${created.body.key.id}`).set(as(owner)).expect(200);
      await request(app.getHttpServer()).get('/api/metrics/dashboard').set({ 'X-Api-Key': created.body.secret }).expect(401);
    });

    it('refuses an expired key', async () => {
      const owner = await registerOwner(app);
      const created = await issue(owner, { scopes: ['metrics:read'] }).expect(201);
      await prisma.apiKey.update({ where: { id: created.body.key.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

      await request(app.getHttpServer()).get('/api/metrics/dashboard').set({ 'X-Api-Key': created.body.secret }).expect(401);
    });

    it('records when a key was last used', async () => {
      const owner = await registerOwner(app);
      const created = await issue(owner, { scopes: ['metrics:read'] }).expect(201);

      await request(app.getHttpServer()).get('/api/metrics/dashboard').set({ 'X-Api-Key': created.body.secret }).expect(200);
      const row = await prisma.apiKey.findUniqueOrThrow({ where: { id: created.body.key.id } });
      expect(row.lastUsedAt).not.toBeNull();
    });

    it('gives the same answer for a wrong secret as for a revoked one', async () => {
      // Otherwise the response distinguishes "nearly right", which is enough to
      // confirm a prefix is real.
      const owner = await registerOwner(app);
      const created = await issue(owner, { scopes: ['metrics:read'] }).expect(201);
      const tampered = `${(created.body.secret as string).slice(0, -1)}0`;

      await request(app.getHttpServer()).get('/api/metrics/dashboard').set({ 'X-Api-Key': tampered }).expect(401);
    });
  });

  describe('tenancy', () => {
    it("cannot list another company's keys", async () => {
      const a = await registerOwner(app, `a-${Date.now()}@example.com`);
      const b = await registerOwner(app, `b-${Date.now()}@example.com`);
      await issue(a, { name: 'A key' }).expect(201);

      const res = await request(app.getHttpServer()).get('/api/companies/api-keys').set(as(b)).expect(200);
      expect(res.body).toHaveLength(0);
    });

    it("cannot revoke another company's key", async () => {
      const a = await registerOwner(app, `a-${Date.now()}@example.com`);
      const b = await registerOwner(app, `b-${Date.now()}@example.com`);
      const created = await issue(a, { name: 'A key' }).expect(201);

      // The id is real, so this is a 404 by scoping rather than by guessing.
      await request(app.getHttpServer()).delete(`/api/companies/api-keys/${created.body.key.id}`).set(as(b)).expect(404);

      const row = await prisma.apiKey.findUniqueOrThrow({ where: { id: created.body.key.id } });
      expect(row.revokedAt).toBeNull();
    });

    it('a key only ever reaches its own company', async () => {
      const a = await registerOwner(app, `a-${Date.now()}@example.com`);
      const b = await registerOwner(app, `b-${Date.now()}@example.com`);
      const keyA = await issue(a, { scopes: ['company:read'] }).expect(201);

      // The X-Company-Id header selects a membership; a key has none to select
      // from, so the header must not move it into another tenant.
      const res = await request(app.getHttpServer())
        .get('/api/companies/settings')
        .set({ 'X-Api-Key': keyA.body.secret, 'X-Company-Id': b.companyId })
        .expect(200);

      expect(res.body.currency).toBe('USD');
      const settings = await prisma.company.findUniqueOrThrow({ where: { id: a.companyId } });
      expect(res.body.runwayGreenMonths).toBe(settings.runwayGreenMonths);
    });
  });

  describe('audit', () => {
    it('records issuance without the secret', async () => {
      const owner = await registerOwner(app);
      const created = await issue(owner, { name: 'Reporting' }).expect(201);

      const row = await prisma.auditLog.findFirstOrThrow({ where: { entityType: 'API_KEY' } });
      expect(row.entityId).toBe(created.body.key.id);
      expect(JSON.stringify(row.diff)).not.toContain(created.body.secret);
    });

    it('records revocation', async () => {
      const owner = await registerOwner(app);
      const created = await issue(owner).expect(201);
      await request(app.getHttpServer()).delete(`/api/companies/api-keys/${created.body.key.id}`).set(as(owner)).expect(200);

      const row = await prisma.auditLog.findFirstOrThrow({ where: { entityType: 'API_KEY', action: 'REVOKED' } });
      expect(row.entityId).toBe(created.body.key.id);
    });
  });
});

/** Joins a company at a role, and returns the credentials to act as them. */
async function joinAs(app: INestApplication, owner: Registered, role: 'ADMIN' | 'ANALYST') {
  const email = `${role.toLowerCase()}-${Date.now()}@example.com`;
  const password = 'correct-horse-battery-staple-42';
  const sent = await request(app.getHttpServer())
    .post('/api/companies/invites')
    .set({ Authorization: `Bearer ${owner.accessToken}`, 'X-Company-Id': owner.companyId })
    .send({ email, role })
    .expect(201);

  // The create response deliberately omits the token -- it is emailed, not
  // returned to the caller -- so read it from the row the way
  // invites.db-spec.ts does.
  const { token } = await prisma.invite.findUniqueOrThrow({ where: { id: sent.body.id as string } });

  // Redeem mints the membership but no session, so sign in as them. Using the
  // owner's token here would test nothing about the role.
  await request(app.getHttpServer()).post('/api/invites/redeem').send({ token, email, password }).expect(201);
  const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password }).expect(200);

  return { accessToken: login.body.accessToken as string, companyId: owner.companyId };
}

const asUser = (u: { accessToken: string; companyId: string }) => ({
  Authorization: `Bearer ${u.accessToken}`,
  'X-Company-Id': u.companyId,
});
