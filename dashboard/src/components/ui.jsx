import { useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, Minus, ShieldCheck, Swords, Table2, Handshake } from 'lucide-react';
import { useI18n } from '../lib/i18n.jsx';
import { useDash } from '../lib/dash.js';

export const fmt = {
  num: (v, d = 1) => (v == null ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })),
  int: (v) => (v == null ? '—' : Number(v).toLocaleString('en-US')),
  pct: (v, d = 1) => (v == null ? '—' : `${fmt.num(v, d)}%`),
  signed: (v, d = 0) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmt.num(Math.abs(v), d)}`),
};

/**
 * Standard chart frame. PRD §4.5: every chart shows its source and as-of date, labels
 * estimates, and is bilingual. The table toggle is the accessible fallback for every chart.
 */
export function ChartCard({ id, title, question, source, asOf, estimate, indicative, ids, legend, note, table, error, empty, height = 280, className = '', children }) {
  const { t } = useI18n();
  const [view, setView] = useState('chart');

  let body;
  if (error) body = <div className="state" role="alert">{t('fileError', { file: error })}</div>;
  else if (empty) body = <div className="state">{t('noData')}</div>;
  else if (view === 'table' && table) body = <DataTable {...table} />;
  else body = (
    <div className="chart-box" style={{ height }} role="img" aria-label={`${title}. ${question}`}>
      {children}
    </div>
  );

  return (
    <section className={`card ${className}`} aria-labelledby={`${id}-title`}>
      <header className="card-head">
        <span className="id-badge">{id}</span>
        <div className="card-head-text">
          <h3 id={`${id}-title`}>{title}</h3>
          <p className="q">{question}</p>
        </div>
        {table && !error && !empty && (
          <button className="icon-btn" type="button" onClick={() => setView(view === 'chart' ? 'table' : 'chart')} aria-label={view === 'chart' ? t('showTable') : t('showChart')}>
            {view === 'chart' ? <Table2 size={14} aria-hidden /> : <BarChart3 size={14} aria-hidden />}
            {view === 'chart' ? t('showTable') : t('showChart')}
          </button>
        )}
      </header>
      {legend && view === 'chart' && !error && !empty && <div className="legend">{legend}</div>}
      {body}
      {note && !error && !empty && <p className="card-note">{note}</p>}
      <CardFoot source={source} asOf={asOf} estimate={estimate} indicative={indicative} ids={ids} />
    </section>
  );
}

/** Source line, as-of date and SAMPLE / estimate tags shared by every card. */
export function CardFoot({ source, asOf, estimate, indicative, ids }) {
  const { t } = useI18n();
  const { isSample } = useDash();
  return (
    <footer className="card-foot">
      <span>{t('source')}: {source}</span>
      {asOf && <span>{t('asOf')}: <span className="tnum">{asOf}</span></span>}
      {isSample && <span className="tag estimate">{t('sample')}</span>}
      {estimate && <span className="tag estimate">{t('estimate')}</span>}
      {indicative && <span className="tag">{t('indicative')}</span>}
      {ids && <span className="ids mono" title="Verified record IDs">{ids}</span>}
    </footer>
  );
}

export function DataTable({ columns, rows }) {
  return (
    <div className="table-wrap" tabIndex={0}>
      <table className="data">
        <thead>
          <tr>{columns.map((c) => <th key={c.key} className={c.num ? 'num' : ''} scope="col">{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => <td key={c.key} className={c.num ? 'num' : ''}>{c.format ? c.format(r[c.key], r) : (r[c.key] ?? '—')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LegendItem({ color, kind = 'rect', children }) {
  const cls = { rect: 'key-rect', line: 'key-line', dot: 'key-dot', band: 'key-band', tick: 'key-tick' }[kind];
  return (
    <span className="legend-item">
      <span className={cls} style={kind === 'tick' ? undefined : { background: color }} aria-hidden />
      {children}
    </span>
  );
}

/** Recharts tooltip content: value leads, name follows, keyed by a short line in the series color. */
export function ChartTooltip({ active, payload, label, labelFormatter, valueFormatter = (v) => fmt.num(v), nameFormatter = (n) => n }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tooltip">
      {label != null && <div className="tooltip-title">{labelFormatter ? labelFormatter(label, payload) : label}</div>}
      {payload.filter((p) => p.value != null).map((p) => (
        <div className="tooltip-row" key={p.dataKey ?? p.name}>
          <span className="key-line" style={{ background: p.color ?? p.payload?.fill }} aria-hidden />
          <span className="v">{valueFormatter(p.value, p)}</span>
          <span className="n">{nameFormatter(p.name, p)}</span>
        </div>
      ))}
    </div>
  );
}

const VERDICT_ICON = { partner: Handshake, mixed: Minus, rival: Swords };

export function VerdictBadge({ verdict }) {
  const { t } = useI18n();
  const Icon = VERDICT_ICON[verdict] ?? Minus;
  return (
    <span className={`verdict-badge ${verdict}`}>
      <Icon size={13} aria-hidden />
      {t(verdict)}
    </span>
  );
}

const CONF_LEVEL = { weak: 1, contested: 1, moderate: 2, strong: 3 };

export function ConfidenceBadge({ level }) {
  const { t } = useI18n();
  const n = CONF_LEVEL[level] ?? 0;
  return (
    <span className="conf" title={`${t('confidence')}: ${t(level)}`}>
      <span className="conf-bars" aria-hidden>{[1, 2, 3].map((i) => <i key={i} className={i <= n ? 'on' : ''} />)}</span>
      {t('confidence')}: {t(level)}
      {(level === 'weak' || level === 'contested') && <AlertTriangle size={12} aria-hidden />}
    </span>
  );
}

export function Delta({ value, goodWhenUp = true, suffix = '', digits = 1 }) {
  if (value == null) return null;
  const up = value > 0;
  const good = up === goodWhenUp;
  const Icon = value === 0 ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`stat-delta ${value === 0 ? '' : good ? 'up' : 'down'}`}>
      <Icon size={12} aria-hidden style={{ verticalAlign: '-1px' }} /> {fmt.signed(value, digits)}{suffix}
    </span>
  );
}

export function Disclaimer({ children }) {
  return (
    <p className="disclaimer"><ShieldCheck size={14} aria-hidden style={{ flex: 'none', marginTop: 2 }} />{children}</p>
  );
}
