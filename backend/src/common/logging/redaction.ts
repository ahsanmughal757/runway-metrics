/**
 * Fields scrubbed from every log line, at every nesting depth.
 *
 * pino's `redact` walks the *output* object, so these paths have to cover the
 * log call sites (`req.body.password`) as well as the HTTP request context
 * (`req.headers.cookie`) that nestjs-pino attaches automatically. Redaction
 * happens before serialization, so a secret cannot reach stdout even if an
 * exception payload carries it.
 */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.headers["x-api-key"]',
  'req.headers["x-company-id"]',
  'req.body.password',
  'req.body.refreshToken',
  'req.body.token',
  'req.body.apiKey',
  'req.body.credentials',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'credentials',
  'credentialsCiphertext',
  'passwordHash',
  'CREDENTIALS_MASTER_KEY',
  'JWT_SECRET',
  'DATABASE_URL',
  'SMTP_PASSWORD',
  '*.password',
  '*.token',
  '*.apiKey',
  '*.passwordHash',
] as const;

export const REDACTION_REPLACEMENT = '[redacted]';
