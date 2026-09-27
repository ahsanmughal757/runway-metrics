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
const REJECTED_SECRETS = new Set([
  'dev-only-secret-change-me',
  'change-me',
  'secret',
  'dev',
  'insecure',
]);

const secret = (min: number, label: string) =>
  z
    .string()
    .min(min, `${label} must be at least ${min} characters`)
    .refine((v) => !REJECTED_SECRETS.has(v.toLowerCase()), {
      message: `${label} is a known placeholder value. Generate a real one (see scripts/generate-secrets.mjs)`,
    });

/**
 * A secret that may be absent, and where "absent" is spelled either as an unset
 * variable or as the empty string. `KEY=` is the natural way to leave a value
 * blank in a .env file, and plain `.optional()` rejects it because an empty
 * string is present-but-invalid rather than undefined.
 */
const optionalSecret = (min: number, label: string) =>
  z.preprocess((v) => (v === '' ? undefined : v), secret(min, label).optional());

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

    /** Demo mode: injects a canned Founder identity. Hard-refused in production. */
    BYPASS_AUTH: boolish(false),

    CORS_ORIGINS: csv,

    /** AES-256-GCM key for connector credentials. Required in production. */
    CREDENTIALS_MASTER_KEY: optionalSecret(32, 'CREDENTIALS_MASTER_KEY'),

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
        message: 'CREDENTIALS_MASTER_KEY is required in production (Phase 4 encrypts connector credentials with it)',
      });
    }
    if (cfg.CORS_ORIGINS.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: 'CORS_ORIGINS must list at least one origin in production' });
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
