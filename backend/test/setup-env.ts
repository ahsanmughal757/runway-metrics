/**
 * Runs before the test framework and before any module import.
 *
 * backend/src/config/env.ts validates process.env at *import* time and throws
 * on a missing or placeholder secret. Without these defaults every suite that
 * transitively imports the config would fail to load, and reading the
 * developer's real .env would make tests pass or fail based on local state.
 */
process.env.NODE_ENV = 'test';
// Keeps config/env.ts from reading backend/.env, so a developer's local
// secrets cannot change what a suite asserts.
process.env.RUNWAY_SKIP_DOTENV = 'true';
process.env.ENABLE_DATABASE = 'false';
process.env.BYPASS_AUTH = 'true';
process.env.JWT_SECRET = 'test-secret-not-a-placeholder-0123456789abcdef';
process.env.ACCESS_TOKEN_TTL_SECONDS = '900';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.LOG_LEVEL = 'silent';
process.env.LOG_PRETTY = 'false';
process.env.RATE_LIMIT_TTL_SECONDS = '60';
process.env.RATE_LIMIT_MAX = '100000';
process.env.AUTH_RATE_LIMIT_MAX = '100000';
// dotenv does not overwrite variables that are already set, so assigning here
// wins over anything in a developer's local .env. config/env.ts calls
// loadEnvFile() at import time, which respects these values. This keeps
// config-dependent tests deterministic instead of dependent on local machine
// state.
process.env.CREDENTIALS_MASTER_KEY = 'test-credentials-master-key-0123456789';
process.env.ENABLE_DATABASE = 'false';
