// Shared Recharts props: recessive hairline grid/axes, muted 11px ticks (dataviz mark specs).
export const axisProps = (tk) => ({
  stroke: tk.axis,
  tick: { fill: tk.muted, fontSize: 11 },
  tickLine: false,
});

export const gridProps = (tk) => ({ stroke: tk.grid, strokeDasharray: undefined, vertical: false });

export const MARGIN = { top: 8, right: 16, bottom: 4, left: 0 };

export const monthLabel = (iso) => (iso ? iso.slice(0, 7) : '');

/** Join the source_ids of rows into a short "A|B +n" string for the card footer. */
export function sourceIds(rows, key = 'source_ids', max = 3) {
  const ids = [...new Set(rows.flatMap((r) => String(r[key] ?? '').split('|').filter(Boolean)))];
  if (!ids.length) return null;
  return ids.slice(0, max).join(' · ') + (ids.length > max ? ` +${ids.length - max}` : '');
}

export const latest = (rows, key) => rows.reduce((m, r) => (r[key] > m ? r[key] : m), rows[0]?.[key]);
