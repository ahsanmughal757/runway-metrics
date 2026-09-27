/**
 * Database integration suites.
 *
 * Split out from both the unit and the e2e configs on purpose:
 *   - `pnpm test` must stay runnable with no infrastructure, so these cannot
 *     live in the default config.
 *   - `pnpm test:e2e` runs with ENABLE_DATABASE=false and BYPASS_AUTH=true,
 *     which means it never touches Prisma at all. It cannot catch a wrong
 *     column name, a broken migration or a SQL aggregation error.
 *
 * These suites run against a real PostgreSQL server, with real authentication
 * and real permission enforcement, so they do catch those.
 */
export default {
  moduleFileExtensions: ['js', 'json', 'ts', 'tsx'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.*\\.db-spec\\.ts$',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  setupFiles: ['<rootDir>/test/setup-env.db.ts'],
  globalSetup: '<rootDir>/test/db-global-setup.ts',
  // The Nest app and the Prisma pool both hold open handles between suites.
  forceExit: true,
  // Each file boots an app and opens a pool; running them serially keeps the
  // connection count predictable and makes a failure's output unambiguous.
  maxWorkers: 1,
  clearMocks: true,
};
