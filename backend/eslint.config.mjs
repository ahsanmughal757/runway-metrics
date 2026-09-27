import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import security from 'eslint-plugin-security';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'eslint.config.mjs'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  prettier,

  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: {
        // jest.config.mjs and the scripts/ helpers are real code but sit
        // outside the app tsconfig, so the project service is told to lint them
        // without a project rather than skipping them entirely.
        projectService: { allowDefaultProject: ['*.mjs', 'scripts/*.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { security },
    rules: {
      // Formatting is Prettier's job; anything that disagrees is disabled here.
      'prettier/prettier': 'off',

      // --- correctness -----------------------------------------------------
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',

      // The `no-unsafe-*` family only fires where `any` already exists in the
      // codebase, and it fires on every member access off that `any`, which
      // buries a genuine regression under dozens of lines. Demoted to warnings
      // so they stay visible in `pnpm lint` output while the remaining `any`
      // sites are removed file by file.
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',

      // --- security --------------------------------------------------------
      // The 1a-era code used `catch (e) {}` and `any` liberally; these are the
      // rules that keep the Phase 1 fixes from quietly regressing.
      'security/detect-object-injection': 'off',
      'no-console': ['error', { allow: ['warn', 'error'] }],

      // --- NestJS conventions ---------------------------------------------
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },

  // Seed, CSV, and e2e helpers are scripts, not application code: they print
  // their own progress instead of emitting structured logs.
  {
    files: ['prisma/**/*.ts', 'test/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      // Asserting `expect(repo.method).toHaveBeenCalled()` necessarily detaches
      // a method from its object; that is the point of the assertion.
      '@typescript-eslint/unbound-method': 'off',
      // The config suite has to re-import a module that throws at import time,
      // which dynamic `import()` cannot express in CommonJS output.
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
