/**
 * Every query key the app uses.
 *
 * **The company id is the first element of every tenant-scoped key, and it is
 * load-bearing.** A cache is a memory that survives a tenant switch, so a key
 * that does not name the tenant will happily serve the previous company's data
 * to the new one: switch company in the top bar, the `['dashboard']` entry is
 * already cached, and the app renders one company's MRR under another company's
 * name.
 *
 * That failure is invisible from the server. Every request in it is correctly
 * authorised, because the header did name the company the server then answered
 * for — the wrong data was simply already in the browser. No backend test can
 * see it, and no amount of server-side care prevents it, which is why the
 * frontend suite pins it (`queryKeys.test.tsx`).
 *
 * Three rules follow, and breaking any of them reintroduces the leak:
 *
 * 1. A tenant-scoped resource is keyed by `companyKeys.all(companyId)` and
 *    spread from there. Never hand-write a key array.
 * 2. A query with no company id is genuinely not tenant-scoped — `/auth/me`,
 *    the credential endpoints, the public share view. Those keys start with
 *    something else (`authKeys`, `publicKeys`) so they cannot be confused with a
 *    tenant key that happens to be missing its company.
 * 3. A caller that has no company id disables its query. It does not fall back
 *    to a shared key, and it does not fire-and-cancel.
 *
 * Sign-out clears the whole cache. A signed-out shell with a warm cache never
 * makes a request, so there is nothing left that could fail closed — and the
 * next person to open the app on a shared machine would see the previous
 * session's numbers before their own bootstrap resolved.
 */

/** Not tenant-scoped: the identity of the session, not of a company. */
export const authKeys = {
  me: () => ['auth', 'me'] as const,
  /**
   * `/auth/sessions` is the caller's own devices, keyed by `userId` — the route
   * carries `AuthGuard` and no `CompanyScopeGuard`, so the answer does not change
   * with the selected company.
   *
   * It therefore belongs here rather than under `companyKeys`, and the distinction
   * is not cosmetic. A company-scoped key is not wrong, it is wasteful: switching
   * company re-keys a list of the same devices and refetches it for nothing. The
   * reverse mistake would not be cosmetic, and rule 2 exists to catch it.
   */
  sessions: () => ['auth', 'sessions'] as const,
} as const;

/** Reached by a share token with no session at all. */
export const publicKeys = {
  sharedDashboard: (token: string) => ['public', 'share', token] as const,
} as const;

/**
 * Tenant-scoped keys.
 *
 * Built through `all` so the company id is written once. Every tenant key is a
 * spread of it, which is what makes "did you remember the company?" a question
 * with a compile error attached rather than a code review question.
 *
 * The company id is `string | null` rather than `string`, and that is a
 * deliberate widening. During bootstrap there is no company yet, and the
 * alternative was a placeholder like `'unset'` substituted at every call site —
 * a string that looks like a company id and could, in principle, collide with
 * one. `null` cannot collide with anything, and a key built from it is
 * `['company', null, 'dashboard']`: unmistakably not a tenant's data. The query
 * is disabled while it is null, so the key is never fetched against; it exists
 * only so the hook has something stable to hold.
 */
export const companyKeys = {
  all: (companyId: string | null) => ['company', companyId] as const,
  dashboard: (companyId: string | null) => [...companyKeys.all(companyId), 'dashboard'] as const,
  settings: (companyId: string | null) => [...companyKeys.all(companyId), 'settings'] as const,
  members: (companyId: string | null) => [...companyKeys.all(companyId), 'members'] as const,
  invites: (companyId: string | null) => [...companyKeys.all(companyId), 'invites'] as const,
  apiKeys: (companyId: string | null) => [...companyKeys.all(companyId), 'api-keys'] as const,
  apiKeyScopes: () => ['api-key-scopes'] as const,
  activity: (companyId: string | null) => [...companyKeys.all(companyId), 'activity'] as const,
  cohorts: (companyId: string | null) => [...companyKeys.all(companyId), 'cohorts'] as const,
  /**
   * The percentile bands are static seed-stage data, but the position *within*
   * them is this company's, so the key is tenant-scoped even though the bands are
   * not. Keying it as if it were shared would render one company's marker against
   * another's company name.
   */
  benchmarks: (companyId: string | null) => [...companyKeys.all(companyId), 'benchmarks'] as const,
  audit: (companyId: string | null, page: number) => [...companyKeys.all(companyId), 'audit', page] as const,
  shareLinks: (companyId: string | null) => [...companyKeys.all(companyId), 'share-links'] as const,
  /** The persona comparison, keyed by persona as well as tenant. */
  compare: (companyId: string | null, persona: string) => [...companyKeys.all(companyId), 'compare', persona] as const,
} as const;
