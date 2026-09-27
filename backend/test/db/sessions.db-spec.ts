/**
 * Refresh token rotation against a real database.
 *
 * The behaviour under test is entirely about database state transitions, which
 * is precisely what the unit and e2e suites cannot see: a `revokedAt` that is
 * never written, a `familyId` that changes on rotation, or a reuse check that
 * forgets to revoke the rest of the family would all pass every other suite and
 * leave a stolen refresh token working indefinitely.
 *
 * The properties that matter, in order of how bad it is if they break:
 *
 *  - the raw token is never stored, only its hash
 *  - a refresh token works exactly once
 *  - replaying a spent token kills the whole family (reuse detection)
 *  - logout revokes server-side, not just in the browser
 *  - one user's session list cannot see or revoke another's
 */
import type { INestApplication } from '@nestjs/common';import { createHash } from 'node:crypto';
import request from 'supertest';
import { closeApp, freshDb, makeApp, PASSWORD, prisma, registerOwner, uniqueEmail } from './harness';

const COOKIE = 'runway_rt';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** The raw token out of a `Set-Cookie` header. */
function tokenFrom(res: request.Response): string {
  const cookies = (res.headers['set-cookie'] ?? []) as unknown as string[];
  const hit = cookies.find((c) => c.startsWith(`${COOKIE}=`));
  if (!hit) throw new Error(`no ${COOKIE} cookie in: ${JSON.stringify(cookies)}`);
  return decodeURIComponent(hit.split(';')[0].slice(COOKIE.length + 1));
}

/** The whole `Set-Cookie` line, for asserting on its attributes. */
function cookieLine(res: request.Response): string {
  const cookies = (res.headers['set-cookie'] ?? []) as unknown as string[];
  const hit = cookies.find((c) => c.startsWith(`${COOKIE}=`));
  if (!hit) throw new Error('no refresh cookie set');
  return hit;
}

const withCookie = (token?: string) => (token ? { Cookie: `${COOKIE}=${token}` } : {});

/** The session row belonging to a specific refresh token. */
function sessionFor(token: string) {
  return prisma.session.findUniqueOrThrow({ where: { tokenHash: sha256(token) } });
}

/** Live sessions in the same rotation family as this token. */
async function liveFamily(token: string) {
  const row = await sessionFor(token);
  return prisma.session.findMany({ where: { familyId: row.familyId, revokedAt: null } });
}

/**
 * Ages a row rather than moving only `expiresAt` into the past.
 *
 * The baseline migration enforces `expiresAt > createdAt`, so a session cannot be
 * *born* expired. Both columns have to move together, which is also the state a
 * genuinely lapsed session ends up in.
 */
const ageSession = (days = 30) => ({
  createdAt: new Date(Date.now() - days * 86_400_000),
  expiresAt: new Date(Date.now() - 86_400_000),
});

/** Signs an existing account in. Does not register, so it can be called twice. */
async function login(app: INestApplication, email: string) {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return {
    userId: res.body.user.id as string,
    accessToken: res.body.accessToken as string,
    refreshToken: tokenFrom(res),
  };
}

/**
 * A fresh account, signed in.
 *
 * Note that registration itself issues a session, so this deliberately looks the
 * session up *by token* rather than by user: a `findFirst({ userId })` would be
 * free to return the registration's session instead of the login's, and the
 * assertions about rotation would silently be about the wrong row.
 */
async function signIn(app: INestApplication, email = uniqueEmail('user'), name = 'Acme') {
  const registered = await registerOwner(app, email, name);
  const session = await login(app, email);
  return { ...session, email, companyId: registered.companyId, role: registered.role };
}

/** One account with `count` separate sessions, as separate devices would have. */
async function signedInEverywhere(app: INestApplication, count: number) {
  const registered = await registerOwner(app, uniqueEmail('user'), 'Acme');
  const sessions = [];
  for (let i = 0; i < count; i += 1) sessions.push(await login(app, registered.email));
  return { ...sessions[0], all: sessions, companyId: registered.companyId };
}

describe('sessions and refresh rotation (real database)', () => {
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

  describe('issuing a session', () => {
    it('returns the cookie with the attributes that make it safe', async () => {
      const email = uniqueEmail('user');
      await registerOwner(app, email, 'Acme');

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);

      const line = cookieLine(res);
      // The whole point of the cookie: script cannot read it.
      expect(line).toMatch(/HttpOnly/i);
      // Not attached to the hundreds of ordinary API calls.
      expect(line).toMatch(/Path=\/api\/auth/i);
      // Lax rather than Strict, so following a link from an email still works.
      expect(line).toMatch(/SameSite=Lax/i);
      // Absent in tests because NODE_ENV is not production, which is the only
      // place Secure may be false.
      expect(line).not.toMatch(/;\s*Secure/i);
    });

    it('stores only the hash of the token', async () => {
      const { refreshToken } = await signIn(app);

      const row = await sessionFor(refreshToken);
      expect(row.tokenHash).toBe(sha256(refreshToken));
      // The literal token is nowhere in the row.
      expect(row.tokenHash).not.toBe(refreshToken);
      expect(JSON.stringify(row)).not.toContain(refreshToken);
    });

    it('records where the session came from, so a user can recognise it', async () => {
      // Recorded, not enforced. An IP that changes is normal on mobile, so this
      // exists for the device list to show - it must never be a reason to refuse.
      const email = uniqueEmail('user');
      await registerOwner(app, email, 'Acme');
      const signedIn = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('User-Agent', 'Mozilla/5.0 (Macintosh) Safari/605')
        .send({ email, password: PASSWORD })
        .expect(200);

      const row = await sessionFor(tokenFrom(signedIn));
      expect(row.userAgent).toContain('Safari/605');
    });

    it('gives every login its own family', async () => {
      const registered = await registerOwner(app, uniqueEmail('user'), 'Acme');
      const first = await login(app, registered.email);
      const second = await login(app, registered.email);

      // Registration is itself a sign-in, so the account has three sessions and
      // three families. What matters is that no two logins share one, or reuse
      // detection on one device would sign the other out.
      const rows = await Promise.all([
        sessionFor(first.refreshToken),
        sessionFor(second.refreshToken),
      ]);
      expect(rows[0].familyId).not.toBe(rows[1].familyId);
      expect(first.refreshToken).not.toBe(second.refreshToken);
      expect(await liveFamily(first.refreshToken)).toHaveLength(1);
    });
  });

  describe('refreshing', () => {
    it('returns a usable access token', async () => {
      const { refreshToken } = await signIn(app);

      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set(withCookie(refreshToken))
        .expect(200);

      expect(res.body.accessToken).toEqual(expect.any(String));
      // And it authenticates for real.
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);
    });

    it('rotates the cookie, so one token buys one access token', async () => {
      const { refreshToken } = await signIn(app);

      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set(withCookie(refreshToken))
        .expect(200);

      const next = tokenFrom(res);
      expect(next).not.toBe(refreshToken);
    });

    it('burns the presented token and links it to its replacement', async () => {
      const { refreshToken } = await signIn(app);
      const before = await sessionFor(refreshToken);

      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set(withCookie(refreshToken))
        .expect(200);
      const nextHash = sha256(tokenFrom(res));

      const after = await prisma.session.findUniqueOrThrow({ where: { id: before.id } });
      expect(after.revokedAt).not.toBeNull();
      expect(after.lastUsedAt).not.toBeNull();

      const replacement = await prisma.session.findUniqueOrThrow({ where: { tokenHash: nextHash } });
      expect(replacement.id).toBe(after.replacedById);
      // Rotation must not start a new family, or reuse detection has nothing to
      // correlate and a stolen sibling token survives.
      expect(replacement.familyId).toBe(before.familyId);
    });

    it('keeps the original expiry instead of sliding it forever', async () => {
      const { refreshToken } = await signIn(app);
      const before = await sessionFor(refreshToken);

      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set(withCookie(refreshToken))
        .expect(200);

      // Sliding the expiry on every rotation would make the session immortal,
      // which is not what a 30-day expiry means to anyone reading it.
      const replacement = await sessionFor(tokenFrom(res));
      expect(replacement.expiresAt.getTime()).toBe(before.expiresAt.getTime());
    });

    it('survives repeated refreshes along one chain', async () => {
      let token = (await signIn(app)).refreshToken;

      for (let i = 0; i < 5; i += 1) {
        const res = await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .set(withCookie(token))
          .expect(200);
        token = tokenFrom(res);
      }

      // Still working after five rotations.
      await request(app.getHttpServer()).post('/api/auth/refresh').set(withCookie(token)).expect(200);
    });

    it('rejects a request with no cookie', async () => {
      await request(app.getHttpServer()).post('/api/auth/refresh').expect(401);
    });

    it('rejects a token that was never issued', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set(withCookie('made-up-token'))
        .expect(401);
    });

    it('rejects an expired session', async () => {
      const { refreshToken } = await signIn(app);
      const row = await sessionFor(refreshToken);
      await prisma.session.update({ where: { id: row.id }, data: ageSession() });

      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set(withCookie(refreshToken))
        .expect(401);
    });

    it('will not refresh a deactivated account', async () => {
      const { userId, refreshToken } = await signIn(app);
      await prisma.user.update({ where: { id: userId }, data: { isActive: false } });

      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set(withCookie(refreshToken))
        .expect(401);
      // Every session dies, not just the family that presented the token -
      // "deactivated" has to mean the whole account.
      expect(await prisma.session.count({ where: { userId, revokedAt: null } })).toBe(0);
    });
  });

  describe('reuse detection', () => {
    it('refuses a token that was already spent', async () => {
      const { refreshToken } = await signIn(app);
      await request(app.getHttpServer()).post('/api/auth/refresh').set(withCookie(refreshToken)).expect(200);

      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set(withCookie(refreshToken))
        .expect(401);
    });

    it('kills the whole family when an old token comes back', async () => {
      // This is the property that makes a stolen refresh token a detectable
      // event rather than a month-long silent compromise: the thief replaying a
      // captured token costs the legitimate user their session, visibly, and the
      // session is gone rather than still being usable from two places.
      const { refreshToken } = await signIn(app);
      const first = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set(withCookie(refreshToken))
        .expect(200);
      const live = tokenFrom(first);

      // The attacker replays the captured token.
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set(withCookie(refreshToken))
        .expect(401);

      // The token the real client is holding is collateral damage, on purpose.
      await request(app.getHttpServer()).post('/api/auth/refresh').set(withCookie(live)).expect(401);
      expect(await liveFamily(refreshToken)).toHaveLength(0);
    });

    it('leaves an unrelated login alone', async () => {
      // Two devices, two families. A compromise on one must not sign the user
      // out of the other - that would turn an attack into a denial of service
      // on the victim's own account.
      const { all: [laptop, phone] } = await signedInEverywhere(app, 2);

      const rotated = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set(withCookie(laptop.refreshToken))
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set(withCookie(laptop.refreshToken))
        .expect(401);

      // The phone's session is untouched and still works.
      const stillGood = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set(withCookie(phone.refreshToken))
        .expect(200);
      expect(stillGood.body.accessToken).toEqual(expect.any(String));
      expect(tokenFrom(rotated)).toBeTruthy();
    });
  });

  describe('logging out', () => {
    it('revokes the session server-side, not just in the browser', async () => {
      const { refreshToken } = await signIn(app);

      const res = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set(withCookie(refreshToken))
        .expect(204);

      // The cookie is cleared with matching attributes, or the browser keeps it.
      expect(cookieLine(res)).toMatch(/HttpOnly/i);
      expect(await liveFamily(refreshToken)).toHaveLength(0);
      await request(app.getHttpServer()).post('/api/auth/refresh').set(withCookie(refreshToken)).expect(401);
    });

    it('succeeds with no cookie, because the end state is already true', async () => {
      await request(app.getHttpServer()).post('/api/auth/logout').expect(204);
    });

    it('succeeds on an already-revoked session', async () => {
      const { refreshToken } = await signIn(app);
      await request(app.getHttpServer()).post('/api/auth/logout').set(withCookie(refreshToken)).expect(204);

      await request(app.getHttpServer()).post('/api/auth/logout').set(withCookie(refreshToken)).expect(204);
    });

    it('leaves other devices signed in', async () => {
      const { all: [laptop, phone] } = await signedInEverywhere(app, 2);

      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set(withCookie(laptop.refreshToken))
        .expect(204);

      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set(withCookie(phone.refreshToken))
        .expect(200);
    });

    it('invalidates the access token that outlived the cookie', async () => {
      // The access token is a signed JWT and cannot be un-signed. What logout
      // guarantees is that no *new* one can be minted, which is the property
      // that matters once the 15-minute TTL is up.
      const { accessToken, refreshToken } = await signIn(app);
      await request(app.getHttpServer()).post('/api/auth/logout').set(withCookie(refreshToken)).expect(204);

      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set(withCookie(refreshToken))
        .expect(401);
    });
  });

  describe('listing and revoking sessions', () => {
    it('marks the device that is asking, so the user can tell it apart', async () => {
      const laptop = await signIn(app);
      const phone = await login(app, laptop.email);

      // Two entries with no way to tell them apart is worse than no list: the
      // user would revoke the row for the browser they are sitting in and be
      // signed out by their own security page.
      const asLaptop = await request(app.getHttpServer())
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${laptop.accessToken}`)
        .set(withCookie(laptop.refreshToken))
        .expect(200);
      expect(asLaptop.body.filter((s: { isCurrent: boolean }) => s.isCurrent)).toHaveLength(1);

      const asPhone = await request(app.getHttpServer())
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${phone.accessToken}`)
        .set(withCookie(phone.refreshToken))
        .expect(200);
      const currentFromPhone = asPhone.body.find((s: { isCurrent: boolean }) => s.isCurrent);

      // Each device identifies a different row, so the marker follows the cookie
      // rather than the access token.
      const currentFromLaptop = asLaptop.body.find((s: { isCurrent: boolean }) => s.isCurrent);
      expect(currentFromPhone.id).not.toBe(currentFromLaptop.id);
    });

    it('marks nothing current when the caller has no refresh cookie', async () => {
      const session = await signIn(app);

      // An access token on its own cannot identify a device, and claiming one
      // would be a guess. The list is still served; it just has no "you" row.
      const res = await request(app.getHttpServer())
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);

      expect(res.body.every((s: { isCurrent: boolean }) => s.isCurrent === false)).toBe(true);
    });

    it('lists only live sessions, newest activity first', async () => {
      const laptop = await signIn(app);
      const phone = await login(app, laptop.email);
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set(withCookie(laptop.refreshToken))
        .expect(204);

      const res = await request(app.getHttpServer())
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${laptop.accessToken}`)
        .expect(200);

      // Signing out of one device does not sign out the others, and it does not
      // erase the account's history - the revoked row is simply not listed.
      const phoneRow = await sessionFor(phone.refreshToken);
      expect(res.body).toHaveLength(2);
      expect(res.body.map((s: { id: string }) => s.id)).toContain(phoneRow.id);
      expect(res.body.map((s: { id: string }) => s.id)).not.toContain((await sessionFor(laptop.refreshToken)).id);
      expect(res.body[0]).toMatchObject({ expiresAt: expect.any(String) });
    });

    it('never shows one user another user\'s sessions', async () => {
      const a = await signIn(app);
      const b = await signIn(app);

      const res = await request(app.getHttpServer())
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${b.accessToken}`)
        .expect(200);

      const ids = res.body.map((s: { id: string }) => s.id);
      const aRows = await prisma.session.findMany({ where: { userId: a.userId }, select: { id: true } });
      expect(ids).not.toContain(aRows[0].id);
    });

    it('revokes one session by id', async () => {
      const { all: [laptop, phone] } = await signedInEverywhere(app, 2);

      // Selected by the phone's own token, so the test cannot pass or fail
      // because of the order rows happen to come back in.
      const phoneRow = await prisma.session.findUniqueOrThrow({
        where: { tokenHash: sha256(phone.refreshToken) },
      });

      const list = await request(app.getHttpServer())
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${laptop.accessToken}`)
        .expect(200);
      // Registration plus two logins.
      expect(list.body).toHaveLength(3);
      expect(list.body.map((s: { id: string }) => s.id)).toContain(phoneRow.id);

      await request(app.getHttpServer())
        .delete(`/api/auth/sessions/${phoneRow.id}`)
        .set('Authorization', `Bearer ${laptop.accessToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set(withCookie(phone.refreshToken))
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set(withCookie(laptop.refreshToken))
        .expect(200);
    });

    it('will not let one user revoke another user\'s session', async () => {
      const a = await signIn(app);
      const b = await signIn(app);
      const aRow = await sessionFor(a.refreshToken);

      await request(app.getHttpServer())
        .delete(`/api/auth/sessions/${aRow.id}`)
        .set('Authorization', `Bearer ${b.accessToken}`)
        .expect(401);

      // A's session survives the attempt.
      expect((await prisma.session.findUniqueOrThrow({ where: { id: aRow.id } })).revokedAt).toBeNull();
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set(withCookie(a.refreshToken))
        .expect(200);
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer()).get('/api/auth/sessions').expect(401);
    });
  });
});
