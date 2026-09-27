/**
 * E2E suite. Kept in a separate config so `pnpm test` stays fast and does not
 * require a database, while `pnpm test:e2e` boots the real Nest application
 * through supertest.
 */
export default {
  moduleFileExtensions: ['js', 'json', 'ts', 'tsx'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.*\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  // An app under test holds open handles (the HTTP server, the throttler
  // store); jest must not hang waiting for them to drain.
  forceExit: true,
  clearMocks: true,
};
