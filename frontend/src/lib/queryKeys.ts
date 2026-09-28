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
 * frontend suite pins it (`CompanySwitch.test.tsx`).
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
 */
export const companyKeys = {
  all: (companyId: string) => ['company', companyId] as const,
  dashboard: (companyId: string) => [...companyKeys.all(companyId), 'dashboard'] as const,
  settings: (companyId: string) => [...companyKeys.all(companyId), 'settings'] as const,
  members: (companyId: string) => [...companyKeys.all(companyId), 'members'] as const,
  invites: (companyId: string) => [...companyKeys.all(companyId), 'invites'] as const,
  apiKeys: (companyId: string) => [...companyKeys.all(companyId), 'api-keys'] as const,
  apiKeyScopes: () => ['api-key-scopes'] as const,
  sessions: (companyId: string) => [...companyKeys.all(companyId), 'sessions'] as const,
  activity: (companyId: string) => [...companyKeys.all(companyId), 'activity'] as const,
  cohorts: (companyId: string) => [...companyKeys.all(companyId), 'cohorts'] as const,
  audit: (companyId: string, page: number) => [...companyKeys.all(companyId), 'audit', page] as const,
  shareLinks: (companyId: string) => [...companyKeys.all(companyId), 'share-links'] as const,
  /** The persona comparison, keyed by persona as well as tenant. */
  compare: (companyId: string, persona: string) => [...companyKeys.all(companyId), 'compare', persona] as const,
} as const;
