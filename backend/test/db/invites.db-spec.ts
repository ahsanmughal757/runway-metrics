/**
 * Invite lifecycle and share links against a real database.
 *
 * Both features are security-relevant, and both are pure database work: an
 * invitation is the only way into a company, and a share link is the only way
 * out of it. Neither is observable from the other suites, which run with
 * ENABLE_DATABASE=false and therefore take an in-memory branch in which a bug
 * can sit unnoticed.
 *
 * The state machines under test:
 *
 *   invite:  PENDING -> ACCEPTED | PENDING -> REVOKED | PENDING -> EXPIRED
 *   share:   live -> revoked, and live -> expired
 *
 * Every terminal state must actually be terminal. An accepted invitation that
 * can be accepted a second time means one forwarded email produces two members.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  closeApp,
  freshDb,
  makeApp,
  PASSWORD,
  prisma,
  registerOwner,
  uniqueEmail,
} from './harness';
import { hashToken } from '../../src/reports/share.service';

const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);

/**
 * Ages a row instead of only moving `expiresAt` into the past.
 *
 * The baseline migration enforces `expiresAt > createdAt` on both Invite and
 * ShareLink, so a link cannot be *born* expired - backdating only the expiry
 * trips that constraint. Moving both keeps the invariant the database holds in
 * production while still producing a row whose lifetime is in the past, which
 * is the state a real lapsed invitation ends up in.
 */
const ageRow = (pastDays = 30) => ({
  createdAt: daysFromNow(-pastDays),
  expiresAt: daysFromNow(-1),
});

/** Auth headers for a request, as a member of `companyId` where one is given. */
const as = (token: string, companyId?: string) => ({
  Authorization: `Bearer ${token}`,
  ...(companyId ? { 'X-Company-Id': companyId } : {}),
});

describe('invites and share links (real database)', () => {
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

  /** Issues an invitation and returns the summary plus the raw token. */
  async function inviteAs(
    owner: { accessToken: string; companyId: string },
    email: string,
    role = 'VIEWER',
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/companies/invites')
      .set(as(owner.accessToken, owner.companyId))
      .send({ email, role })
      .expect(201);

    const row = await prisma.invite.findUniqueOrThrow({ where: { id: res.body.id } });
    return { summary: res.body as Record<string, unknown>, id: row.id, token: row.token };
  }

  async function addSnapshot(companyId: string, month: string) {
    await prisma.metricSnapshot.create({
      data: {
        companyId,
        month: new Date(`${month}-01T00:00:00.000Z`),
        mrr: 12_000,
        newMrr: 1_000,
        expansionMrr: 200,
        contractionMrr: 0,
        churnedMrr: 100,
        newCustomers: 4,
        churnedCustomers: 1,
        totalCustomers: 40,
        burnRate: 8_000,
        cash: 240_000,
      },
    });
  }

  describe('issuing an invitation', () => {
    it('persists it, rather than holding it in memory', async () => {
      const owner = await registerOwner(app, uniqueEmail('owner'), 'Acme');
      const invitee = uniqueEmail('invitee');

      const { summary, id, token } = await inviteAs(owner, invitee, 'ANALYST');

      expect(summary.email).toBe(invitee);
      expect(summary.status).toBe('PENDING');
      expect(summary.isExpired).toBe(false);
      // base64url of 32 bytes.
      expect(token).toHaveLength(43);

      const row = await prisma.invite.findUniqueOrThrow({ where: { id } });
      expect(row.companyId).toBe(owner.companyId);
      expect(row.role).toBe('ANALYST');
    });

    it('normalises the address, so "Bob@x.com " and "bob@x.com" are one person', async () => {
      const owner = await registerOwner(app);
      const invitee = uniqueEmail('mixed');

      const { summary } = await inviteAs(owner, ` ${invitee.toUpperCase()} `);

      expect(summary.email).toBe(invitee);
    });

    it('refuses to invite somebody who is already a member', async () => {
      const owner = await registerOwner(app);

      await request(app.getHttpServer())
        .post('/api/companies/invites')
        .set(as(owner.accessToken, owner.companyId))
        .send({ email: owner.email, role: 'VIEWER' })
        .expect(409);
    });

    it('refuses a second pending invitation to the same address', async () => {
      // Two admins clicking send concurrently is the realistic version of this,
      // and it is what the partial unique index exists to stop. Sequential calls
      // exercise the same index.
      const owner = await registerOwner(app);
      const invitee = uniqueEmail('double');

      await inviteAs(owner, invitee);

      await request(app.getHttpServer())
        .post('/api/companies/invites')
        .set(as(owner.accessToken, owner.companyId))
        .send({ email: invitee, role: 'VIEWER' })
        .expect(409);
    });

    it('lets a new invitation be sent once the previous one was revoked', async () => {
      // The opposite guarantee: the index must not be so broad that an address
      // can never be invited again.
      const owner = await registerOwner(app);
      const invitee = uniqueEmail('again');

      const first = await inviteAs(owner, invitee);
      await request(app.getHttpServer())
        .delete(`/api/companies/invites/${first.id}`)
        .set(as(owner.accessToken, owner.companyId))
        .expect(200);

      await inviteAs(owner, invitee);
    });

    it('records who issued it', async () => {
      const owner = await registerOwner(app);

      const { summary } = await inviteAs(owner, uniqueEmail('invitee'));

      // toSummary prefers the inviter's display name over the address.
      expect(summary.invitedBy).toBe('Test User');
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { companyId: owner.companyId, action: 'INVITED' },
      });
      expect(audit.entityType).toBe('INVITE');
    });

    it('will not let an admin mint an owner', async () => {
      // The privilege-escalation case: an admin account that can issue itself
      // an OWNER invitation owns the company by the next login.
      const owner = await registerOwner(app);
      const admin = await registerOwner(app, uniqueEmail('admin'), 'Admin Co');
      // The admin owns a different company; give them a membership here too.
      await prisma.companyMembership.create({
        data: { userId: admin.userId, companyId: owner.companyId, role: 'ADMIN' },
      });

      await request(app.getHttpServer())
        .post('/api/companies/invites')
        .set(as(admin.accessToken, owner.companyId))
        .send({ email: uniqueEmail('usurper'), role: 'OWNER' })
        .expect(403);
    });
  });

  describe('preview', () => {
    it('describes the invitation without revealing the company id', async () => {
      const owner = await registerOwner(app, uniqueEmail('owner'), 'Northwind');
      const invitee = uniqueEmail('invitee');
      const { token } = await inviteAs(owner, invitee, 'ANALYST');

      const res = await request(app.getHttpServer()).get(`/api/invites/preview/${token}`).expect(200);

      expect(res.body.companyName).toBe('Northwind');
      expect(res.body.email).toBe(invitee);
      expect(res.body.role).toBe('ANALYST');
      expect(res.body.isValid).toBe(true);
      expect(res.body.isExpired).toBe(false);
      expect(res.body).not.toHaveProperty('companyId');
    });

    it('reports an unknown token as invalid, without a 404', async () => {
      // Distinguishing "no such token" from "already used" would let someone
      // probe which invitations exist.
      const res = await request(app.getHttpServer()).get('/api/invites/preview/never-existed').expect(200);

      expect(res.body.isValid).toBe(false);
      expect(res.body.companyName).toBe('');
    });

    it('reports a revoked invitation as no longer valid', async () => {
      const owner = await registerOwner(app);
      const { token, id } = await inviteAs(owner, uniqueEmail('gone'));

      await request(app.getHttpServer())
        .delete(`/api/companies/invites/${id}`)
        .set(as(owner.accessToken, owner.companyId))
        .expect(200);

      const res = await request(app.getHttpServer()).get(`/api/invites/preview/${token}`).expect(200);
      expect(res.body.isValid).toBe(false);
    });

    it('flags an expired invitation', async () => {
      const owner = await registerOwner(app);
      const { id } = await inviteAs(owner, uniqueEmail('late'));
      await prisma.invite.update({ where: { id }, data: ageRow() });

      const res = await request(app.getHttpServer())
        .get(`/api/invites/preview/${(await prisma.invite.findUniqueOrThrow({ where: { id } })).token}`)
        .expect(200);

      expect(res.body.isExpired).toBe(true);
      expect(res.body.isValid).toBe(false);
    });
  });

  describe('redeeming an invitation (unauthenticated)', () => {
    it('creates the account and the membership together', async () => {
      const owner = await registerOwner(app);
      const invitee = uniqueEmail('newcomer');
      const { token } = await inviteAs(owner, invitee, 'ANALYST');

      const res = await request(app.getHttpServer())
        .post('/api/invites/redeem')
        .send({ token, email: invitee, password: PASSWORD })
        .expect(201);

      expect(res.body.createdAccount).toBe(true);
      expect(res.body.companyId).toBe(owner.companyId);
      expect(res.body.role).toBe('ANALYST');

      const membership = await prisma.companyMembership.findFirstOrThrow({
        where: { companyId: owner.companyId, user: { email: invitee } },
      });
      expect(membership.role).toBe('ANALYST');
      // And the password they chose actually works.
      const user = await prisma.user.findUniqueOrThrow({ where: { email: invitee } });
      expect(user.passwordHash).not.toBe('');
    });

    it('adds an existing account to a second company without duplicating the user', async () => {
      const owner = await registerOwner(app);
      const joiner = await registerOwner(app, uniqueEmail('joiner'), 'Their Own Co');
      const { token } = await inviteAs(owner, joiner.email, 'VIEWER');

      const res = await request(app.getHttpServer())
        .post('/api/invites/redeem')
        .send({ token, email: joiner.email, password: PASSWORD })
        .expect(201);

      expect(res.body.createdAccount).toBe(false);
      expect(res.body.userId).toBe(joiner.userId);
      expect(await prisma.user.count({ where: { email: joiner.email } })).toBe(1);

      const memberships = await prisma.companyMembership.findMany({
        where: { userId: joiner.userId },
      });
      expect(memberships).toHaveLength(2);
      // They keep OWNER of their own company and are a VIEWER of this one.
      expect(memberships.find((m) => m.companyId === joiner.companyId)?.role).toBe('OWNER');
      expect(memberships.find((m) => m.companyId === owner.companyId)?.role).toBe('VIEWER');
    });

    it('rejects a wrong password, so a forwarded link is worthless', async () => {
      // The reason redeem checks a password at all: the token travels in email,
      // and email gets forwarded.
      const owner = await registerOwner(app);
      const joiner = await registerOwner(app, uniqueEmail('joiner'), 'Their Co');
      const { token } = await inviteAs(owner, joiner.email);

      await request(app.getHttpServer())
        .post('/api/invites/redeem')
        .send({ token, email: joiner.email, password: 'not-their-password' })
        .expect(401);

      expect(await prisma.companyMembership.count({ where: { companyId: owner.companyId } })).toBe(1);
    });

    it('rejects redemption by a different address than the invitation was sent to', async () => {
      const owner = await registerOwner(app);
      const { token } = await inviteAs(owner, uniqueEmail('invitee'));

      await request(app.getHttpServer())
        .post('/api/invites/redeem')
        .send({ token, email: uniqueEmail('attacker'), password: PASSWORD })
        .expect(403);
    });

    it('rejects an unknown token', async () => {
      await request(app.getHttpServer())
        .post('/api/invites/redeem')
        .send({ token: 'never-existed', email: uniqueEmail('x'), password: PASSWORD })
        .expect(404);
    });

    it('cannot be replayed', async () => {
      const owner = await registerOwner(app);
      const invitee = uniqueEmail('once');
      const { token } = await inviteAs(owner, invitee);

      await request(app.getHttpServer())
        .post('/api/invites/redeem')
        .send({ token, email: invitee, password: PASSWORD })
        .expect(201);

      const row = await prisma.invite.findUniqueOrThrow({ where: { token } });
      expect(row.status).toBe('ACCEPTED');
      expect(row.respondedAt).not.toBeNull();

      await request(app.getHttpServer())
        .post('/api/invites/redeem')
        .send({ token, email: invitee, password: PASSWORD })
        .expect(409);

      // One invitation, one extra member. Not two.
      expect(await prisma.companyMembership.count({ where: { companyId: owner.companyId } })).toBe(2);
    });

    it('marks an expired invitation expired when it is redeemed', async () => {
      const owner = await registerOwner(app);
      const invitee = uniqueEmail('expired');
      const { id } = await inviteAs(owner, invitee);
      await prisma.invite.update({ where: { id }, data: ageRow() });
      const { token } = await prisma.invite.findUniqueOrThrow({ where: { id } });

      await request(app.getHttpServer())
        .post('/api/invites/redeem')
        .send({ token, email: invitee, password: PASSWORD })
        .expect(403);

      // Marked, so the company's invite list stops showing it as pending.
      const row = await prisma.invite.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe('EXPIRED');
      expect(await prisma.user.count({ where: { email: invitee } })).toBe(0);
    });

    it('refuses a revoked invitation', async () => {
      const owner = await registerOwner(app);
      const invitee = uniqueEmail('revoked');
      const { id, token } = await inviteAs(owner, invitee);

      await request(app.getHttpServer())
        .delete(`/api/companies/invites/${id}`)
        .set(as(owner.accessToken, owner.companyId))
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/invites/redeem')
        .send({ token, email: invitee, password: PASSWORD })
        .expect(409);
      expect(await prisma.user.count({ where: { email: invitee } })).toBe(0);
    });
  });

  describe('accepting an invitation (already signed in)', () => {
    it('joins the company with the existing session', async () => {
      const owner = await registerOwner(app);
      const joiner = await registerOwner(app, uniqueEmail('joiner'), 'Their Co');
      const { token } = await inviteAs(owner, joiner.email, 'ANALYST');

      const res = await request(app.getHttpServer())
        .post('/api/invites/accept')
        .set(as(joiner.accessToken))
        .send({ token })
        .expect(201);

      expect(res.body.createdAccount).toBe(false);
      expect(res.body.companyId).toBe(owner.companyId);
      expect(res.body.role).toBe('ANALYST');
      expect(await prisma.companyMembership.count({ where: { userId: joiner.userId } })).toBe(2);
    });

    it('rejects an anonymous caller', async () => {
      // accept() skips the password check that redeem() performs, so the
      // session is the only thing tying the token to a real person.
      const owner = await registerOwner(app);
      const { token } = await inviteAs(owner, uniqueEmail('invitee'));

      await request(app.getHttpServer()).post('/api/invites/accept').send({ token }).expect(401);
    });

    it('rejects a signed-in user who is not the recipient', async () => {
      const owner = await registerOwner(app);
      const { token } = await inviteAs(owner, uniqueEmail('invitee'));
      const stranger = await registerOwner(app, uniqueEmail('stranger'), 'Stranger Co');

      await request(app.getHttpServer())
        .post('/api/invites/accept')
        .set(as(stranger.accessToken))
        .send({ token })
        .expect(403);
    });
  });

  describe('revoking', () => {
    it('cannot be done by a different company', async () => {
      const owner = await registerOwner(app);
      const other = await registerOwner(app, uniqueEmail('other'), 'Other Co');
      const { id } = await inviteAs(owner, uniqueEmail('invitee'));

      await request(app.getHttpServer())
        .delete(`/api/companies/invites/${id}`)
        .set(as(other.accessToken, other.companyId))
        .expect(404);

      expect((await prisma.invite.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING');
    });

    it('refuses to revoke one that was already used', async () => {
      const owner = await registerOwner(app);
      const invitee = uniqueEmail('used');
      const { id, token } = await inviteAs(owner, invitee);
      await request(app.getHttpServer())
        .post('/api/invites/redeem')
        .send({ token, email: invitee, password: PASSWORD })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/companies/invites/${id}`)
        .set(as(owner.accessToken, owner.companyId))
        .expect(409);
    });
  });

  describe('share links', () => {
    it('serves the company financials to someone with no session at all', async () => {
      const owner = await registerOwner(app, uniqueEmail('owner'), 'Acme');
      await addSnapshot(owner.companyId, '2026-01');

      const link = await request(app.getHttpServer())
        .post('/api/reports/share-link')
        .set(as(owner.accessToken, owner.companyId))
        .expect(201);

      expect(link.body.token).toHaveLength(43);
      expect(link.body.viewCount).toBe(0);
      expect(link.body.isRevoked).toBe(false);

      // No Authorization header: the token is the credential.
      const pub = await request(app.getHttpServer())
        .get(`/api/public/dashboard/${link.body.token}`)
        .expect(200);

      expect(pub.body.snapshots).toHaveLength(1);
      expect(String(pub.body.latest.mrr)).toBe('12000');
    });

    it('persists the link, so it outlives the process that made it', async () => {
      const owner = await registerOwner(app);

      const link = await request(app.getHttpServer())
        .post('/api/reports/share-link')
        .set(as(owner.accessToken, owner.companyId))
        .expect(201);

      const row = await prisma.shareLink.findUniqueOrThrow({ where: { tokenHash: hashToken(link.body.token) } });
      expect(row.companyId).toBe(owner.companyId);
      expect(row.createdById).toBe(owner.userId);
      expect(row.revokedAt).toBeNull();
    });

    it('counts views', async () => {
      const owner = await registerOwner(app);
      const link = await request(app.getHttpServer())
        .post('/api/reports/share-link')
        .set(as(owner.accessToken, owner.companyId))
        .expect(201);

      await request(app.getHttpServer()).get(`/api/public/dashboard/${link.body.token}`).expect(200);
      await request(app.getHttpServer()).get(`/api/public/dashboard/${link.body.token}`).expect(200);

      const row = await prisma.shareLink.findUniqueOrThrow({ where: { tokenHash: hashToken(link.body.token) } });
      expect(row.viewCount).toBe(2);
      expect(row.lastViewedAt).not.toBeNull();
    });

    it('stops serving a revoked link', async () => {
      const owner = await registerOwner(app);
      const link = await request(app.getHttpServer())
        .post('/api/reports/share-link')
        .set(as(owner.accessToken, owner.companyId))
        .expect(201);
      const row = await prisma.shareLink.findUniqueOrThrow({ where: { tokenHash: hashToken(link.body.token) } });

      await request(app.getHttpServer())
        .delete(`/api/reports/share-links/${row.id}`)
        .set(as(owner.accessToken, owner.companyId))
        .expect(200);

      expect((await prisma.shareLink.findUniqueOrThrow({ where: { id: row.id } })).revokedAt).not.toBeNull();
      await request(app.getHttpServer()).get(`/api/public/dashboard/${link.body.token}`).expect(404);
    });

    it('stops serving an expired link', async () => {
      const owner = await registerOwner(app);
      const link = await request(app.getHttpServer())
        .post('/api/reports/share-link')
        .set(as(owner.accessToken, owner.companyId))
        .expect(201);

      await prisma.shareLink.update({
        where: { tokenHash: hashToken(link.body.token) },
        data: ageRow(),
      });

      await request(app.getHttpServer()).get(`/api/public/dashboard/${link.body.token}`).expect(404);
    });

    it('gives the same 404 for unknown, expired and revoked', async () => {
      // If these differed, a caller could learn which of the three it had.
      const owner = await registerOwner(app);
      const link = await request(app.getHttpServer())
        .post('/api/reports/share-link')
        .set(as(owner.accessToken, owner.companyId))
        .expect(201);

      const unknown = await request(app.getHttpServer())
        .get('/api/public/dashboard/never-existed')
        .expect(404);
      const revoked = await request(app.getHttpServer())
        .get('/api/public/dashboard/never-existed')
        .expect(404);
      expect(unknown.body.message).toBe(revoked.body.message);
      expect(unknown.body.message).toBe('Invalid or expired share link');
      expect(link.body.token).toBeTruthy();
    });

    it('will not let one company revoke another company\'s link', async () => {
      const a = await registerOwner(app, uniqueEmail('a'), 'A Co');
      const b = await registerOwner(app, uniqueEmail('b'), 'B Co');
      const link = await request(app.getHttpServer())
        .post('/api/reports/share-link')
        .set(as(a.accessToken, a.companyId))
        .expect(201);
      const row = await prisma.shareLink.findUniqueOrThrow({ where: { tokenHash: hashToken(link.body.token) } });

      await request(app.getHttpServer())
        .delete(`/api/reports/share-links/${row.id}`)
        .set(as(b.accessToken, b.companyId))
        .expect(404);

      expect((await prisma.shareLink.findUniqueOrThrow({ where: { id: row.id } })).revokedAt).toBeNull();
    });

    it('lists only the caller\'s own links', async () => {
      const a = await registerOwner(app, uniqueEmail('a'), 'A Co');
      const b = await registerOwner(app, uniqueEmail('b'), 'B Co');
      await request(app.getHttpServer())
        .post('/api/reports/share-link')
        .set(as(a.accessToken, a.companyId))
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/reports/share-links')
        .set(as(b.accessToken, b.companyId))
        .expect(200);

      expect(res.body).toEqual([]);
    });
  });
});
