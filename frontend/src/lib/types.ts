export interface DerivedMetrics {
  runwayMonths: number | null;
  runwayZone: 'green' | 'yellow' | 'red' | 'unknown';
  nrr: number | null;
  momGrowthRate: number | null;
  revenueChurnPct: number | null;
  logoChurnPct: number | null;
  threeMoAvgBurn: number | null;
}

export interface Snapshot {
  companyId: string;
  month: string;
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
  notes?: string;
  derived: DerivedMetrics;
}

export interface DashboardResponse {
  snapshots: Snapshot[];
  latest: Snapshot | null;
}

export interface CohortRow {
  cohortLabel: string;
  signupMonth: string;
  size: number;
  logoRetention: number[];
  revenueRetention: number[];
}

export interface CompanySummary {
  id: string;
  name: string;
  persona?: string | null;
}
