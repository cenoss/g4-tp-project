import { useMemo } from 'react';
import {
  Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts';
import { useI18n } from '../lib/i18n.jsx';
import { useDash } from '../lib/dash.js';
import { ChartCard, ChartTooltip, LegendItem, fmt } from '../components/ui.jsx';
import { MARGIN, axisProps, gridProps, sourceIds } from './common.js';

// Platforms keep the same categorical slot everywhere in the app (color follows the entity).
export const PLATFORM_SLOT = { Google: 'series-1', Meta: 'series-2', LINE: 'series-3', YouTube: 'series-4' };

/**
 * C5 — Network effect quadrant: reach (N1) × dependence (N3), bubble size = NEI (N6).
 * Four hues fail the all-pairs CVD floor, so every bubble is also direct-labelled (secondary encoding).
 */
export function C5Quadrant({ year }) {
  const { t, codeTag } = useI18n();
  const { data, errors, tokens: tk } = useDash();
  const rows = (data.network_effects ?? []).filter((r) => r.year === year);

  // Quadrant split at the mean of the four platforms (relative position is what the PRD reads).
  const mid = useMemo(() => {
    if (!rows.length) return { x: 0, y: 0 };
    const avg = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
    return { x: avg('news_reach_pct'), y: avg('dependence_pct') };
  }, [rows]);

  const quadLabel = (style, key) => (
    <span style={{ position: 'absolute', fontSize: 11, color: tk.muted, pointerEvents: 'none', ...style }}>{t(key)}</span>
  );

  return (
    <ChartCard
      id="C5" title={t('c5')} question={t('c5q')}
      source="Reuters DNR + MOPS" asOf={String(year)} estimate indicative ids={sourceIds(rows)}
      error={errors.network_effects && 'network_effects.csv'} empty={!rows.length} height={320}
      legend={<>
        {rows.map((r) => <LegendItem key={r.platform} kind="dot" color={tk[PLATFORM_SLOT[r.platform]]}>{r.platform}</LegendItem>)}
        <span className="legend-item muted">○ {t('nei')}{codeTag('N6')}</span>
      </>}
      table={{
        columns: [
          { key: 'platform', label: t('platform') },
          { key: 'news_reach_pct', label: 'N1 (%)', num: true, format: (v) => fmt.num(v) },
          { key: 'momentum_pp', label: 'N2 (pp)', num: true, format: (v) => fmt.signed(v, 1) },
          { key: 'dependence_pct', label: 'N3 (%)', num: true, format: (v) => fmt.num(v) },
          { key: 'nei_score', label: 'NEI', num: true, format: (v) => fmt.int(v) },
        ],
        rows,
      }}
    >
      {quadLabel({ right: 20, top: 6 }, 'q_hh')}
      {quadLabel({ right: 20, bottom: 40 }, 'q_hl')}
      {quadLabel({ left: 68, top: 6 }, 'q_lh')}
      {quadLabel({ left: 68, bottom: 40 }, 'q_ll')}
      <ResponsiveContainer>
        <ScatterChart margin={{ ...MARGIN, top: 24, right: 24, bottom: 16 }}>
          <CartesianGrid {...gridProps(tk)} vertical />
          <XAxis type="number" dataKey="news_reach_pct" name="N1" unit="%" {...axisProps(tk)} domain={[0, 80]}
            label={{ value: t('newsReach'), position: 'insideBottom', offset: -10, fill: tk.muted, fontSize: 11 }} />
          <YAxis type="number" dataKey="dependence_pct" name="N3" unit="%" {...axisProps(tk)} width={60} domain={[0, 40]} axisLine={false}
            label={{ value: t('dependence'), angle: -90, position: 'insideLeft', offset: 4, fill: tk.muted, fontSize: 11, dy: 50 }} />
          <ZAxis type="number" dataKey="nei_score" range={[160, 1600]} domain={[0, 100]} />
          <ReferenceLine x={mid.x} stroke={tk.axis} />
          <ReferenceLine y={mid.y} stroke={tk.axis} />
          <Tooltip cursor={false} content={({ active, payload }) => {
            const r = active && payload?.[0]?.payload;
            if (!r) return null;
            return (
              <div className="tooltip">
                <div className="tooltip-title">{r.platform} · {year}</div>
                <div className="tooltip-row"><span className="v">{fmt.pct(r.news_reach_pct)}</span><span className="n">{t('newsReach')}</span></div>
                <div className="tooltip-row"><span className="v">{fmt.pct(r.dependence_pct)}</span><span className="n">{t('dependence')}</span></div>
                <div className="tooltip-row"><span className="v">{fmt.int(r.nei_score)}</span><span className="n">{t('nei')}</span></div>
              </div>
            );
          }} />
          {rows.map((r, i) => (
            <Scatter key={r.platform} data={[r]} fill={tk[PLATFORM_SLOT[r.platform]]} fillOpacity={0.8}
              stroke={tk.surface} strokeWidth={2} isAnimationActive={false}>
              <LabelList dataKey="platform" position={labelSide(rows, i)} offset={12} fill={tk.ink} fontSize={12} fontWeight={500} />
            </Scatter>
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// Direct labels carry identity here, so a label that would collide with an earlier nearby bubble flips to the left.
function labelSide(rows, i) {
  const r = rows[i];
  const crowded = rows.slice(0, i).some((o) => Math.abs(o.news_reach_pct - r.news_reach_pct) < 8 && Math.abs(o.dependence_pct - r.dependence_pct) < 4);
  return crowded ? 'left' : 'right';
}

const CHANNELS = ['direct', 'app', 'search', 'social', 'other'];

/** C6 — ETtoday traffic mix. Owned channels (direct, app) in blue; platform channels in neutrals. */
export function C6TrafficMix() {
  const { t, detail } = useI18n();
  const { data, errors, tokens: tk } = useDash();
  const raw = data.traffic_mix ?? [];
  const colors = { direct: tk['owned-1'], app: tk['owned-2'], search: tk['neutral-1'], social: tk['neutral-2'], other: tk['neutral-3'] };

  const rows = useMemo(() => {
    const byYear = {};
    for (const r of raw) {
      const y = (byYear[r.year] ??= { year: String(r.year), owned_total: 0 });
      y[r.channel] = r.share_pct;
      if (r.owned === true || r.owned === 'true') y.owned_total += r.share_pct;
    }
    return Object.values(byYear).sort((a, b) => a.year.localeCompare(b.year));
  }, [raw]);

  const first = rows[0], last = rows.at(-1);

  return (
    <ChartCard
      id="C6" title={t('c6')} question={t('c6q')}
      source="MOPS · EMI annual reports" asOf={last?.year} indicative ids={sourceIds(raw)}
      error={errors.traffic_mix && 'traffic_mix.csv'} empty={!rows.length} height={220}
      legend={<>
        <span className="legend-item" style={{ fontWeight: 500 }}>{t('owned')}:</span>
        {['direct', 'app'].map((c) => <LegendItem key={c} color={colors[c]}>{t(`ch_${c}`)}</LegendItem>)}
        <span className="legend-item" style={{ fontWeight: 500, marginLeft: 8 }}>{t('platformCh')}:</span>
        {['search', 'social', 'other'].map((c) => <LegendItem key={c} color={colors[c]}>{t(`ch_${c}`)}</LegendItem>)}
      </>}
      note={first && last && `${t('ownedRatio')}: ${first.year} ${fmt.pct(first.owned_total)} → ${last.year} ${fmt.pct(last.owned_total)}`}
      table={{
        columns: [
          { key: 'year', label: t('year') },
          ...CHANNELS.map((c) => ({ key: c, label: `${t(`ch_${c}`)} (%)`, num: true, format: (v) => fmt.num(v) })),
          { key: 'owned_total', label: 'N4 (%)', num: true, format: (v) => fmt.num(v) },
        ],
        rows,
      }}
    >
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ ...MARGIN, right: 56 }} barCategoryGap="28%">
          <CartesianGrid {...gridProps(tk)} vertical horizontal={false} />
          <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit="%" {...axisProps(tk)} />
          <YAxis type="category" dataKey="year" {...axisProps(tk)} width={44} axisLine={false} />
          <ReferenceLine x={50} stroke={tk.axis} />
          <Tooltip cursor={{ fill: tk.grid, opacity: 0.6 }} content={<ChartTooltip valueFormatter={(v) => fmt.pct(v)} />} />
          {CHANNELS.map((c, i) => (
            <Bar key={c} dataKey={c} name={t(`ch_${c}`)} stackId="mix" fill={colors[c]} stroke={tk.surface} strokeWidth={2}
              maxBarSize={24} radius={i === CHANNELS.length - 1 ? [0, 4, 4, 0] : 0} isAnimationActive={false}>
              {i === CHANNELS.length - 1 && (
                <LabelList position="right" fill={tk['ink-2']} fontSize={11}
                  valueAccessor={(entry) => `${detail ? 'N4 ' : ''}${fmt.num(entry.payload?.owned_total ?? entry.owned_total, 0)}%`} />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
