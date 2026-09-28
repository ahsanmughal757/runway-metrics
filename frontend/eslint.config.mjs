import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Frontend lint config. Deliberately not type-aware (`recommendedTypeChecked`
 * is off): Vite's build already runs `tsc -b`, so duplicating the type checker
 * here would only slow the loop. The rules that matter for this app are the
 * React hook rules, since the audit found missing-deps and effect-cleanup
 * problems, plus fast-refresh hygiene.
 */
export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off',
      // Phase 5. Every page fetched in an effect and stored the result in state;
      // they now read a data layer, and this gate is what stops the pattern
      // coming back one page at a time. It was held at `warn` for exactly as long
      // as the rewrite took, and the whole `src` tree passes at `error` — so this
      // is no longer a warning anyone reads past.
      'react-hooks/set-state-in-effect': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
);
