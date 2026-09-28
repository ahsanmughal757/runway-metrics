/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Deliberately separate from `vite.config.ts`.
 *
 * The app config carries a dev proxy for `/api` that points at a real backend.
 * Inheriting it would make a test that forgets to mock `fetch` quietly issue
 * live HTTP requests to a developer's machine, so the unit suite is given its
 * own environment with no proxy and no plugins beyond the JSX transform.
 *
 * `pool: 'forks'` because the suites share `localStorage` and the signed-out
 * event bus; running files in a single shared worker lets one file's teardown
 * observe another's state.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    pool: 'forks',
    restoreMocks: true,
  },
});
