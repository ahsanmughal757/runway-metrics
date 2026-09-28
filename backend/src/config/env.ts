import { config as loadEnvFile } from 'dotenv';
import { z } from 'zod';

/**
 * Every environment variable the API reads, validated once at import time.
 *
 * The previous version defaulted `JWT_SECRET` to a literal committed string
 * and treated every other secret as optional, which meant a misconfigured
 * production deploy booted happily and signed tokens anybody could forge.
 * Parsing through zod turns that class of mistake into a boot failure.
 *
 * This module loads `.env` itself before validating. It used to rely on
 * `ConfigModule.forRoot()` to populate process.env, but import declarations are
 * hoisted and `config/env` is imported by every repository, so validation ran
 * *before* the .env file was ever read -- a fresh checkout with a valid .env
 * and an empty shell failed to boot. Owning the load here makes the order
 * irrelevant. AppModule's ConfigModule is configured to skip the file.
 *
 * `RUNWAY_SKIP_DOTENV` exists so the test suite stays hermetic: a developer's
 * local .env must never be able to change what a suite asserts, and the config
 * suite has to re-import this module under different NODE_ENV values.
 */

if (process.env.RUNWAY_SKIP_DOTENV !== 'true') {
  loadEnvFile({ quiet: true });
}

const NODE_ENVS = ['development', 'test', 'production'] as const;

/** Rejects the well-known placeholder values that end up in git history and .env.example. */
const REJECTED_SECRETS = new Set(['dev-only-secret-change-me', 'change-me', 'secret', 'dev', 'insecure']);

const secret = (min: number, label: string) =>
  z
    .string()
    .min(min, `${label} must be at least ${min} characters`)
    .refine((v) => !REJECTED_SECRETS.has(v.toLowerCase()), {
      message: `${label} is a known placeholder value. Generate a real one (see scripts/generate-secrets.mjs)`,
    });

/**
 * An AES-256 key, as exactly 64 hex characters decoding to 32 bytes.
 *
 * The generic `secret` helper only enforces a character count, which is the
 * wrong test for a key: `Buffer.from(v, 'hex')` stops at the first character
 * pair it cannot read, so a 64-character non-hex string yields a short key and
 * the failure appears later, inside the cipher, as an unrelated-looking error.
 * Validating the shape here turns that into a boot failure that names the
 * variable.
 */
const hexKey32 = (label: string) =>
  z
    .string()
    .regex(
      /^[0-9a-fA-F]{64}$/,
      `${label} must be 64 hex characters, which is exactly 32 bytes for AES-256 (see scripts/generate-secrets.mjs)`,
    )
    .refine((v) => !REJECTED_SECRETS.has(v.toLowerCase()), {
      message: `${label} is a known placeholder value. Generate a real one (see scripts/generate-secrets.mjs)`,
    });

/**
 * "Absent" is spelled either as an unset variable or as the empty string.
 * `KEY=` is the natural way to leave a value blank in a .env file, and plain
 * `.optional()` rejects it because an empty string is present-but-invalid
 * rather than undefined.
 */
const optionalHexKey32 = (label: string) => z.preprocess((v) => (v === '' ? undefined : v), hexKey32(label).optional());

/** Accepts a comma-separated list, tolerating blanks from empty env files. */
const csv = z
  .string()
  .default('http://localhost:5173')
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().url('CORS origins must be absolute URLs')));

const boolish = (def: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .default(def === true ? 'true' : 'false')
    .transform((v) => v === 'true' || v === '1');

const schema = z
  .object({
    NODE_ENV: z.enum(NODE_ENVS).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),

    /** Real Postgres. Required in production; optional so `pnpm dev` runs with no DB. */
    DATABASE_URL: z.string().url().optional(),
    ENABLE_DATABASE: boolish(false),

    /**
     * Signs access tokens. Required always, because even demo mode mints them
     * and a weak default is exactly the bug this schema exists to prevent.
     */
    JWT_SECRET: secret(32, 'JWT_SECRET'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),

    /**
     * Refresh token lifetime. Much longer than the access token on purpose: it
     * is the thing that lets a person stay signed in without seeing a login
     * prompt, and it is revocable, unlike the access token.
     */
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    /**
     * Cookie carrying the refresh token. Scoped to the auth routes so it is not
     * attached to ordinary API calls, which keeps a token from riding along on
     * every request the SPA makes.
     */
    REFRESH_COOKIE_NAME: z.string().min(1).default('runway_rt'),
    /**
     * `true` in production regardless of what is set, because a refresh cookie
     * without Secure travels in cleartext and is exactly the thing worth
     * stealing. See the production refinement below.
     */
    COOKIE_SECURE: boolish(false),
    /** Omit to scope the cookie to the exact host that set it. */
    COOKIE_DOMAIN: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),

    /** Demo mode: injects a canned Founder identity. Hard-refused in production. */
    BYPASS_AUTH: boolish(false),

    CORS_ORIGINS: csv,

    /**
     * How many reverse proxies sit in front of this process.
     *
     * Phase 6 puts nginx in front of the API, and Express needs to be told that
     * or it will read `X-Forwarded-For` as a client-supplied header. That is not
     * a theoretical concern here: the rate limiter (`RATE_LIMIT_MAX`,
     * `AUTH_RATE_LIMIT_MAX`) keys on the client address, so an untrusted
     * `X-Forwarded-For` means anyone can evade the login rate limit by sending
     * a header. It also means the audit log records a spoofed address for every
     * action.
     *
     * A number, not `true`. Express's `true` trusts the whole chain, which is
     * only correct when you know how long the chain is; on a VPS where nginx
     * is the only hop, 1 is the answer. Wrong in the permissive direction
     * (claiming more hops than exist) is the dangerous one, so the default is
     * the conservative `1` and the production refinement below refuses to leave
     * it unset, because a misconfigured proxy is how the above happens silently.
     */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),

    /**
     * AES-256-GCM key for values the server must be able to read back.
     * Required in production. 64 hex characters = 32 bytes.
     *
     * Phase 4 gave this a real consumer. It was previously required in
     * production while no code in the repository used it, which is the worst
     * combination available: a key that must be configured, and never is.
     */
    CREDENTIALS_MASTER_KEY: optionalHexKey32('CREDENTIALS_MASTER_KEY'),

    /**
     * Identifies the active key in every envelope this process writes. Defaults
     * to `k1` because a single-key deployment has nothing to name.
     */
    CREDENTIALS_MASTER_KEY_ID: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z
        .string()
        .min(1)
        .max(64)
        .regex(/^[a-zA-Z0-9._-]+$/, 'CREDENTIALS_MASTER_KEY_ID may only contain letters, digits, dot, underscore and dash')
        .default('k1'),
    ),

    /**
     * Retired keys, as `keyId:hex,keyId:hex`, accepted for *decryption only*.
     * During rotation both the old and new key are present: the active key
     * signs new writes while these read the rows written under the old one.
     * They are removed once every row has been re-encrypted, and removing one
     * early makes those rows permanently unreadable.
     */
    CREDENTIALS_PREVIOUS_KEYS: z.preprocess((v) => (v === '' ? undefined : v), csv.default([])),

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    /** Pretty, human-readable logs for local dev. Always false in production. */
    LOG_PRETTY: boolish(false),

    RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.NODE_ENV !== 'production') return;

    if (cfg.BYPASS_AUTH) {
      ctx.addIssue({ code: 'custom', path: ['BYPASS_AUTH'], message: 'BYPASS_AUTH must never be enabled in production' });
    }
    if (cfg.LOG_PRETTY) {
      ctx.addIssue({ code: 'custom', path: ['LOG_PRETTY'], message: 'LOG_PRETTY must be false in production' });
    }
    if (!cfg.DATABASE_URL) {
      ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'DATABASE_URL is required in production' });
    }
    if (!cfg.ENABLE_DATABASE) {
      ctx.addIssue({ code: 'custom', path: ['ENABLE_DATABASE'], message: 'ENABLE_DATABASE must be true in production' });
    }
    if (!cfg.CREDENTIALS_MASTER_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['CREDENTIALS_MASTER_KEY'],
        message:
          'CREDENTIALS_MASTER_KEY is required in production (it encrypts share-link tokens and any connector credential added later)',
      });
    }
    if (cfg.CORS_ORIGINS.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: 'CORS_ORIGINS must list at least one origin in production' });
    }
    if (!cfg.COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'COOKIE_SECURE must be true in production: without Secure the refresh token crosses the network in cleartext',
      });
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${details}\n\nCopy .env.example to .env and fill in the required values.`);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
