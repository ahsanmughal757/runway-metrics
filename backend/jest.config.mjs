/**
 * Jest is deliberate here rather than Vitest: Nest's dependency injection
 * resolves constructor parameter types from `emitDecoratorMetadata`, and
 * neither esbuild nor SWC emits it. A Vitest backend silently loses type-based
 * provider resolution; Jest with ts-jest is the supported path.
 */
export default {
  moduleFileExtensions: ['js', 'json', 'ts', 'tsx'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    // .tsx is required by the React-PDF investor report renderer, which is part
    // of the ReportsModule the app boots.
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.module.ts', '!src/main.ts', '!src/**/dto.ts'],
  coverageDirectory: 'coverage',
  // Seeded before every suite so a test importing env.ts gets a valid
  // configuration without a developer's real .env leaking into assertions.
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  coverageThreshold: {
    // Business logic only. Controllers and DTOs are thin translation layers;
    // gating on them would push coverage into meaningless assertion count.
    './src/metrics/': { statements: 80, branches: 80, functions: 80, lines: 80 },
    './src/fake-data/': { statements: 90, branches: 85, functions: 90, lines: 90 },
    './src/audit/': { statements: 70, branches: 60, functions: 70, lines: 70 },
  },
  clearMocks: true,
  restoreMocks: true,
};
