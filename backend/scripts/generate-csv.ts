/**
 * Standalone CLI: generates a downloadable CSV of MetricSnapshot rows for a
 * given persona, using the same generator the seed script and the
 * ENABLE_DATABASE=false repository path use. This is the "CSV Import" demo
 * path referenced in the PRD — same source, no DB required.
 *
 * Usage: npx ts-node scripts/generate-csv.ts --persona=hypergrowth --out=./hypergrowth.csv
 */
import * as fs from 'fs';
import { generateSnapshots } from '../src/fake-data/generator';
import { PersonaKey } from '../src/fake-data/personas';

function arg(name: string, fallback: string): string {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split('=')[1] : fallback;
}

const persona = arg('persona', 'steady') as PersonaKey;
const outPath = arg('out', `./${persona}-snapshots.csv`);
const months = Number(arg('months', '24'));

const rows = generateSnapshots(persona, months);
const header = ['month', 'mrr', 'newMrr', 'expansionMrr', 'contractionMrr', 'churnedMrr', 'newCustomers', 'churnedCustomers', 'totalCustomers', 'burnRate', 'cash'];
const lines = [header.join(',')];

for (const r of rows) {
  lines.push([
    r.month.toISOString().slice(0, 10),
    r.mrr, r.newMrr, r.expansionMrr, r.contractionMrr, r.churnedMrr,
    r.newCustomers, r.churnedCustomers, r.totalCustomers, r.burnRate, r.cash,
  ].join(','));
}

fs.writeFileSync(outPath, lines.join('\n'));
console.log(`Wrote ${rows.length} rows to ${outPath}`);
