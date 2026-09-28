import React from 'react';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { type SnapshotInput } from '../metrics/metrics.repository';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: 'Helvetica', color: '#1a2233' },
  title: { fontSize: 20, marginBottom: 4, fontFamily: 'Helvetica-Bold' },
  subtitle: { fontSize: 11, color: '#5c6b82', marginBottom: 20 },
  kpiRow: { flexDirection: 'row', marginBottom: 20 },
  kpiCard: { flex: 1, borderWidth: 1, borderColor: '#d9dee6', borderRadius: 4, padding: 10, marginRight: 8 },
  kpiLabel: { fontSize: 9, color: '#5c6b82', marginBottom: 4, textTransform: 'uppercase' },
  kpiValue: { fontSize: 16, fontFamily: 'Helvetica-Bold' },
  sectionTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginTop: 16, marginBottom: 8 },
  narrative: { fontSize: 10.5, lineHeight: 1.5, marginBottom: 10 },
  table: { marginTop: 6 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#eceff3', paddingVertical: 4 },
  tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1a2233', paddingBottom: 4, marginBottom: 2 },
  cell: { flex: 1, fontSize: 9.5 },
  headerCell: { flex: 1, fontSize: 9.5, fontFamily: 'Helvetica-Bold' },
  footer: { position: 'absolute', bottom: 24, left: 40, right: 40, fontSize: 8, color: '#9aa5b5', textAlign: 'center' },
});

export interface InvestorUpdateData {
  companyName: string;
  periodLabel: string;
  narrativeSections: { heading: string; body: string }[];
  latest: {
    mrr: number;
    momGrowthRate: number | null;
    runwayMonths: number | null;
    nrr: number | null;
    revenueChurnPct: number | null;
    cash: number;
  };
  snapshots: SnapshotInput[];
  generatedAt: string;
}

function fmtCurrency(n: number) {
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function InvestorUpdateDocument({ data }: { data: InvestorUpdateData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{data.companyName} — Investor Update</Text>
        <Text style={styles.subtitle}>
          {data.periodLabel} · Generated {data.generatedAt}
        </Text>

        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>MRR</Text>
            <Text style={styles.kpiValue}>{fmtCurrency(data.latest.mrr)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>MoM Growth</Text>
            <Text style={styles.kpiValue}>{data.latest.momGrowthRate ?? '—'}%</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>NRR</Text>
            <Text style={styles.kpiValue}>{data.latest.nrr ?? '—'}%</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Runway</Text>
            <Text style={styles.kpiValue}>{data.latest.runwayMonths ?? '—'} mo</Text>
          </View>
        </View>

        {data.narrativeSections.map((s, i) => (
          <View key={i}>
            <Text style={styles.sectionTitle}>{s.heading}</Text>
            <Text style={styles.narrative}>{s.body}</Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Metric History</Text>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.headerCell}>Month</Text>
            <Text style={styles.headerCell}>MRR</Text>
            <Text style={styles.headerCell}>Burn</Text>
            <Text style={styles.headerCell}>Cash</Text>
            <Text style={styles.headerCell}>Customers</Text>
          </View>
          {data.snapshots.slice(-12).map((s, i) => (
            <View style={styles.tableRow} key={i}>
              <Text style={styles.cell}>{new Date(s.month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</Text>
              <Text style={styles.cell}>{fmtCurrency(s.mrr)}</Text>
              <Text style={styles.cell}>{fmtCurrency(s.burnRate)}</Text>
              <Text style={styles.cell}>{fmtCurrency(s.cash)}</Text>
              <Text style={styles.cell}>{s.totalCustomers}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.footer} fixed>
          {data.companyName} · Confidential — prepared for investors and board members only
        </Text>
      </Page>
    </Document>
  );
}

export async function renderInvestorUpdatePdf(data: InvestorUpdateData): Promise<Buffer> {
  return renderToBuffer(<InvestorUpdateDocument data={data} />);
}
