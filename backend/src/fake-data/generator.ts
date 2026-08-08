import { faker } from '@faker-js/faker';
import { PERSONAS, PersonaConfig, PersonaKey } from './personas';

export interface GeneratedSnapshot {
  monthIndex: number;
  month: Date;
  mrr: number;
  newMrr: number;
  expansionMrr: number;
  contractionMrr: number;
  churnedMrr: number;
  newCustomers: number;
  churnedCustomers: number;
  totalCustomers: number;
  burnRate: number;
  cash: number;
}

export interface GeneratedCohort {
  customerId: string;
  signupMonth: Date;
  status: 'active' | 'churned';
  mrrByMonth: Record<string, number>;
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function seasonalDipFactor(monthDate: Date): number {
  const m = monthDate.getUTCMonth(); // 0=Jan, 11=Dec
  if (m === 11 || m === 0) return 0.92; // small Dec/Jan dip, not dramatic
  return 1;
}

/**
 * Produces `months` of realistic MetricSnapshot-shaped data for one persona.
 * Deliberately avoids independent-random-field noise (PRD explicitly calls
 * this out as a tell for fake demo data): growth, churn, burn, and cash are
 * all derived from a running state so month-to-month correlations hold.
 */
export function generateSnapshots(personaKey: PersonaKey, months = 24, startDate = new Date(Date.UTC(2024, 0, 1))): GeneratedSnapshot[] {
  const p = PERSONAS[personaKey];
  const out: GeneratedSnapshot[] = [];

  let mrr = p.startingMrr;
  let cash = p.startingCash;
  let burn = p.startingCash / 18; // rough initial monthly burn
  let totalCustomers = Math.round(p.startingMrr / 120); // assume ~$120 ARPU seed
  let monthsSinceBurnStep = 0;
  let nextBurnStepAt = Math.round(rand(...p.burnStepUpEveryMonths));
  let churnRate = p.baseChurnRate;

  for (let i = 0; i < months; i++) {
    const month = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + i, 1));
    const inPlateau = p.plateauMonth !== undefined && i >= p.plateauMonth;

    // growth phase vs plateau/decline
    let growthRate = rand(...p.monthlyGrowthRange);
    if (inPlateau) {
      // decelerate linearly toward ~1/3 of original pace by month plateau+12
      const monthsPastPlateau = i - (p.plateauMonth as number);
      const decay = Math.max(0.3, 1 - monthsPastPlateau * 0.06);
      growthRate *= decay;
      churnRate += p.churnDrift * (1 / 12); // creeps up gradually
    } else if (p.churnDrift && p.key === 'struggling') {
      churnRate += p.churnDrift * (1 / 12);
    }

    // event-month churn spike (price change etc.), not pure randomness
    const isEventMonth = p.eventMonths.includes(i);
    const effectiveChurnRate = isEventMonth ? churnRate * 1.8 : churnRate;

    const seasonal = seasonalDipFactor(month);

    const newCustomers = Math.max(0, Math.round(totalCustomers * growthRate * seasonal + rand(-1, 1)));
    const churnedCustomers = Math.max(0, Math.round(totalCustomers * effectiveChurnRate));
    totalCustomers = Math.max(0, totalCustomers + newCustomers - churnedCustomers);

    const arpu = mrr / Math.max(1, totalCustomers - newCustomers + churnedCustomers || 1);
    const newMrr = newCustomers * arpu * seasonal;
    const churnedMrr = churnedCustomers * arpu;
    const expansionMrr = p.expansionMrrRate > 0 ? mrr * p.expansionMrrRate * rand(0.7, 1.3) : 0;
    const contractionMrr = p.key === 'struggling' ? mrr * 0.01 * rand(0.5, 1.5) : mrr * 0.002 * rand(0.5, 1.5);

    mrr = Math.max(0, mrr + newMrr + expansionMrr - contractionMrr - churnedMrr);

    // burn rises step-wise (hiring waves), flat between steps
    monthsSinceBurnStep++;
    if (monthsSinceBurnStep >= nextBurnStepAt) {
      burn *= 1 + rand(...p.burnStepUpPct);
      monthsSinceBurnStep = 0;
      nextBurnStepAt = Math.round(rand(...p.burnStepUpEveryMonths));
    }
    // burn eases very slightly with revenue growth (efficiency), still net-up over time
    const netBurn = Math.max(1000, burn - mrr * 0.15);

    cash = cash - netBurn;

    out.push({
      monthIndex: i,
      month,
      mrr: round2(mrr),
      newMrr: round2(newMrr),
      expansionMrr: round2(expansionMrr),
      contractionMrr: round2(contractionMrr),
      churnedMrr: round2(churnedMrr),
      newCustomers,
      churnedCustomers,
      totalCustomers,
      burnRate: round2(netBurn),
      cash: round2(cash),
    });
  }

  return out;
}

/**
 * Cohort-level generation with a realistic retention curve: steep early
 * drop-off (months 0-2) flattening into a long tail, not a flat % applied
 * uniformly. Hypergrowth cohorts are larger but start with slightly worse
 * early retention — a deliberate, realistic trade-off per the PRD.
 */
export function generateCohorts(personaKey: PersonaKey, cohortMonths = 12, trackMonths = 12, startDate = new Date(Date.UTC(2024, 0, 1))): GeneratedCohort[] {
  const p = PERSONAS[personaKey];
  const cohorts: GeneratedCohort[] = [];

  for (let c = 0; c < cohortMonths; c++) {
    const signupMonth = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + c, 1));
    const size = Math.round(rand(...p.cohortSize));

    for (let n = 0; n < size; n++) {
      const customerId = faker.string.uuid();
      const baseArpu = rand(60, 220);
      let alive = true;
      const mrrByMonth: Record<string, number> = {};
      let currentMrr = baseArpu;

      const monthsAvailable = Math.min(trackMonths, cohortMonths - c + trackMonths);
      for (let t = 0; t < monthsAvailable; t++) {
        if (!alive) break;
        // steep early churn risk, flattening tail
        const earlyFactor = t < 3 ? p.cohortEarlyChurnMultiplier : t < 6 ? 1.3 : 0.6;
        const churnChance = p.baseChurnRate * earlyFactor;

        if (t > 0 && Math.random() < churnChance) {
          alive = false;
          mrrByMonth[String(t)] = 0;
          break;
        }
        // slight expansion drift for non-struggling personas
        if (t > 0 && p.expansionMrrRate > 0 && Math.random() < 0.15) {
          currentMrr *= 1 + rand(0.05, 0.2);
        }
        mrrByMonth[String(t)] = round2(currentMrr);
      }

      cohorts.push({
        customerId,
        signupMonth,
        status: alive ? 'active' : 'churned',
        mrrByMonth,
      });
    }
  }

  return cohorts;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function allPersonaKeys(): PersonaKey[] {
  return Object.keys(PERSONAS) as PersonaKey[];
}

export function personaConfig(key: PersonaKey): PersonaConfig {
  return PERSONAS[key];
}
