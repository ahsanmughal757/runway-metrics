export const chartColors = {
  positive: '#2fd18f',
  negative: '#f2677a',
  accent: '#5b8cff',
  amber: '#f2b84b',
  muted: '#7c88a6',
  axis: '#334066',
};

export const axisTickStyle = { fill: chartColors.muted, fontSize: 11 };

export function monthLabel(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export const tooltipStyle = {
  background: '#182142',
  border: '1px solid #334066',
  borderRadius: 8,
  fontSize: 12,
};
