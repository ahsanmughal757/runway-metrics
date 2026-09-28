/**
 * Fail-fast environment validation is the single most valuable thing this
 * schema does: every one of these cases is a deploy that would otherwise boot
 * successfully and misbehave at runtime.
 *
 * config/env.ts reads process.env at import time and throws on failure, so each
 * case re-imports it against a mutated process.env.
 */
type LoadResult = { ok: true; env: Record<string, unknown> } | { ok: false; message: string };

function loadEnvWith(overrides: Record<string, string | undefined>): LoadResult {
  const saved = { ...process.env };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }

  try {
    jest.resetModules();

    const mod = require('../src/config/env') as { env: Record<string, unknown> };
    return { ok: true, env: mod.env };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  } finally {
    process.env = saved;
  }
}

/** A minimal, valid production configuration that individual tests then break. */
const VALID_PROD = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/runway',
  ENABLE_DATABASE: 'true',
  BYPASS_AUTH: 'false',
  LOG_PRETTY: 'false',
  JWT_SECRET: 'prod-jwt-secret-value-long-enough-1234',
  // 64 hex characters. The schema checks the decoded length, not the character
  // count, so a readable phrase no longer passes.
  CREDENTIALS_MASTER_KEY: 'b'.repeat(64),
  CORS_ORIGINS: 'https://runway.example.com',
  // The refresh cookie is a credential; over http it would cross the network in
  // clear. Production is required to set this, so a valid config includes it.
  COOKIE_SECURE: 'true',
} as const;

const prod = (over: Record<string, string | undefined> = {}) => loadEnvWith({ ...VALID_PROD, ...over });
const dev = (over: Record<string, string | undefined> = {}) =>
  loadEnvWith({
    NODE_ENV: 'development',
    ENABLE_DATABASE: 'false',
    BYPASS_AUTH: 'true',
    JWT_SECRET: 'dev-jwt-secret-value-long-enough-1234567',
    CORS_ORIGINS: 'http://localhost:5173',
    ...over,
  });

describe('env configuration', () => {
  describe('production interlocks', () => {
    it('accepts a fully specified production configuration', () => {
      const result = prod();

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.env.NODE_ENV).toBe('production');
    });

    it.each<[string, Record<string, string | undefined>, string]>([
      ['BYPASS_AUTH is on', { BYPASS_AUTH: 'true' }, 'BYPASS_AUTH'],
      ['the refresh cookie is not marked secure', { COOKIE_SECURE: 'false' }, 'COOKIE_SECURE'],
      ['the refresh cookie is not marked secure', { COOKIE_SECURE: undefined }, 'COOKIE_SECURE'],
      ['no database URL', { DATABASE_URL: undefined }, 'DATABASE_URL'],
      ['the database is disabled', { ENABLE_DATABASE: 'false' }, 'ENABLE_DATABASE'],
      ['no credentials key', { CREDENTIALS_MASTER_KEY: undefined }, 'CREDENTIALS_MASTER_KEY'],
      ['pretty logs are on', { LOG_PRETTY: 'true' }, 'LOG_PRETTY'],
      ['no CORS origins', { CORS_ORIGINS: '' }, 'CORS_ORIGINS'],
    ])('refuses to boot when %s', (_label, overrides, expectedKey) => {
      const result = prod(overrides);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain(expectedKey);
    });

    it('refuses BYPASS_AUTH even with everything else correct', () => {
      // The demo identity is a full-auth bypass. A production boot with it on
      // would hand every visitor an OWNER account.
      const result = prod({ BYPASS_AUTH: 'true' });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/BYPASS_AUTH must never be enabled in production/);
    });

    it('names every broken variable in one error', () => {
      // An operator fixing a deploy should not have to rediscover problems one
      // restart at a time.
      const result = prod({ BYPASS_AUTH: 'true', DATABASE_URL: undefined, LOG_PRETTY: 'true' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain('BYPASS_AUTH');
        expect(result.message).toContain('DATABASE_URL');
        expect(result.message).toContain('LOG_PRETTY');
      }
    });
  });

  describe('secrets', () => {
    it('requires JWT_SECRET in development, not just production', () => {
      // Demo mode still mints tokens; a weak default is the bug being prevented.
      const result = dev({ JWT_SECRET: undefined });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain('JWT_SECRET');
    });

    it('rejects a short JWT_SECRET', () => {
      const result = dev({ JWT_SECRET: 'too-short' });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/at least 32 characters/);
    });

    it('rejects a known placeholder JWT_SECRET', () => {
      // Placeholders reach .env by copy-paste, so naming them is more useful
      // than a length error.
      const result = dev({ JWT_SECRET: 'dev-only-secret-change-me' });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/placeholder/i);
    });

    it('treats an empty CREDENTIALS_MASTER_KEY as absent rather than invalid', () => {
      // `KEY=` is how a .env expresses "not set yet". Rejecting it would block
      // a development checkout that has no encrypted values to read.
      const result = dev({ CREDENTIALS_MASTER_KEY: '' });

      expect(result.ok).toBe(true);
    });

    it('still rejects a short CREDENTIALS_MASTER_KEY that is present', () => {
      const result = dev({ CREDENTIALS_MASTER_KEY: 'short' });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain('CREDENTIALS_MASTER_KEY');
    });

    it('rejects a 64-character key that is not hex, which would decode to the wrong length', () => {
      // The case the old character-count check missed entirely: this passes a
      // min(32) but Buffer.from(v, 'hex') stops at the first bad pair, yielding
      // a short key and a confusing failure inside the cipher.
      const result = dev({ CREDENTIALS_MASTER_KEY: 'z'.repeat(64) });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/64 hex characters/);
    });

    it('accepts a previous-key list, leaving its shape to the crypto service', () => {
      // CREDENTIALS_PREVIOUS_KEYS is a csv here and a rotation concern there.
      // Validating the pair format twice would put the rotation error message
      // in two files; the service is the only place that can say which key is
      // wrong, and it throws at construction, which is also boot time.
      const result = dev({ CREDENTIALS_PREVIOUS_KEYS: `k1:${'c'.repeat(64)}` });

      expect(result.ok).toBe(true);
    });
  });

  describe('CORS', () => {
    it('parses a comma-separated list and trims whitespace', () => {
      const result = dev({ CORS_ORIGINS: 'https://a.example.com, https://b.example.com' });

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.env.CORS_ORIGINS).toEqual(['https://a.example.com', 'https://b.example.com']);
    });

    it('rejects a relative origin', () => {
      // A relative origin in an allowlist is a silent no-op that looks configured.
      const result = dev({ CORS_ORIGINS: '/api' });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/absolute URLs/);
    });

    it('rejects a wildcard origin', () => {
      const result = dev({ CORS_ORIGINS: '*' });

      expect(result.ok).toBe(false);
    });
  });

  describe('defaults', () => {
    it('defaults to a non-existent database so a bare checkout runs in demo mode', () => {
      const result = dev();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.env.ENABLE_DATABASE).toBe(false);
        expect(result.env.NODE_ENV).toBe('development');
      }
    });

    it('shortens the access token lifetime to 15 minutes by default', () => {
      // Long-lived access tokens are what make the later refresh-cookie rotation
      // a difficult migration instead of an easy one.
      const result = dev();

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.env.ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    });

    it('coerces numeric settings from strings', () => {
      const result = dev({ PORT: '8080', RATE_LIMIT_MAX: '250' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.env.PORT).toBe(8080);
        expect(result.env.RATE_LIMIT_MAX).toBe(250);
      }
    });

    it('rejects a non-numeric PORT', () => {
      const result = dev({ PORT: 'eighty' });

      expect(result.ok).toBe(false);
    });

    it('rejects an unknown NODE_ENV', () => {
      const result = dev({ NODE_ENV: 'staging' });

      expect(result.ok).toBe(false);
    });

    it('interprets the usual boolean spellings', () => {
      for (const truthy of ['true', '1']) {
        const result = dev({ ENABLE_DATABASE: truthy, JWT_SECRET: 'y'.repeat(40) });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.env.ENABLE_DATABASE).toBe(true);
      }
      for (const falsy of ['false', '0']) {
        const result = dev({ ENABLE_DATABASE: falsy });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.env.ENABLE_DATABASE).toBe(false);
      }
    });

    it('rejects a boolean spelled any other way', () => {
      // A typo like "yes" silently becoming false is how auth interlock #1 ships.
      const result = dev({ ENABLE_DATABASE: 'yes' });

      expect(result.ok).toBe(false);
    });
  });

  describe('.env loading', () => {
    it('reads a variable that exists only in the process environment', () => {
      // Guards the regression where validation ran before the .env was loaded:
      // process.env is the only source config/env.ts is allowed to depend on.
      const result = dev({ ACCESS_TOKEN_TTL_SECONDS: '1234' });

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.env.ACCESS_TOKEN_TTL_SECONDS).toBe(1234);
    });
  });
});
