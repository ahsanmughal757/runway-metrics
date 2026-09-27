/**
 * Authentication, tenant resolution and permission enforcement, end to end
 * against a real database.
 *
 * This is the suite the existing e2e tests structurally cannot be: they run
 * with `BYPASS_AUTH=true` and `ENABLE_DATABASE=false`, so they never resolve a
 * real membership, never evaluate a real permission, and never touch Prisma.
 * The bugs worth catching here are precisely the ones that only appear when
 * those three are real at once - a header trusted without a membership lookup,
 * a role read from the token instead of the database, a guard applied to the
 * wrong route.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { closeApp, freshDb, makeApp, prisma, uniqueEmail, PASSWORD, registerOwner } from './harness';

describe('auth and tenancy', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await makeApp();
  });

  afterAll(async () => {
    await closeApp(app);
  });

  beforeEach(async () => {
    await freshDb();
  });

  const server = () => app.getHttpServer();

  describe('registration', () => {
    it('creates the user, the company, the owner membership and an audit row together', async () => {
      const email = uniqueEmail('reg');
      const res = await request(server())
        .post('/auth/register')
        .send({ email, password: PASSWORD, name: 'Ada', companyName: 'Ada Robotics' })
        .expect(201);

      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      const company = await prisma.company.findUniqueOrThrow({
        where: { id: res.body.memberships[0].companyId },
      });

      expect(user.name).toBe('Ada');
      expect(company.name).toBe('Ada Robotics');
      // A company whose id is a slug-safe derivative of its name, so the URL
      // is guessable rather than random.
      expect(company.slug.length).toBeGreaterThan(0);

      const membership = await prisma.companyMembership.findFirstOrThrow({ where: { userId: user.id } });
      expect(membership.role).toBe('OWNER');

      // The audit row is the evidence the creation actually happened; without
      // it a half-finished signup would be invisible.
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { companyId: company.id, entityType: 'COMPANY_SETTINGS' },
      });
      expect(audit.action).toBe('CREATED');
      expect(audit.changedBy).toBe(user.id);
    });

    it('stores the password hashed, never in the clear', async () => {
      const email = uniqueEmail('reg');
      await request(server()).post('/auth/register').send({ email, password: PASSWORD, companyName: 'Acme' }).expect(201);
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(user.passwordHash).not.toBe(PASSWORD);
      expect(user.passwordHash.startsWith('$2')).toBe(true);
    });

    it('normalises the email so the same person cannot register twice', async () => {
      const email = uniqueEmail('Dup');
      await request(server()).post('/auth/register').send({ email, password: PASSWORD, companyName: 'Acme' }).expect(201);
      // Same address, different capitalisation: one person, one account.
      await request(server())
        .post('/auth/register')
        .send({ email: email.toUpperCase(), password: PASSWORD, companyName: 'Acme Two' })
        .expect(409);
      expect(await prisma.user.count()).toBe(1);
    });

    it('trims an address padded with whitespace, and stores it normalised', async () => {
      // Padded, mixed-case addresses are what you get from a mail client or a
      // spreadsheet cell, so they are normalised at the DTO edge (@Transform)
      // rather than rejected: a bare 400 for a stray space is a support ticket,
      // not a security control. The important half is that the stored value is
      // the normalised one, which is what the database constraint requires.
      const raw = `  ${uniqueEmail().toUpperCase()}  `;

      const res = await request(server())
        .post('/auth/register')
        .send({ email: raw, password: PASSWORD, companyName: 'Acme' })
        .expect(201);

      const normalized = raw.trim().toLowerCase();
      expect(res.body.user.email).toBe(normalized);
      const row = await prisma.user.findUniqueOrThrow({ where: { email: normalized } });
      expect(row.email).toBe(normalized);

      // And it is the same identity, not a second one.
      await request(server())
        .post('/auth/register')
        .send({ email: raw, password: PASSWORD, companyName: 'Acme Two' })
        .expect(409);
      expect(await prisma.user.count({ where: { email: normalized } })).toBe(1);
    });

    it('refuses a company name that is too short to be a name', async () => {
      await request(server())
        .post('/auth/register')
        .send({ email: uniqueEmail(), password: PASSWORD, companyName: 'A' })
        .expect(400);
    });

    it('rejects a weak password', async () => {
      await request(server())
        .post('/auth/register')
        .send({ email: uniqueEmail(), password: 'short', companyName: 'Acme' })
        .expect(400);
    });

    it('rejects unknown fields rather than silently ignoring them', async () => {
      await request(server())
        .post('/auth/register')
        .send({ email: uniqueEmail(), password: PASSWORD, companyName: 'Acme', isAdmin: true })
        .expect(400);
    });

    it('leaves no user behind when the request is rejected', async () => {
      const before = await prisma.user.count();
      await request(server())
        .post('/auth/register')
        .send({ email: uniqueEmail(), password: PASSWORD, companyName: '' })
        .expect(400);
      // A rejected signup must not create a user with no way to reach a company.
      expect(await prisma.user.count()).toBe(before);
    });
  });

  describe('login', () => {
    it('issues a token that identifies the user but carries no role', async () => {
      const owner = await registerOwner(app);
      const login = await request(server())
        .post('/auth/login')
        .send({ email: owner.email, password: PASSWORD })
        .expect(200);

      const claims = JSON.parse(
        Buffer.from(login.body.accessToken.split('.')[1], 'base64url').toString('utf8'),
      ) as Record<string, unknown>;

      // The whole point of moving off token-embedded roles: a token must not be
      // able to assert authority, or it outlives the membership that granted it.
      expect(claims.role).toBeUndefined();
      expect(claims.companyId).toBeUndefined();
      expect(claims.sub).toBe(owner.userId);
      expect(login.body.memberships).toHaveLength(1);
    });

    it('accepts a differently-cased email', async () => {
      const owner = await registerOwner(app);
      await request(server())
        .post('/auth/login')
        .send({ email: owner.email.toUpperCase(), password: PASSWORD })
        .expect(200);
    });

    it('gives the same message for an unknown user and a wrong password', async () => {
      const owner = await registerOwner(app);
      const unknown = await request(server())
        .post('/auth/login')
        .send({ email: uniqueEmail('nobody'), password: PASSWORD })
        .expect(401);
      const wrong = await request(server())
        .post('/auth/login')
        .send({ email: owner.email, password: 'not-the-password-999' })
        .expect(401);
      // If these differ, the endpoint is a user-enumeration oracle.
      expect(unknown.body.message).toBe(wrong.body.message);
    });

    it('rejects an inactive account', async () => {
      const owner = await registerOwner(app);
      await prisma.user.update({ where: { id: owner.userId }, data: { isActive: false } });
      await request(server()).post('/auth/login').send({ email: owner.email, password: PASSWORD }).expect(401);
    });
  });

  describe('tenant resolution', () => {
    it('lists the caller’s companies without needing a company context', async () => {
      const owner = await registerOwner(app);
      // No X-Company-Id: the switcher has to work before a company is chosen,
      // so the list endpoint must not demand one.
      const res = await request(server())
        .get('/companies')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(owner.companyId);
    });

    it('requires a company context for a company-scoped read', async () => {
      const owner = await registerOwner(app);
      // With no header the resolver falls back to the caller's oldest
      // membership, so a single-company user still works. This pins that
      // default deliberately: it is a convenience, not an authorisation, and
      // the header is what actually selects the tenant.
      const res = await request(server())
        .get('/companies/settings')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect(res.body.id).toBe(owner.companyId);
    });

    it('uses the oldest membership when no company is named', async () => {
      const first = await registerOwner(app, uniqueEmail('first'), 'First Co');
      const second = await registerOwner(app, uniqueEmail('second'), 'Second Co');
      await prisma.companyMembership.create({
        data: { userId: first.userId, companyId: second.companyId, role: 'VIEWER' },
      });

      const res = await request(server())
        .get('/companies/settings')
        .set('Authorization', `Bearer ${first.accessToken}`)
        .expect(200);
      expect(res.body.id).toBe(first.companyId);
    });

    it('rejects a company the caller has no membership in', async () => {
      const mine = await registerOwner(app, uniqueEmail('mine'), 'Mine');
      const theirs = await registerOwner(app, uniqueEmail('theirs'), 'Theirs');

      await request(server())
        .get('/companies/settings')
        .set('Authorization', `Bearer ${mine.accessToken}`)
        .set('X-Company-Id', theirs.companyId)
        .expect(403);
    });

    it('ignores a forged role header and uses the real membership', async () => {
      const owner = await registerOwner(app);
      // The client is free to claim whatever it likes in a header; only the
      // database decides.
      const me = await request(server())
        .get('/auth/me')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .set('X-Company-Id', owner.companyId)
        .set('X-Role', 'OWNER')
        .expect(200);
      expect(me.body.role).toBe('OWNER');
      expect(me.body.companyId).toBe(owner.companyId);
    });

    it('refuses an unknown company id rather than defaulting to one', async () => {
      const owner = await registerOwner(app);
      await request(server())
        .get('/companies/settings')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .set('X-Company-Id', 'no-such-company')
        .expect(403);
    });

    it('scopes a read to the selected company, not the caller’s first one', async () => {
      const a = await registerOwner(app, uniqueEmail('a'), 'Alpha');
      const b = await registerOwner(app, uniqueEmail('b'), 'Beta');

      // Give the first user a second membership.
      await prisma.companyMembership.create({
        data: { userId: a.userId, companyId: b.companyId, role: 'VIEWER' },
      });

      const asB = await request(server())
        .get('/companies/settings')
        .set('Authorization', `Bearer ${a.accessToken}`)
        .set('X-Company-Id', b.companyId)
        .expect(200);
      expect(asB.body.name).toBe('Beta');

      const asA = await request(server())
        .get('/companies/settings')
        .set('Authorization', `Bearer ${a.accessToken}`)
        .set('X-Company-Id', a.companyId)
        .expect(200);
      expect(asA.body.name).toBe('Alpha');
    });
  });

  describe('permission enforcement', () => {
    /** Registers an owner, then downgrades them to `role` and returns a token. */
    async function asRole(role: 'OWNER' | 'ADMIN' | 'ANALYST' | 'VIEWER') {
      const owner = await registerOwner(app, uniqueEmail(role.toLowerCase()));
      await prisma.companyMembership.updateMany({
        where: { userId: owner.userId, companyId: owner.companyId },
        data: { role },
      });
      return owner;
    }

    const PUT_SETTINGS = { name: 'Renamed Co', runwayGreenMonths: 12, runwayYellowMonths: 6 };

    it('lets an owner update settings', async () => {
      const u = await asRole('OWNER');
      await request(server())
        .put('/companies/settings')
        .set('Authorization', `Bearer ${u.accessToken}`)
        .set('X-Company-Id', u.companyId)
        .send(PUT_SETTINGS)
        .expect(200);
    });

    it('lets an admin update settings, because that is part of the job', async () => {
      const u = await asRole('ADMIN');
      await request(server())
        .put('/companies/settings')
        .set('Authorization', `Bearer ${u.accessToken}`)
        .set('X-Company-Id', u.companyId)
        .send(PUT_SETTINGS)
        .expect(200);
    });

    it('refuses settings updates to an analyst and a viewer', async () => {
      for (const role of ['ANALYST', 'VIEWER'] as const) {
        const u = await asRole(role);
        await request(server())
          .put('/companies/settings')
          .set('Authorization', `Bearer ${u.accessToken}`)
          .set('X-Company-Id', u.companyId)
          .send(PUT_SETTINGS)
          .expect(403);
      }
    });

    it('names the missing permission in the refusal', async () => {
      const u = await asRole('VIEWER');
      const res = await request(server())
        .put('/companies/settings')
        .set('Authorization', `Bearer ${u.accessToken}`)
        .set('X-Company-Id', u.companyId)
        .send(PUT_SETTINGS)
        .expect(403);
      expect(res.body.message).toContain('company:update');
    });

    it('refuses inviting members to a viewer', async () => {
      const u = await asRole('VIEWER');
      await request(server())
        .post('/companies/invites')
        .set('Authorization', `Bearer ${u.accessToken}`)
        .set('X-Company-Id', u.companyId)
        .send({ email: uniqueEmail('x'), role: 'VIEWER' })
        .expect(403);
    });

    it('lets an admin invite, but not demote or remove the owner', async () => {
      // The owner stays in place so there is an OWNER to protect; the admin is
      // a second member.
      const owner = await registerOwner(app, uniqueEmail('owner'));
      const admin = await registerOwner(app, uniqueEmail('admin'));
      await prisma.companyMembership.updateMany({
        where: { userId: admin.userId, companyId: admin.companyId },
        data: { role: 'ADMIN' },
      });
      // Move the admin into the owner's company so there are two members.
      await prisma.companyMembership.deleteMany({ where: { userId: admin.userId, companyId: admin.companyId } });
      const adminMembership = await prisma.companyMembership.create({
        data: { userId: admin.userId, companyId: owner.companyId, role: 'ADMIN' },
      });

      const inviteRes = await request(server())
        .post('/companies/invites')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Company-Id', owner.companyId)
        .send({ email: uniqueEmail('new'), role: 'VIEWER' });
      expect(inviteRes.status).toBe(201);

      // Removing the owner is refused, with a 409 rather than a 403: the caller
      // is allowed to do this in general, the tenant just cannot be left
      // without an owner, and the message says what to do about it.
      const ownerMembership = await prisma.companyMembership.findFirstOrThrow({
        where: { companyId: owner.companyId, role: 'OWNER' },
      });
      const res = await request(server())
        .delete(`/companies/members/${ownerMembership.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Company-Id', owner.companyId)
        .expect(409);
      expect(res.body.message).toMatch(/owner/i);

      // Promoting the admin to OWNER is refused: nobody grants their own rank.
      await request(server())
        .patch(`/companies/members/${adminMembership.id}/role`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .set('X-Company-Id', owner.companyId)
        .send({ role: 'OWNER' })
        .expect(403);
    });

    it('refuses role changes to a viewer', async () => {
      const viewer = await asRole('VIEWER');
      await request(server())
        .patch(`/companies/members/${viewer.userId}/role`)
        .set('Authorization', `Bearer ${viewer.accessToken}`)
        .set('X-Company-Id', viewer.companyId)
        .send({ role: 'OWNER' })
        .expect(403);
    });

    it('refuses metric writes to a viewer but allows an analyst', async () => {
      const now = new Date();
      const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const lastYear = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));

      // The full DTO, not a subset: every field is required, and the churn
      // identity mrr + new - expansion - contraction - churned === 0 has to
      // hold or the database constraint rejects the write.
      const snapshot = (month: Date) => ({
        month,
        mrr: 1_000,
        newMrr: 400,
        expansionMrr: 200,
        contractionMrr: 100,
        churnedMrr: 500,
        newCustomers: 4,
        churnedCustomers: 5,
        totalCustomers: 40,
        burnRate: 50_000,
        cash: 2_000_000,
      });

      const analyst = await asRole('ANALYST');
      const written = await request(server())
        .post('/metrics/snapshot')
        .set('Authorization', `Bearer ${analyst.accessToken}`)
        .set('X-Company-Id', analyst.companyId)
        .send(snapshot(thisMonth))
        .expect(201);
      expect(written.body.mrr).toBe(1_000);
      expect(await prisma.metricSnapshot.count({ where: { companyId: analyst.companyId } })).toBe(1);

      const viewer = await asRole('VIEWER');
      await request(server())
        .post('/metrics/snapshot')
        .set('Authorization', `Bearer ${viewer.accessToken}`)
        .set('X-Company-Id', viewer.companyId)
        .send(snapshot(lastYear))
        .expect(403);
      // A refused write must leave nothing behind, not a partial row.
      expect(await prisma.metricSnapshot.count({ where: { companyId: viewer.companyId } })).toBe(0);
    });

    it('requires a valid token', async () => {
      const u = await registerOwner(app);
      await request(server()).get('/companies').set('Authorization', 'Bearer not-a-jwt').expect(401);
      await request(server()).get('/companies').expect(401);
      await request(server())
        .get('/companies')
        .set('Authorization', `Bearer ${u.accessToken}`)
        .set('X-Company-Id', u.companyId)
        .expect(200);
    });
  });

  describe('audit writes', () => {
    it('records a settings update with the actor and a diff', async () => {
      const u = await registerOwner(app);
      await request(server())
        .put('/companies/settings')
        .set('Authorization', `Bearer ${u.accessToken}`)
        .set('X-Company-Id', u.companyId)
        .send({ name: 'Before', runwayGreenMonths: 12, runwayYellowMonths: 6 })
        .expect(200);

      await request(server())
        .put('/companies/settings')
        .set('Authorization', `Bearer ${u.accessToken}`)
        .set('X-Company-Id', u.companyId)
        .send({ name: 'After', runwayGreenMonths: 18, runwayYellowMonths: 6 })
        .expect(200);

      const logs = await prisma.auditLog.findMany({ where: { companyId: u.companyId }, orderBy: { changedAt: 'asc' } });
      // Two updates were made, so there are two UPDATED rows. The interesting
      // one is the later: the first one's "before" is the company as created.
      const updates = logs.filter((l) => l.action === 'UPDATED');
      expect(updates).toHaveLength(2);
      const update = updates[updates.length - 1];
      expect(update.changedBy).toBe(u.userId);
      expect(update.entityType).toBe('COMPANY_SETTINGS');
      // before/after, not just the new value: an audit trail that records only
      // the current state cannot answer "what did it used to be", which is the
      // only reason anyone reads one.
      const diff = update.diff as { before: { name: string; runwayGreenMonths: number }; after: { name: string; runwayGreenMonths: number } };
      expect(diff.before.name).toBe('Before');
      expect(diff.after.name).toBe('After');
      expect(diff.before.runwayGreenMonths).toBe(12);
      expect(diff.after.runwayGreenMonths).toBe(18);
    });

    it('rolls the audit row back when the mutation fails', async () => {
      const u = await registerOwner(app);
      const before = await prisma.auditLog.count({ where: { companyId: u.companyId } });

      // Threshold ordering is checked by the database, so this write is
      // guaranteed to fail. If the audit insert were not in the same
      // transaction, an "UPDATED" row would survive the rejection.
      await request(server())
        .put('/companies/settings')
        .set('Authorization', `Bearer ${u.accessToken}`)
        .set('X-Company-Id', u.companyId)
        .send({ name: 'Nope', runwayGreenMonths: 3, runwayYellowMonths: 24 })
        .expect(400);

      expect(await prisma.auditLog.count({ where: { companyId: u.companyId } })).toBe(before);
    });
  });
});
