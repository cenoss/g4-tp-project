import { useMemo } from 'react';
import {
  CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useI18n } from '../lib/i18n.jsx';
import { useDash } from '../lib/dash.js';
import { ChartCard, LegendItem, fmt } from '../components/ui.jsx';
import { MARGIN, axisProps, gridProps, monthLabel } from './common.js';

// §5.3: a mover with response likelihood (A4) below 0.5 is not a close rival.
const CLOSE_RIVAL = 0.5;

/** C7 — Competitor map: market commonality (A1) × resource similarity (A2); emphasis on likely responders. */
export function C7CompetitorMap() {
  const { t } = useI18n();
  const { data, errors, tokens: tk } = useDash();
  const rows = data.amc_pairs ?? [];
  const likely = rows.filter((r) => r.likelihood >= CLOSE_RIVAL);
  const unlikely = rows.filter((r) => r.likelihood < CLOSE_RIVAL);

  const tip = ({ active, payload }) => {
    const r = active && payload?.[0]?.payload;
    if (!r) return null;
    return (
      <div className="tooltip">
        <div className="tooltip-title">{r.rival}</div>
        <div className="tooltip-row"><span className="v">{fmt.num(r.likelihood, 2)}</span><span className="n">{t('likelihood')}</span></div>
        <div className="tooltip-row"><span className="v">{fmt.num(r.mc, 2)} · {fmt.num(r.rs, 2)}</span><span className="n">A1 · A2</span></div>
        <div className="tooltip-row"><span className="v">{r.awareness}/{r.motivation}/{r.capability}</span><span className="n">A · M · C</span></div>
        <div className="tooltip-row"><span className="v">{r.median_lag_days} {t('days')}</span><span className="n">{t('medianLag')}</span></div>
      </div>
    );
  };

  const dots = (list, color) => (
    <Scatter data={list} fill={color} stroke={tk.surface} strokeWidth={2} isAnimationActive={false}
      shape={(p) => <circle cx={p.cx} cy={p.cy} r={6} fill={color} stroke={tk.surface} strokeWidth={2} />}>
      <LabelList dataKey="rival" position="right" offset={10} fill={tk.ink} fontSize={11.5} />
    </Scatter>
  );

  return (
    <ChartCard
      id="C7" title={t('c7')} question={t('c7q')}
      source="amc_pairs.json · Strategy pair scores" asOf={null}
      error={errors.amc_pairs && 'amc_pairs.json'} empty={!rows.length} height={300}
      legend={<>
        <LegendItem kind="dot" color={tk['series-1']}>{t('likelyResponder')}</LegendItem>
        <LegendItem kind="dot" color={tk['emphasis-muted']}>{t('unlikelyResponder')}</LegendItem>
      </>}
      table={{
        columns: [
          { key: 'rival', label: t('rival_') },
          { key: 'mc', label: 'A1', num: true, format: (v) => fmt.num(v, 2) },
          { key: 'rs', label: 'A2', num: true, format: (v) => fmt.num(v, 2) },
          { key: 'awareness', label: 'A', num: true },
          { key: 'motivation', label: 'M', num: true },
          { key: 'capability', label: 'C', num: true },
          { key: 'likelihood', label: 'A4', num: true, format: (v) => fmt.num(v, 2) },
          { key: 'median_lag_days', label: `A5 (${t('days')})`, num: true },
        ],
        rows: [...rows].sort((a, b) => b.likelihood - a.likelihood),
      }}
    >
      <ResponsiveContainer>
        <ScatterChart margin={{ ...MARGIN, right: 56, bottom: 16 }}>
          <CartesianGrid {...gridProps(tk)} vertical />
          <XAxis type="number" dataKey="mc" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} {...axisProps(tk)}
            label={{ value: t('commonality'), position: 'insideBottom', offset: -10, fill: tk.muted, fontSize: 11 }} />
          <YAxis type="number" dataKey="rs" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} {...axisProps(tk)} width={56} axisLine={false}
            label={{ value: t('similarity'), angle: -90, position: 'insideLeft', offset: 4, fill: tk.muted, fontSize: 11, dy: 50 }} />
          <ReferenceLine x={0.5} stroke={tk.axis} />
          <ReferenceLine y={0.5} stroke={tk.axis} />
          <Tooltip cursor={false} content={tip} />
          {dots(unlikely, tk['emphasis-muted'])}
          {dots(likely, tk['series-1'])}
        </ScatterChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** C8 — Action–response swim lanes: each move links to the responses it drew, one lane per actor. */
export function C8Timeline() {
  const { t, pickLabel } = useI18n();
  const { data, errors, tokens: tk } = useDash();
  const actions = data.action_response ?? [];

  const { lanes, moves, responses, links, domain, tableRows } = useMemo(() => {
    const order = ['ETtoday', 'Google', 'Meta', 'LINE', 'YouTube', 'NOWnews', 'TVBS', 'SETN', 'EBC', 'UDN', 'LTN', 'CNA'];
    const present = new Set(actions.flatMap((a) => [a.actor, ...a.responses.map((r) => r.responder)]));
    const lanes = order.filter((l) => present.has(l));
    const laneIdx = Object.fromEntries(lanes.map((l, i) => [l, i]));
    const ts = (d) => new Date(d).getTime();
    const moves = actions.map((a) => ({ ...a, x: ts(a.date), y: laneIdx[a.actor] }));
    const responses = actions.flatMap((a) => a.responses.map((r) => ({ ...r, action_id: a.action_id, mover: a.actor, x: ts(r.date), y: laneIdx[r.responder] })));
    const links = actions.flatMap((a) => a.responses.map((r) => ({ id: `${a.action_id}-${r.responder}`, pts: [{ x: ts(a.date), y: laneIdx[a.actor] }, { x: ts(r.date), y: laneIdx[r.responder] }] })));
    const xs = [...moves, ...responses].map((p) => p.x);
    const domain = xs.length ? [Math.min(...xs) - 15 * 864e5, Math.max(...xs) + 15 * 864e5] : [0, 1];
    const tableRows = actions.flatMap((a) => (a.responses.length ? a.responses : [null]).map((r) => ({
      action_id: a.action_id, date: a.date, actor: a.actor, action_type: a.action_type, label: pickLabel(a),
      responder: r?.responder ?? '—', rdate: r?.date ?? '—', lag: r?.lag_days ?? null,
    })));
    return { lanes, moves, responses, links, domain, tableRows };
  }, [actions, pickLabel]);

  const tip = ({ active, payload }) => {
    const p = active && payload?.[0]?.payload;
    if (!p) return null;
    const isMove = p.action_id && p.responses;
    return (
      <div className="tooltip">
        <div className="tooltip-title">{isMove ? `${p.action_id} · ${p.date}` : `${p.action_id} → ${p.responder}`}</div>
        {isMove ? (
          <>
            <div className="tooltip-row"><span className="v">{p.actor}</span><span className="n">{pickLabel(p)}</span></div>
            <div className="tooltip-row"><span className="n">{t(`at_${p.action_type}`)} · {p.responses.length} {t('response').toLowerCase()}</span></div>
          </>
        ) : (
          <div className="tooltip-row"><span className="v">{p.lag_days} {t('days')}</span><span className="n">{t('lag')} · {p.date}</span></div>
        )}
      </div>
    );
  };

  const height = Math.max(240, lanes.length * 34 + 60);

  return (
    <ChartCard
      id="C8" title={t('c8')} question={t('c8q')}
      source="action_response.json · events.json" asOf={actions.at(-1)?.date}
      error={errors.action_response && 'action_response.json'} empty={!actions.length} height={height}
      legend={<>
        <LegendItem kind="dot" color={tk['series-1']}>{t('move')} · ETtoday</LegendItem>
        <LegendItem kind="dot" color={tk['series-2']}>{t('move')} · {t('platform')}</LegendItem>
        <LegendItem kind="dot" color={tk['neutral-1']}>{t('response')}</LegendItem>
      </>}
      table={{
        columns: [
          { key: 'action_id', label: 'ID', format: (v) => <span className="mono">{v}</span> },
          { key: 'date', label: t('date') },
          { key: 'actor', label: t('actor') },
          { key: 'label', label: t('move') },
          { key: 'responder', label: t('response') },
          { key: 'rdate', label: t('date') },
          { key: 'lag', label: `${t('lag')} (${t('days')})`, num: true, format: (v) => (v == null ? '—' : v) },
        ],
        rows: tableRows,
      }}
    >
      <ResponsiveContainer>
        <ScatterChart margin={{ ...MARGIN, left: 8, right: 24 }}>
          <CartesianGrid stroke={tk.grid} vertical={false} />
          <XAxis type="number" dataKey="x" domain={domain} scale="time" {...axisProps(tk)}
            tickFormatter={(v) => monthLabel(new Date(v).toISOString())} tickCount={8} />
          <YAxis type="number" dataKey="y" domain={[-0.5, lanes.length - 0.5]} reversed ticks={lanes.map((_, i) => i)}
            tickFormatter={(i) => lanes[i]} {...axisProps(tk)} width={68} axisLine={false} interval={0}
            tick={({ x, y, payload }) => (
              <text x={x} y={y + 4} textAnchor="end" fontSize={11} fill={lanes[payload.value] === 'ETtoday' ? tk.ink : tk.muted} fontWeight={lanes[payload.value] === 'ETtoday' ? 600 : 400}>
                {lanes[payload.value]}
              </text>
            )} />
          <Tooltip cursor={false} content={tip} />
          {links.map((l) => (
            <Scatter key={l.id} data={l.pts} line={{ stroke: tk.axis, strokeWidth: 1 }} shape={() => null} isAnimationActive={false} legendType="none" />
          ))}
          <Scatter data={responses} isAnimationActive={false}
            shape={(p) => <circle cx={p.cx} cy={p.cy} r={4} fill={tk['neutral-1']} stroke={tk.surface} strokeWidth={2} />} />
          <Scatter data={moves} isAnimationActive={false}
            shape={(p) => <circle cx={p.cx} cy={p.cy} r={6} fill={p.payload.actor === 'ETtoday' ? tk['series-1'] : tk['series-2']} stroke={tk.surface} strokeWidth={2} />} />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
