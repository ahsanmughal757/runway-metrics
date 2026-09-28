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
  // Jest's 5s default is too tight for what these tests do, and it was not a
  // theoretical margin. Each request here does real password hashing and real
  // SQL, so a typical test costs ~1.1s and the heaviest cost ~1.8s. Under CPU
  // contention that 5s budget was exceeded and `test:db` failed on a test that
  // passes in every other run.
  //
  // That is worth more than a number, because Phase 6 puts this suite in CI: a
  // gate that fails once every few runs gets re-run until green, and the one
  // time it matters is the run nobody re-runs. 15s is ~10x the slowest real
  // test here and still fails fast on a genuine hang, which 5x margin would not
  // have told apart from contention.
  testTimeout: 15_000,
  clearMocks: true,
};
