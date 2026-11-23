import { useMemo } from 'react';
import {
  Area, Bar, BarChart, CartesianGrid, ComposedChart, LabelList, Line, LineChart,
  ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useI18n } from '../lib/i18n.jsx';
import { useDash } from '../lib/dash.js';
import { excessReturns } from '../lib/metrics.js';
import { ChartCard, ChartTooltip, LegendItem, fmt } from '../components/ui.jsx';
import { MARGIN, axisProps, gridProps, latest, monthLabel, sourceIds } from './common.js';

const RANGE_DAYS = { r6m: 183, r1y: 365, rAll: Infinity };

/** C1 — EMI vs TAIEX and Gamania, indexed to the first 2024 trading day, with event markers. */
export function C1IndexedPrice({ range }) {
  const { t, pickLabel, codeTag } = useI18n();
  const { data, errors, tokens: tk } = useDash();
  const stock = data.emi_stock_daily;
  const events = data.events;

  const { rows, markers } = useMemo(() => {
    if (!stock) return { rows: [], markers: [] };
    const end = new Date(stock.at(-1).date);
    const from = new Date(end.getTime() - RANGE_DAYS[range] * 864e5).toISOString().slice(0, 10);
    const rows = stock.filter((r) => r.date >= from);
    // Snap each event to the first trading day on/after it so the marker sits on the x-axis.
    const markers = (events ? excessReturns(stock, events) : [])
      .map((ev, i) => ({ ...ev, n: i + 1, x: rows.find((r) => r.date >= ev.date)?.date }))
      .filter((m) => m.x && m.date >= from);
    return { rows, markers };
  }, [stock, events, range]);

  const markerByDate = Object.fromEntries(markers.map((m) => [m.x, m]));
  const series = [
    { key: 'emi_index', name: t('emi'), color: tk['series-1'] },
    { key: 'taiex_index', name: t('taiex'), color: tk['series-2'] },
    { key: 'peer_6180_index', name: t('peer'), color: tk['series-3'] },
  ];

  return (
    <ChartCard
      id="C1" title={t('c1')} question={t('c1q')}
      source="TWSE · events.json" asOf={stock?.at(-1)?.date}
      error={errors.emi_stock_daily && 'emi_stock_daily.csv'} empty={!rows.length}
      height={300}
      legend={<>
        {series.map((s) => <LegendItem key={s.key} kind="line" color={s.color}>{s.name}</LegendItem>)}
        <LegendItem kind="tick">{t('events')}{codeTag('M3')}</LegendItem>
      </>}
      table={{
        columns: [
          { key: 'n', label: '#', num: true },
          { key: 'x', label: t('date') },
          { key: 'event_id', label: 'ID', format: (v) => <span className="mono">{v}</span> },
          { key: 'label', label: t('events'), format: (_, r) => pickLabel(r) },
          { key: 'actor', label: t('actor') },
          { key: 'excess', label: 'M3 (%)', num: true, format: (v) => fmt.signed(v, 2) },
        ],
        rows: markers,
      }}
    >
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ ...MARGIN, top: 18 }}>
          <CartesianGrid {...gridProps(tk)} />
          <XAxis dataKey="date" {...axisProps(tk)} tickFormatter={monthLabel} minTickGap={48} />
          <YAxis {...axisProps(tk)} width={44} domain={['auto', 'auto']} axisLine={false} />
          <ReferenceLine y={100} stroke={tk.axis} />
          {markers.map((m) => (
            <ReferenceLine key={m.event_id} x={m.x} stroke={tk.muted} strokeOpacity={0.5}
              label={{ value: m.n, position: 'top', fill: tk.muted, fontSize: 10 }} />
          ))}
          <Tooltip
            cursor={{ stroke: tk.muted, strokeWidth: 1 }}
            content={<ChartTooltip
              labelFormatter={(d) => {
                const m = markerByDate[d];
                return m ? `${d} · #${m.n} ${pickLabel(m)} (M3 ${fmt.signed(m.excess, 2)}%)` : d;
              }}
            />}
          />
          {series.map((s) => (
            <Line key={s.key} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={s.key === 'emi_index' ? 2 : 1.5}
              dot={false} activeDot={{ r: 4, stroke: tk.surface, strokeWidth: 2 }} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

const SEGMENTS = ['new_media', 'warehousing_logistics', 'new_retail', 'other'];

/** C2 — EMI revenue by segment. Emphasis: new media in blue, the rest of EMI in neutrals. */
export function C2Segments() {
  const { t } = useI18n();
  const { data, errors, tokens: tk } = useDash();
  const seg = data.emi_segments ?? [];
  const colors = { new_media: tk['owned-1'], warehousing_logistics: tk['neutral-1'], new_retail: tk['neutral-2'], other: tk['neutral-3'] };

  const rows = useMemo(() => {
    const byYear = {};
    for (const r of seg) {
      const y = (byYear[r.year] ??= { year: r.year, is_estimate: false });
      y[r.segment] = r.revenue_ntd_m;
      y[`${r.segment}_share`] = r.share_pct;
      y.is_estimate ||= r.is_estimate === true;
    }
    return Object.values(byYear).sort((a, b) => a.year - b.year);
  }, [seg]);

  return (
    <ChartCard
      id="C2" title={t('c2')} question={t('c2q')}
      source="MOPS · EMI annual reports" asOf={rows.at(-1)?.year} indicative
      estimate={rows.some((r) => r.is_estimate)} ids={sourceIds(seg)}
      error={errors.emi_segments && 'emi_segments.csv'} empty={!rows.length}
      legend={SEGMENTS.map((s) => <LegendItem key={s} color={colors[s]}>{t(`seg_${s}`)}</LegendItem>)}
      table={{
        columns: [
          { key: 'year', label: t('year'), format: (v, r) => `${v}${r.is_estimate ? ` (${t('estimate')})` : ''}` },
          ...SEGMENTS.map((s) => ({ key: s, label: `${t(`seg_${s}`)} (NT$ m)`, num: true, format: (v, r) => `${fmt.int(v)} · ${fmt.pct(r[`${s}_share`])}` })),
        ],
        rows,
      }}
    >
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ ...MARGIN, top: 22 }} barCategoryGap="30%">
          <CartesianGrid {...gridProps(tk)} />
          <XAxis dataKey="year" {...axisProps(tk)} tickFormatter={(y) => (rows.find((r) => r.year === y)?.is_estimate ? `${y}*` : y)} />
          <YAxis {...axisProps(tk)} width={52} axisLine={false} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}K` : v)} />
          <Tooltip cursor={{ fill: tk.grid, opacity: 0.6 }} content={<ChartTooltip valueFormatter={(v, p) => `${fmt.int(v)} · ${fmt.pct(p.payload[`${p.dataKey}_share`])}`} />} />
          {SEGMENTS.map((s, i) => (
            <Bar key={s} dataKey={s} name={t(`seg_${s}`)} stackId="seg" fill={colors[s]} stroke={tk.surface} strokeWidth={2}
              maxBarSize={24} radius={i === SEGMENTS.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false}>
              {i === SEGMENTS.length - 1 && (
                <LabelList position="top" fill={tk['ink-2']} fontSize={11}
                  valueAccessor={(entry) => fmt.pct(entry.payload?.new_media_share ?? entry.new_media_share)} />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** C3 — Audience share (M5) and trust by brand for the snapshot year. ETtoday highlighted. */
export function C3AudienceTrust({ year }) {
  const { t, codeTag } = useI18n();
  const { data, errors, tokens: tk } = useDash();
  const all = data.market_share ?? [];
  const rows = all.filter((r) => r.year === year);
  const series = [
    { key: 'audience_share_pct', name: `${t('audienceShare')}${codeTag('M5')}`, color: tk['series-1'] },
    { key: 'trust_pct', name: t('trust'), color: tk['series-2'] },
  ];

  return (
    <ChartCard
      id="C3" title={t('c3')} question={t('c3q')}
      source="Reuters Institute DNR" asOf={String(year)} indicative ids={sourceIds(rows)}
      error={errors.market_share && 'market_share.csv'} empty={!rows.length}
      legend={series.map((s) => <LegendItem key={s.key} color={s.color}>{s.name}</LegendItem>)}
      table={{
        columns: [
          { key: 'brand', label: t('brand') },
          { key: 'weekly_use_pct', label: 'Weekly use (%)', num: true, format: (v) => fmt.num(v) },
          { key: 'audience_share_pct', label: `${t('audienceShare')} (%)`, num: true, format: (v) => fmt.num(v) },
          { key: 'trust_pct', label: `${t('trust')} (%)`, num: true, format: (v) => fmt.num(v) },
        ],
        rows,
      }}
    >
      <ResponsiveContainer>
        <BarChart data={rows} margin={MARGIN} barCategoryGap="22%" barGap={2}>
          <CartesianGrid {...gridProps(tk)} />
          <ReferenceArea x1="ETtoday" x2="ETtoday" fill={tk['owned-1']} fillOpacity={0.07} />
          <XAxis dataKey="brand" {...axisProps(tk)} interval={0}
            tick={({ x, y, payload }) => (
              <text x={x} y={y + 12} textAnchor="middle" fontSize={11} fill={payload.value === 'ETtoday' ? tk.ink : tk.muted} fontWeight={payload.value === 'ETtoday' ? 600 : 400}>
                {payload.value}
              </text>
            )} />
          <YAxis {...axisProps(tk)} width={36} axisLine={false} unit="%" />
          <Tooltip cursor={{ fill: tk.grid, opacity: 0.6 }} content={<ChartTooltip valueFormatter={(v) => fmt.pct(v)} />} />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} maxBarSize={14} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** C4 — ETtoday's share of Taiwan's digital ad market (M6), shown as a ceiling with a plausible range. */
export function C4AdShare() {
  const { t } = useI18n();
  const { data, errors, tokens: tk } = useDash();
  const rows = (data.market_share ?? [])
    .filter((r) => r.brand === 'ETtoday' && r.ad_share_pct != null)
    .map((r) => ({ ...r, range: [r.ad_share_low_pct, r.ad_share_pct] }))
    .sort((a, b) => a.year - b.year);

  return (
    <ChartCard
      id="C4" title={t('c4')} question={t('c4q')}
      source="MOPS + DMA Taiwan" asOf={rows.length ? String(latest(rows, 'year')) : null}
      estimate indicative ids={sourceIds(rows)} note={t('adShareNote')}
      error={errors.market_share && 'market_share.csv'} empty={!rows.length}
      legend={<>
        <LegendItem kind="line" color={tk['series-1']}>{t('adShareCeiling')}</LegendItem>
        <LegendItem kind="band" color={tk['series-1']}>{t('adShareRange')}</LegendItem>
      </>}
      table={{
        columns: [
          { key: 'year', label: t('year') },
          { key: 'ad_share_low_pct', label: 'Low (%)', num: true, format: (v) => fmt.num(v) },
          { key: 'ad_share_pct', label: 'Ceiling M6 (%)', num: true, format: (v) => fmt.num(v) },
        ],
        rows,
      }}
    >
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ ...MARGIN, right: 28, top: 16 }}>
          <CartesianGrid {...gridProps(tk)} />
          <XAxis dataKey="year" {...axisProps(tk)} padding={{ left: 24, right: 24 }} />
          <YAxis {...axisProps(tk)} width={36} axisLine={false} unit="%" domain={[0, 'auto']} />
          <Tooltip cursor={{ stroke: tk.muted, strokeWidth: 1 }}
            content={<ChartTooltip valueFormatter={(v) => (Array.isArray(v) ? `${fmt.num(v[0])}–${fmt.num(v[1])}%` : fmt.pct(v))} />} />
          <Area dataKey="range" name={t('adShareRange')} stroke="none" fill={tk['series-1']} fillOpacity={0.12} isAnimationActive={false} />
          <Line dataKey="ad_share_pct" name={t('adShareCeiling')} stroke={tk['series-1']} strokeWidth={2}
            dot={{ r: 4, fill: tk['series-1'], stroke: tk.surface, strokeWidth: 2 }} isAnimationActive={false}>
            <LabelList dataKey="ad_share_pct" position="top" offset={10} fill={tk['ink-2']} fontSize={11} formatter={(v) => fmt.pct(v)} />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
