/// <reference types="vite/client" />

// Vite substitutes `import.meta.env.VITE_*` at build time, so these are
// compile-time constants, not runtime lookups. This file was missing, which
// meant `import.meta.env` was untyped and any use of it failed to compile.
//
// The interface is declared rather than left to the default `ImportMetaEnv`
// index signature on purpose: the default allows any key, so a typo
// (`VITE_ERROR_REPORTING_UR`) compiles cleanly and ships as `undefined`. Naming
// the two variables this app actually reads turns that into a type error.
interface ImportMetaEnv {
  /**
   * Where `reportError` should POST an escaped error. Unset in every
   * committed environment, which is the point — see
   * `src/lib/errorReporting.ts` for why the transport is `sendBeacon` rather
   * than an SDK, and why this is the only knob.
   */
  readonly VITE_ERROR_REPORTING_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
