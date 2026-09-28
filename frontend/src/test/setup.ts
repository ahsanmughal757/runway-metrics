/**
 * Global test setup.
 *
 * The `jest-dom` matchers are the whole of what this file is for; the
 * `localStorage` clear is the other half, and it is here rather than in each
 * test because forgetting it produces an order-dependent failure that looks
 * like a bug in the code under test. `runway_token` persisting between files
 * would, for instance, make a demo-mode test pass in isolation and fail in the
 * suite.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

/**
 * jsdom implements neither `ResizeObserver` nor `matchMedia`, and HeroUI's Tabs
 * observe their container to pick a render mode. A stub is the honest amount of
 * the API: `observe`/`unobserve`/`disconnect` with no callbacks, because a test
 * that depended on a real measurement would be testing jsdom's layout engine
 * rather than the component. Anything that later needs the *values* should
 * compute them in the component, not start faking notifications here.
 */
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!('matchMedia' in globalThis)) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});
