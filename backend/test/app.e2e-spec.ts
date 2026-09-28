import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import request from 'supertest';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { requestIdMiddleware } from '../src/common/logging/request-id.middleware';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { env } from '../src/config/env';

/**
 * Boots the real application in demo mode and exercises the wiring that unit
 * tests cannot reach: dependency resolution across every module, the global
 * middleware and filter stack, guards, and the CORS/throttle configuration.
 *
 * The bootstrap chain in main.ts is reproduced here rather than imported,
 * because importing it would bind a real port. If the two ever drift, the
 * e2e suite stops covering what production actually does.
 */
describe('Runway API (e2e)', () => {
  let app: INestApplication;
  let server: Server;

  /** Demo mode injects a canned founder, so no real token is required. */
  const asFounder = (path: string) => request(server).get(path).set('Authorization', 'Bearer demo');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.use(requestIdMiddleware);
    app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
    // Mirrors main.ts. Without it the refresh cookie is invisible here, and a
    // session feature tested only against the DB suite would never be exercised
    // through the real middleware stack.
    app.use(cookieParser());
    app.enableCors({
      origin: env.CORS_ORIGINS,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Company-Id', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 600,
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.setGlobalPrefix('api', { exclude: ['health', 'health/ready'] });

    server = app.getHttpServer() as Server;
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('liveness and readiness', () => {
    it('reports liveness outside the /api prefix so probes do not need auth', async () => {
      const res = await request(server).get('/health').expect(200);

      expect(res.body.status).toBe('ok');
    });

    it('reports readiness', async () => {
      const res = await request(server).get('/health/ready').expect(200);

      expect(res.body.status).toBe('ok');
    });
  });

  describe('security headers', () => {
    it('sets nosniff and a referrer policy', async () => {
      const res = await request(server).get('/health');

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
    });
  });

  describe('CORS', () => {
    it('returns the configured origin for an allowlisted request', async () => {
      const res = await request(server).get('/health').set('Origin', 'http://localhost:5173');

      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    it('returns no allow-origin header for an unlisted origin', async () => {
      // The browser is the enforcement point, so the header's absence is the
      // control; reflecting the caller's origin back would disable it.
      const res = await request(server).get('/health').set('Origin', 'https://evil.example.com');

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('correlation ids', () => {
    it('honours an inbound id and echoes it', async () => {
      const res = await request(server).get('/health').set('X-Request-Id', 'trace-abc-123');

      expect(res.headers['x-request-id']).toBe('trace-abc-123');
    });

    it('generates a valid id when none is supplied', async () => {
      const res = await request(server).get('/health');

      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('replaces a malformed inbound id rather than echoing it into the logs', async () => {
      // Untrusted input that reaches a log aggregator is a log-injection vector.
      const res = await request(server).get('/health').set('X-Request-Id', 'bad id with spaces <script>');

      expect(res.headers['x-request-id']).not.toContain(' ');
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('includes the id in an error body', async () => {
      const res = await request(server).get('/api/does-not-exist').set('X-Request-Id', 'trace-err-1').expect(404);

      expect(res.body.requestId).toBe('trace-err-1');
    });
  });

  describe('error envelope', () => {
    it('returns a stable shape for an unknown route', async () => {
      const res = await request(server).get('/api/does-not-exist').expect(404);

      expect(res.body).toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
        requestId: expect.any(String),
      });
    });

    it('rejects an unknown body property instead of silently dropping it', async () => {
      const res = await request(server)
        .post('/api/auth/login')
        .send({ email: 'a@b.com', password: 'longenoughpassword', notAField: true })
        .expect(400);

      expect(res.body.code).toBe('BAD_REQUEST');
      expect(res.body.message).toMatch(/notAField/);
    });

    it('does not leak a stack trace in the response', async () => {
      const res = await request(server).get('/api/does-not-exist').expect(404);

      expect(JSON.stringify(res.body)).not.toMatch(/at Object|\.ts:\d+|node_modules/);
    });
  });

  describe('authenticated data in demo mode', () => {
    // These prove the guard chain, tenancy header, and repository layer all
    // line up end to end.
    it('lists companies', async () => {
      const res = await asFounder('/api/companies').expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns a deterministic dashboard', async () => {
      const first = await asFounder('/api/metrics/dashboard').set('X-Company-Id', 'demo-company-steady').expect(200);
      const second = await asFounder('/api/metrics/dashboard').set('X-Company-Id', 'demo-company-steady').expect(200);

      expect(first.text).toBe(second.text);
      expect(first.body.latest.derived.runwayZone).toMatch(/green|yellow|red/);
    });

    it('never reports negative cash', async () => {
      for (const companyId of ['demo-company-steady', 'demo-company-hypergrowth', 'demo-company-struggling']) {
        const res = await asFounder('/api/metrics/dashboard').set('X-Company-Id', companyId).expect(200);

        for (const snap of res.body.snapshots) {
          expect(snap.cash).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('returns cohort retention analysis', async () => {
      const res = await asFounder('/api/cohorts/retention').set('X-Company-Id', 'demo-company-steady').expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('declares the identity a demo one', async () => {
      // The client gates two top-bar controls on this, and they need opposite
      // settings: the viewpoint switcher only works in demo mode (`X-Demo-Role`
      // is read by BypassAuthGuard alone), sign-out only works against a real
      // session. The browser cannot tell the modes apart - a healthy demo and a
      // signed-out browser are both just "no local token" - so the server has to
      // say which it is, and the `demo-user` id is not a signal the client should
      // be parsing out of a response to guess from.
      const res = await asFounder('/api/auth/me').expect(200);

      expect(res.body.demo).toBe(true);
    });
  });

  describe('throttling', () => {
    it('advertises the request budget', async () => {
      const res = await asFounder('/api/companies').expect(200);

      expect(res.headers['x-ratelimit-limit']).toBeDefined();
    });
  });
});
