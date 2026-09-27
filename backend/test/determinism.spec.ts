import { generateSnapshots, generateCohorts, round2 } from '../src/fake-data/generator';
import { allPersonaKeys, personaConfig } from '../src/fake-data/generator';
import { createRng, seedFrom } from '../src/fake-data/random';
import type { PersonaKey } from '../src/fake-data/personas';

/**
 * Regression cover for the 1a data-correctness work.
 *
 * The headline bug: the generator used `Math.random()` and never seeded faker,
 * so every `GET /dashboard` returned different numbers. A founder would send an
 * investor-update PDF that disagreed with the screen it was generated from, and
 * a share link would show different figures on every refresh.
 */
describe('demo data determinism', () => {
  describe('generateSnapshots', () => {
    it('returns identical data on repeated calls', () => {
      const a = generateSnapshots('steady', 24);
      const b = generateSnapshots('steady', 24);
      const c = generateSnapshots('steady', 24);

      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(JSON.stringify(a)).toBe(JSON.stringify(c));
    });

    it('is unaffected by an unrelated generator running first', () => {
      // A shared global PRNG would make the snapshot series depend on whatever
      // happened to be called before it.
      const baseline = JSON.stringify(generateSnapshots('hypergrowth', 24));

      generateCohorts('struggling', 12, 12);
      generateSnapshots('steady', 6);
      generateCohorts('steady', 4, 4);

      expect(JSON.stringify(generateSnapshots('hypergrowth', 24))).toBe(baseline);
    });

    it('produces different data for different personas', () => {
      const steady = JSON.stringify(generateSnapshots('steady', 24));
      const hypergrowth = JSON.stringify(generateSnapshots('hypergrowth', 24));
      const struggling = JSON.stringify(generateSnapshots('struggling', 24));

      expect(new Set([steady, hypergrowth, struggling]).size).toBe(3);
    });

    it('returns a prefix of the longer series for a shorter window', () => {
      // A time series must not reshuffle history when a caller asks for fewer
      // months, or the 6-month and 24-month views would disagree about the past.
      const six = generateSnapshots('steady', 6);
      const twelve = generateSnapshots('steady', 12);
      const twentyFour = generateSnapshots('steady', 24);

      expect(six).toEqual(twelve.slice(0, 6));
      expect(twelve).toEqual(twentyFour.slice(0, 12));
    });

    it('covers the requested number of consecutive months', () => {
      const snaps = generateSnapshots('steady', 24);

      expect(snaps).toHaveLength(24);
      for (let i = 1; i < snaps.length; i++) {
        const prev = new Date(snaps[i - 1].month);
        const curr = new Date(snaps[i].month);
        expect(curr.getUTCMonth()).toBe((prev.getUTCMonth() + 1) % 12);
        expect(curr.getUTCDate()).toBe(1);
      }
    });
  });

  describe('generateCohorts', () => {
    it('returns identical data on repeated calls, including customer ids', () => {
      const a = generateCohorts('steady', 12, 12);
      const b = generateCohorts('steady', 12, 12);

      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(a.map((c) => c.customerId)).toEqual(b.map((c) => c.customerId));
    });

    it('never emits duplicate customer ids within a run', () => {
      for (const key of allPersonaKeys()) {
        const ids = generateCohorts(key, 12, 12).map((c) => c.customerId);
        expect(new Set(ids).size).toBe(ids.length);
      }
    });

    it('marks a cohort churned exactly when its series reaches zero', () => {
      for (const entry of generateCohorts('steady', 12, 12)) {
        const values = Object.entries(entry.mrrByMonth).map(([k, v]) => [Number(k), v] as const);
        const reachedZero = values.some(([, v]) => v === 0);

        if (reachedZero) {
          expect(entry.status).toBe('churned');
          // Once churned, nothing is tracked afterwards.
          const zeroIndex = values.findIndex(([, v]) => v === 0);
          expect(values.length - 1).toBe(zeroIndex);
        } else {
          expect(entry.status).toBe('active');
          expect(values.every(([, v]) => v > 0)).toBe(true);
        }
      }
    });

    it('always records month 0 revenue', () => {
      for (const entry of generateCohorts('hypergrowth', 6, 6)) {
        expect(entry.mrrByMonth['0']).toBeGreaterThan(0);
      }
    });
  });

  describe('seeded PRNG', () => {
    it('produces a stable stream for a given seed', () => {
      const a = createRng(1234);
      const b = createRng(1234);
      const first = Array.from({ length: 10 }, () => a.next());
      const second = Array.from({ length: 10 }, () => b.next());

      expect(first).toEqual(second);
    });

    it('respects the requested bounds', () => {
      const rng = createRng(99);
      for (let i = 0; i < 500; i++) {
        const f = rng.float(5, 9);
        expect(f).toBeGreaterThanOrEqual(5);
        expect(f).toBeLessThan(9);

        const n = rng.int(1, 3);
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(3);
      }
    });

    it('handles inverted bounds instead of returning garbage', () => {
      const rng = createRng(7);
      const f = rng.float(9, 5);
      expect(f).toBeGreaterThanOrEqual(5);
      expect(f).toBeLessThanOrEqual(9);
    });

    it('derives independent sub-streams', () => {
      const parent = createRng(42);
      const a = parent.derive('snapshots');
      const b = parent.derive('cohorts');

      expect(a.next()).not.toBe(b.next());
    });

    it('derives the same sub-stream for the same label and parent seed', () => {
      // This is what lets two generators use one RNG type without sharing state.
      expect(createRng(42).derive('cohorts').next()).toBe(createRng(42).derive('cohorts').next());
      expect(createRng(42).derive('cohorts').next()).not.toBe(createRng(43).derive('cohorts').next());
    });

    it('derives different seeds from different inputs', () => {
      expect(seedFrom('a', 1)).not.toBe(seedFrom('a', 2));
      expect(seedFrom('a', 1)).toBe(seedFrom('a', 1));
    });
  });

  describe('plausible financial output', () => {
    it.each(allPersonaKeys())('%s never reports negative cash', (key) => {
      // A negative bank balance renders a negative runway, which is nonsense.
      for (const snap of generateSnapshots(key, 24)) {
        expect(snap.cash).toBeGreaterThanOrEqual(0);
      }
    });

    it.each(allPersonaKeys())('%s never reports negative burn', (key) => {
      for (const snap of generateSnapshots(key, 24)) {
        expect(snap.burnRate).toBeGreaterThanOrEqual(0);
      }
    });

    it.each(allPersonaKeys())('%s keeps MRR non-negative and customers sane', (key) => {
      for (const snap of generateSnapshots(key, 24)) {
        expect(snap.mrr).toBeGreaterThanOrEqual(0);
        expect(snap.totalCustomers).toBeGreaterThanOrEqual(0);
        expect(snap.churnedCustomers).toBeLessThanOrEqual(snap.totalCustomers + snap.churnedCustomers);
      }
    });

    it.each(allPersonaKeys())('%s keeps cash monotonically non-increasing', (key) => {
      // Cash only ever leaves the account in this model; an increase would mean
      // a funding round that is not modelled.
      const snaps = generateSnapshots(key, 24);
      for (let i = 1; i < snaps.length; i++) {
        expect(snaps[i].cash).toBeLessThanOrEqual(snaps[i - 1].cash);
      }
    });

    it('lets a growing persona grow and a struggling one decline', () => {
      const steady = generateSnapshots('steady', 24);
      const struggling = generateSnapshots('struggling', 24);

      expect(steady[23].mrr).toBeGreaterThan(steady[0].mrr);
      expect(struggling[23].mrr).toBeLessThan(struggling[0].mrr);
    });

    it('keeps MRR movements consistent with the MRR delta', () => {
      // new + expansion - contraction - churned must reconcile to the change in
      // total MRR, otherwise the dashboard shows movements that do not add up.
      for (const key of allPersonaKeys()) {
        const snaps = generateSnapshots(key, 24);
        for (let i = 1; i < snaps.length; i++) {
          const prev = snaps[i - 1].mrr;
          const curr = snaps[i];
          const movement = curr.newMrr + curr.expansionMrr - curr.contractionMrr - curr.churnedMrr;
          // The generator floors MRR at 0, so a deep decline month can absorb
          // more churn than the balance allows; allow for that floor.
          const expected = Math.max(0, prev + movement);
          expect(curr.mrr).toBeCloseTo(round2(expected), 1);
        }
      }
    });

    it('has each persona start near its configured starting MRR', () => {
      for (const key of allPersonaKeys()) {
        const cfg: ReturnType<typeof personaConfig> = personaConfig(key);
        const first = generateSnapshots(key, 1)[0];
        // Month 0 already applies one month of growth, so allow a wide band.
        expect(first.mrr).toBeGreaterThan(cfg.startingMrr * 0.5);
        expect(first.mrr).toBeLessThan(cfg.startingMrr * 1.5);
      }
    });
  });

  describe('persona configuration', () => {
    it.each(allPersonaKeys())('%s has a self-consistent config', (key: PersonaKey) => {
      const cfg = personaConfig(key);

      expect(cfg.grossMargin).toBeGreaterThan(0.5);
      expect(cfg.grossMargin).toBeLessThanOrEqual(0.95);
      // >=1 means a profitable company keeps spending into its gross profit.
      // <1 means it banks the surplus. Both are valid; nonsense is not.
      expect(cfg.reinvestmentRatio).toBeGreaterThan(0);
      expect(cfg.reinvestmentRatio).toBeLessThanOrEqual(2);
      expect(cfg.startingMonthlyBurn).toBeGreaterThan(0);
      expect(cfg.startingCash).toBeGreaterThan(0);
      expect(cfg.cohortSize[0]).toBeLessThanOrEqual(cfg.cohortSize[1]);
      expect(cfg.monthlyGrowthRange[0]).toBeLessThanOrEqual(cfg.monthlyGrowthRange[1]);
      expect(cfg.burnStepUpEveryMonths[0]).toBeLessThanOrEqual(cfg.burnStepUpEveryMonths[1]);
      expect(cfg.burnStepUpPct[0]).toBeLessThanOrEqual(cfg.burnStepUpPct[1]);
    });
  });

  /**
   * The personas exist to demonstrate three distinct founder situations, so the
   * demo narratives are pinned as contracts. An earlier tuning pass had all
   * three personas reporting negative cash, or flatlining at zero burn, which
   * made the demo actively misleading.
   */
  describe('demo narratives', () => {
    const runwayAt = (snaps: ReturnType<typeof generateSnapshots>, i: number): number | null => {
      const window = snaps.slice(Math.max(0, i - 2), i + 1);
      const avgBurn = window.reduce((a, s) => a + s.burnRate, 0) / window.length;
      return avgBurn > 0 ? snaps[i].cash / avgBurn : null;
    };

    it('steady grows and lands in the yellow runway band', () => {
      const snaps = generateSnapshots('steady', 24);
      const runway = runwayAt(snaps, 23);

      expect(snaps[23].mrr).toBeGreaterThan(snaps[0].mrr);
      expect(runway).not.toBeNull();
      expect(runway!).toBeGreaterThanOrEqual(6);
      expect(runway!).toBeLessThan(12);
    });

    it('hypergrowth outruns its cash and ends in the red', () => {
      // The canonical hypergrowth failure: revenue compounds faster than the
      // balance sheet, which is exactly what this product exists to show.
      const snaps = generateSnapshots('hypergrowth', 24);
      const runway = runwayAt(snaps, 23);

      expect(snaps[23].mrr).toBeGreaterThan(snaps[0].mrr * 5);
      expect(runway).not.toBeNull();
      expect(runway!).toBeLessThan(6);
    });

    it('struggling declines and runs out of cash', () => {
      const snaps = generateSnapshots('struggling', 24);

      expect(snaps[23].mrr).toBeLessThan(snaps[0].mrr);
      expect(snaps.some((s) => s.cash === 0)).toBe(true);
    });

    it('keeps burn visible for every persona that is still solvent', () => {
      // A frozen burn line reads as a broken dashboard, not a healthy company.
      for (const key of ['steady', 'hypergrowth'] as PersonaKey[]) {
        const snaps = generateSnapshots(key, 24);
        const last = snaps[snaps.length - 1];
        expect(last.burnRate).toBeGreaterThan(0);
      }
    });
  });
});
