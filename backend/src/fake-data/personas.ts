export type PersonaKey = 'steady' | 'hypergrowth' | 'struggling';

export interface PersonaConfig {
  key: PersonaKey;
  companyName: string;
  monthlyGrowthRange: [number, number]; // MoM % as decimal, applies while "in growth phase"
  plateauMonth?: number;                // month index where growth decelerates (hypergrowth only)
  baseChurnRate: number;                // monthly logo churn, decimal
  churnDrift: number;                   // added to churn per month once past plateau/decline trigger
  burnStepUpEveryMonths: [number, number]; // range of months between hiring-wave step-ups
  burnStepUpPct: [number, number];      // % burn increase per step
  startingMrr: number;
  startingCash: number;
  /** Gross spend per month before revenue offsets it. Explicit so a persona is self-documenting. */
  startingMonthlyBurn: number;
  /** Fraction of MRR that survives to net after COGS. SaaS norms are 0.70-0.85. */
  grossMargin: number;
  /**
   * How much gross profit a cash-flow-positive company reinvests before it
   * reports as profitable. 1.0 = bank the whole profit (runway reads "n/a"),
   * 1.15 = spend 15% beyond gross profit, so burn stays visible and cash
   * keeps moving. Keeping this above 1 is what stops a growing demo persona
   * from flatlining at zero burn halfway through the series.
   */
  reinvestmentRatio: number;
  expansionMrrRate: number;             // expansion as % of starting MRR, decimal (0 for struggling)
  cohortSize: [number, number];         // new customers per cohort month
  cohortEarlyChurnMultiplier: number;   // multiplier on churn for months 0-2 of a cohort's life
  eventMonths: number[];                // months with a "price change" style churn spike
}

/**
 * Three persona definitions used by both the DB seed script and the
 * in-memory fake-data repository (ENABLE_DATABASE=false path), so both
 * sources of demo data stay in sync per the PRD's "generator logic shared"
 * requirement.
 */
export const PERSONAS: Record<PersonaKey, PersonaConfig> = {
  steady: {
    key: 'steady',
    companyName: 'Northlane Analytics',
    monthlyGrowthRange: [0.08, 0.12],
    baseChurnRate: 0.02,
    churnDrift: 0,
    burnStepUpEveryMonths: [4, 6],
    burnStepUpPct: [0.08, 0.15],
    startingMrr: 8000,
    startingCash: 205000,
    startingMonthlyBurn: 14000,
    grossMargin: 0.78,
    reinvestmentRatio: 1.15,
    expansionMrrRate: 0.03,
    cohortSize: [8, 14],
    cohortEarlyChurnMultiplier: 1.6,
    eventMonths: [],
  },
  hypergrowth: {
    key: 'hypergrowth',
    companyName: 'Fathom Metrics',
    monthlyGrowthRange: [0.15, 0.2],
    plateauMonth: 12,
    baseChurnRate: 0.018,
    churnDrift: 0.006, // per month past plateau, support/quality strain
    burnStepUpEveryMonths: [3, 4],
    burnStepUpPct: [0.12, 0.22],
    startingMrr: 5000,
    startingCash: 420000,
    startingMonthlyBurn: 26000,
    grossMargin: 0.75,
    reinvestmentRatio: 1.15,
    expansionMrrRate: 0.045,
    cohortSize: [18, 30],
    cohortEarlyChurnMultiplier: 2.0, // larger cohorts, worse early retention — realistic trade-off
    eventMonths: [9],
  },
  struggling: {
    key: 'struggling',
    companyName: 'Ledger & Vine',
    monthlyGrowthRange: [-0.03, 0.02],
    baseChurnRate: 0.045,
    churnDrift: 0.004,
    burnStepUpEveryMonths: [5, 7],
    burnStepUpPct: [0.03, 0.06],
    startingMrr: 12000,
    startingCash: 175000,
    startingMonthlyBurn: 22000,
    grossMargin: 0.72,
    reinvestmentRatio: 0.85,
    expansionMrrRate: 0.0,
    cohortSize: [4, 8],
    cohortEarlyChurnMultiplier: 2.4,
    eventMonths: [6, 14],
  },
};
