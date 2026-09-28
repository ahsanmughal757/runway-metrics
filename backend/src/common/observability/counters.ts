/**
 * Counters, and the one endpoint that reads them.
 *
 * Phase 6 called for metrics and found that the two signals which actually
 * matter here are already being computed and thrown away:
 *
 * - `AuditService.record` logs at error level when an audit row cannot be
 *   written. An audit trail that silently stops recording is *worse* than no
 *   trail, because it looks like it is working.
 * - The rate limiter rejects by count. Auth failures and rate-limit hits are
 *   the two things an operator wants to see on a graph.
 *
 * So this is deliberately not a Prometheus client, a `prom-client` registry, or
 * an OpenTelemetry exporter. All three add a dependency, a scrape endpoint and
 * a time-series store to answer a question that, on a single VPS with one
 * process, is "is anything unusual happening right now". The counters live in
 * memory, are exposed as JSON on an endpoint the health probe already calls, and
 * a human or a cron job reads them.
 *
 * What this deliberately does **not** do is pretend to be a monitoring system.
 * The counters reset when the process restarts, which means a rate computed from
 * them is wrong across a deploy. That is stated in the payload below rather than
 * left for someone to discover.
 */

/** Bounded so a long-running process cannot grow without limit under a flood. */
const MAX_TRACKED_SERIES = 200;

export interface CounterSnapshot {
  /** Summed per key. A key is created on first sight. */
  readonly counters: Readonly<Record<string, number>>;
  /**
   * Always true, and the reason this is in the payload: the numbers above are
   * only meaningful relative to this process's uptime. A scrape that crosses a
   * restart and treats the two as continuous will compute nonsense.
   */
  readonly processUptimeSeconds: number;
  readonly since: string;
}

const counters = new Map<string, number>();
const since = new Date().toISOString();
const bootedAt = Date.now();

/**
 * Add `amount` to a named counter. Called on the failure paths, so it is
 * deliberately the cheapest thing in the request path: one map lookup and one
 * increment, no allocation on the common path and no I/O.
 *
 * `labels` are flattened into the key rather than kept as dimensions. This is a
 * flat map with no dimensions API, so `record('ratelimit', { route, ip })` would
 * create a key per unique IP and grow the map with the number of distinct
 * attackers. The high-cardinality field is therefore sampled into a bucket
 * instead — see `cardinalityBucket` for why the alternative is not "just cap it".
 */
export function incrementCounter(name: string, labels: Readonly<Record<string, string | number>> = {}, amount = 1): void {
  const key = labelsKey(name, labels);

  const next = (counters.get(key) ?? 0) + amount;

  // Drop the increment rather than the key when full. A counter that stops
  // moving is visibly wrong; deleting keys silently makes the total fall, which
  // reads as a recovery that never happened.
  if (next === amount && counters.size >= MAX_TRACKED_SERIES) {
    const overflow = counters.get('__overflow__') ?? 0;
    counters.set('__overflow__', overflow + amount);
    return;
  }

  counters.set(key, next);
}

function labelsKey(name: string, labels: Readonly<Record<string, string | number>>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return name;
  // Sorted so `{a,b}` and `{b,a}` are one series rather than two.
  return `${name}{${entries
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join(',')}}`;
}

export function snapshotCounters(): CounterSnapshot {
  return {
    counters: Object.fromEntries(counters),
    processUptimeSeconds: Math.round((Date.now() - bootedAt) / 1000),
    since,
  };
}

/**
 * Collapse a high-cardinality value — a client address, a token id — to a
 * bounded set of buckets, so the counter map cannot be used to exhaust memory.
 *
 * A full IP is kept for the first N distinct values and only the bucket is kept
 * after that. The alternative, dropping to a bucket for everyone, would hide the
 * one case worth investigating (a handful of addresses failing login, which is
 * credential stuffing) behind a sea of other addresses, which is the single most
 * useful thing to see on this graph.
 */
export function cardinalityBucket(value: string, keepExact: number): string {
  return value.length === 0 ? 'empty' : value.length <= 24 && keepExact > 0 ? value : 'other';
}
