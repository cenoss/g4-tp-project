import { useMemo } from 'react';
import { Bar, BarChart, Cell, LabelList, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CalendarRange, CircleAlert, CircleCheck, CircleDashed, Flag, History } from 'lucide-react';
import { useI18n } from '../lib/i18n.jsx';
import { useDash } from '../lib/dash.js';
import { HORIZONS, PLATFORM_ORDER, decisionBoard, evaluateTriggers, excessReturns, topActionsByHorizon } from '../lib/metrics.js';
import { ChartCard, ConfidenceBadge, Delta, Disclaimer, VerdictBadge, fmt } from '../components/ui.jsx';
import { axisProps } from '../charts/common.js';

export default function ExecutiveBrief() {
  const { t } = useI18n();
  const { data, errors, manifest } = useDash();

  const board = useMemo(
    () => (data.decision_scores ? decisionBoard(data.decision_scores).sort((a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform)) : []),
    [data.decision_scores],
  );

  return (
    <>
      <div className="page-head">
        <h1>{t('briefTitle')}</h1>
        <p>{t('briefSub')}</p>
      </div>

      <Headline board={board} />

      <section className="section" aria-labelledby="sec-verdicts">
        <div className="section-head">
          <h2 id="sec-verdicts">{t('verdictBoard')}</h2>
          <p>{t('verdictBoardSub')}</p>
        </div>
        {errors.decision_scores ? (
          <div className="state" role="alert">{t('fileError', { file: 'decision_scores.json' })}</div>
        ) : (
          <div className="grid grid-4">
            {board.map((p) => <VerdictCard key={p.platform} p={p} />)}
          </div>
        )}
      </section>

      <div className="grid grid-3">
        <div className="span-2" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Scoreboard board={board} />
          <TopActions />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <ParentContext />
          <Triggers />
        </div>
      </div>

      <CompetitiveWatch />
      <Evidence manifest={manifest} />
      <Disclaimer>{t('outsideView')}</Disclaimer>
    </>
  );
}

function Headline({ board }) {
  const { t, lang } = useI18n();
  const { manifest } = useDash();
  // Placeholder headline composed from verdicts until the H4-approved sentence exists.
  const by = (v) => board.filter((p) => p.current.verdict === v).map((p) => p.platform);
  const join = (xs) => (lang === 'zh' ? xs.join('、') : xs.join(lang === 'en' && xs.length > 2 ? ', ' : ' and '));
  const parts = [];
  if (lang === 'zh') {
    if (by('partner').length) parts.push(`深化與 ${join(by('partner'))} 的合作`);
    if (by('mixed').length) parts.push(`對 ${join(by('mixed'))} 採取競合策略`);
    if (by('rival').length) parts.push(`降低對 ${join(by('rival'))} 的依賴`);
  } else {
    if (by('partner').length) parts.push(`Deepen ties with ${join(by('partner'))}`);
    if (by('mixed').length) parts.push(`co-opete with ${join(by('mixed'))}`);
    if (by('rival').length) parts.push(`reduce dependence on ${join(by('rival'))}`);
  }
  const sentence = parts.length ? (lang === 'zh' ? `${parts.join('；')}。` : `${parts.join('; ')}.`) : '—';
  const latestScored = board.map((p) => p.current.scored_date).sort().at(-1);

  return (
    <section className="card headline-card" aria-labelledby="headline">
      <span className="eyebrow">{t('headline')}</span>
      <h2 id="headline">{sentence}</h2>
      <p className="note">{t('headlinePending')}</p>
      <div className="headline-meta">
        <div><span>{t('runDate')}</span><span className="tnum">{manifest?.run_date ?? '—'}</span></div>
        <div><span>H3 · {t('scoredBy')}</span><span>{board[0]?.current.scored_by ?? '—'} · {latestScored ?? '—'}</span></div>
        <div><span>{t('version')}</span><span className="mono">{manifest?.version ?? '—'}</span></div>
      </div>
    </section>
  );
}

function VerdictCard({ p }) {
  const { t } = useI18n();
  const { current, previous, mismatch, verdictChanged } = p;
  const delta = previous ? current.n - previous.n : null;
  return (
    <article className="card verdict-card" data-verdict={current.verdict} aria-label={`${p.platform}: ${t(current.verdict)}, N ${current.n}`}>
      <div className="verdict-top">
        <span className="platform-name">{p.platform}</span>
        <VerdictBadge verdict={current.verdict} />
      </div>
      <div className="n-score">
        <span className="value">{fmt.signed(current.n)}</span>
        <span className="label">N</span>
        {delta != null && (
          <span className="delta" title={`${t('vsPrevious')} (${previous.scored_date})`}>
            <History size={12} aria-hidden /> {fmt.signed(delta)} {t('vsPrevious')}
          </span>
        )}
      </div>
      {verdictChanged && (
        <span className="flag-inline"><Flag size={12} aria-hidden /> {t('verdictChanged')}: {t(previous.verdict)} → {t(current.verdict)}</span>
      )}
      <ConfidenceBadge level={current.confidence} />
      <dl className="breakdown">
        <dt>{t('partnerSide')}</dt><dd>+{current.b}</dd>
        <dt>{t('rivalSide')}</dt><dd>{current.c ? `−${2 * current.c}` : '0'}</dd>
        <dt>{t('ownStrength')}</dt><dd>{fmt.signed(current.f)}</dd>
      </dl>
      {mismatch && <p className="alert-inline" role="alert"><AlertTriangle size={13} aria-hidden style={{ flex: 'none', marginTop: 1 }} />{t('integrity')}</p>}
    </article>
  );
}

/** F3-style diverging bar of N per platform; blue = partner, gray = mixed, red = rival. */
function Scoreboard({ board }) {
  const { t } = useI18n();
  const { errors, tokens: tk } = useDash();
  const rows = board.map((p) => ({ platform: p.platform, n: p.current.n, verdict: p.current.verdict }));
  // Symmetric even bound so ticks land on the ±2 thresholds.
  const max = Math.ceil((Math.max(4, ...rows.map((r) => Math.abs(r.n))) + 1) / 2) * 2;
  return (
    <ChartCard
      id="F3" title={t('scoreboardTitle')} question={t('verdictBoardSub')}
      source="decision_scores.json · H3" asOf={board[0]?.current.scored_date}
      error={errors.decision_scores && 'decision_scores.json'} empty={!rows.length} height={200}
      table={{
        columns: [
          { key: 'platform', label: t('platform') },
          { key: 'n', label: 'N', num: true, format: (v) => fmt.signed(v) },
          { key: 'verdict', label: t('verdictBoard'), format: (v) => t(v) },
        ],
        rows,
      }}
    >
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ top: 18, right: 32, bottom: 0, left: 8 }}>
          <ReferenceArea x1={-1.5} x2={1.5} fill={tk.mixed} fillOpacity={0.1}
            label={{ value: t('mixed'), position: 'insideTop', fill: tk.muted, fontSize: 11, dy: -16 }} />
          <XAxis type="number" domain={[-max, max]} {...axisProps(tk)} ticks={Array.from({ length: max + 1 }, (_, i) => 2 * i - max).filter((v) => v % 2 === 0)} tickFormatter={(v) => fmt.signed(v)} />
          <YAxis type="category" dataKey="platform" {...axisProps(tk)} width={64} axisLine={false} />
          <ReferenceLine x={0} stroke={tk.axis} />
          <ReferenceLine x={2} stroke={tk.partner} strokeOpacity={0.5} label={{ value: t('partner'), position: 'top', fill: tk.muted, fontSize: 11 }} />
          <ReferenceLine x={-2} stroke={tk.rival} strokeOpacity={0.5} label={{ value: t('rival'), position: 'top', fill: tk.muted, fontSize: 11 }} />
          <Tooltip cursor={{ fill: tk.grid, opacity: 0.6 }} content={({ active, payload }) => {
            const r = active && payload?.[0]?.payload;
            return r ? <div className="tooltip"><div className="tooltip-title">{r.platform}</div><div className="tooltip-row"><span className="v">N {fmt.signed(r.n)}</span><span className="n">{t(r.verdict)}</span></div></div> : null;
          }} />
          <Bar dataKey="n" maxBarSize={18} isAnimationActive={false} radius={4}>
            {rows.map((r) => <Cell key={r.platform} fill={tk[r.verdict]} />)}
            <LabelList dataKey="n" position="right" formatter={(v) => fmt.signed(v)} fill={tk['ink-2']} fontSize={11}
              content={({ x, y, width, height, value }) => (
                <text x={value < 0 ? x + width - 8 : x + width + 8} y={y + height / 2 + 4} textAnchor={value < 0 ? 'end' : 'start'} fontSize={11} fill={tk['ink-2']}>
                  {fmt.signed(value)}
                </text>
              )} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function TopActions() {
  const { t } = useI18n();
  const { data, errors } = useDash();
  const recs = data.recommendations ?? [];
  const drafts = recs.filter((r) => r.status !== 'approved').length;
  const byHorizon = topActionsByHorizon(recs);

  return (
    <section className="card" aria-labelledby="sec-actions">
      <header className="card-head">
        <div className="card-head-text">
          <h3 id="sec-actions">{t('topActions')}</h3>
          <p className="q">{t('topActionsSub')}</p>
        </div>
        {drafts > 0 && <span className="tag draft">{t('draftsPending', { n: drafts })}</span>}
      </header>
      {errors.recommendations ? (
        <div className="state" role="alert">{t('fileError', { file: 'recommendations.json' })}</div>
      ) : (
        <div className="grid grid-3">
          {HORIZONS.map((h) => (
            <div className="horizon-col" key={h}>
              <div className="horizon-head"><h4>{t(h)}</h4><span>{t(`${h}Sub`)}</span></div>
              {byHorizon[h].length === 0 && <p className="muted" style={{ fontSize: 12 }}>{t('noActions')}</p>}
              {byHorizon[h].map((r) => <ActionCard key={r.rec_id} r={r} />)}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ActionCard({ r }) {
  const { t } = useI18n();
  return (
    <article className="action-card" id={`rec-${r.rec_id}`} data-verdict={r.verdict}>
      <div className="action-meta">
        <span className="tag mono">{r.rec_id}</span>
        <span className="tag">{r.platform}</span>
        <span className="tag">{t('lever')}: {t(`lever_${r.lever}`)}</span>
      </div>
      <p className="action-text">{r.action}</p>
      <div className="priority-meter" title="Impact × Confidence × Feasibility">
        <span>{t('priority')}</span>
        <span className="track" aria-hidden><span className="fill" style={{ width: `${(r.priority / 27) * 100}%`, display: 'block' }} /></span>
        <span className="tnum" style={{ fontWeight: 600, color: 'var(--ink)' }}>{r.priority}/27</span>
      </div>
      <div className="action-meta" style={{ fontSize: 12, color: 'var(--ink-2)' }}>
        <span>{t('owner')}: {r.owner_role}</span>
        <span>· {t('kpi')}: <span className="mono">{r.kpi}</span> {r.target_direction === 'rise' ? '↑' : '↓'}</span>
      </div>
    </article>
  );
}

function ParentContext() {
  const { t } = useI18n();
  const { data, errors } = useDash();
  const stock = data.emi_stock_daily;
  const seg = data.emi_segments;
  const last = stock?.at(-1);

  // Media weight (M4) = new-media share of EMI revenue, latest year vs previous.
  const media = (seg ?? []).filter((r) => r.segment === 'new_media').sort((a, b) => a.year - b.year);
  const m4 = media.at(-1), m4prev = media.at(-2);

  const reactions = stock && data.events ? excessReturns(stock, data.events.filter((e) => e.actor === 'ETtoday')).filter((e) => e.excess != null) : [];
  const biggest = reactions.sort((a, b) => Math.abs(b.excess) - Math.abs(a.excess))[0];

  return (
    <section className="card" aria-labelledby="sec-parent">
      <header className="card-head">
        <div className="card-head-text">
          <h3 id="sec-parent">{t('parentContext')}</h3>
          <p className="q">{t('contextOnly')}</p>
        </div>
      </header>
      {errors.emi_stock_daily ? <div className="state" role="alert">{t('fileError', { file: 'emi_stock_daily.csv' })}</div> : (
        <div>
          <div className="stat-tile">
            <span className="stat-label">{t('emiIndexed')}</span>
            <span className="stat-value">{fmt.num(last?.emi_index)}
              {last && <Delta value={last.emi_index - last.taiex_index} suffix={` ${t('vsTaiex')}`} />}
            </span>
          </div>
          <div className="stat-tile">
            <span className="stat-label">{t('mediaWeight')}</span>
            <span className="stat-value">{fmt.pct(m4?.share_pct)}
              {m4prev && <Delta value={m4.share_pct - m4prev.share_pct} suffix=" pp" />}
              {m4?.is_estimate === true && <span className="tag estimate">{t('estimate')}</span>}
            </span>
          </div>
          <div className="stat-tile">
            <span className="stat-label">{t('largestReaction')}</span>
            <span className="stat-value">{biggest ? `${fmt.signed(biggest.excess, 2)}%` : '—'}
              {biggest && <span className="mono muted" style={{ fontSize: 11, fontWeight: 400 }}>{biggest.event_id}</span>}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

const TRIGGER_ICON = { fired: CircleAlert, clear: CircleCheck, unavailable: CircleDashed };

function Triggers() {
  const { t } = useI18n();
  const { data, manifest } = useDash();
  const triggers = useMemo(() => evaluateTriggers(data, manifest?.run_date ?? new Date().toISOString().slice(0, 10)), [data, manifest]);
  return (
    <section className="card" aria-labelledby="sec-triggers">
      <header className="card-head">
        <div className="card-head-text">
          <h3 id="sec-triggers">{t('risksTriggers')}</h3>
          <p className="q">{t('risksTriggersSub')}</p>
        </div>
      </header>
      <ul className="trigger-list">
        {triggers.map((tr) => {
          const Icon = TRIGGER_ICON[tr.status];
          return (
            <li key={tr.id}>
              <span className={`trigger-icon ${tr.status}`}><Icon size={15} aria-hidden /></span>
              <div className="trigger-body">
                <div className="trigger-title">{t(`trig_${tr.id}`)} <span className={`status-text ${tr.status}`}>{t(tr.status)}</span></div>
                <div className="trigger-rule">{t(`trig_${tr.id}_rule`)}</div>
                {tr.detail.length > 0 && <div className="trigger-detail mono">{tr.detail.join(' · ')}</div>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CompetitiveWatch() {
  const { t, pickLabel } = useI18n();
  const { data, errors } = useDash();
  const lag = Object.fromEntries((data.amc_pairs ?? []).map((r) => [r.rival, r.median_lag_days]));
  const recent = [...(data.action_response ?? [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const latestWeek = (data.watch_briefs ?? []).map((b) => b.week).sort().at(-1);

  return (
    <section className="card" aria-labelledby="sec-watch">
      <header className="card-head">
        <div className="card-head-text">
          <h3 id="sec-watch">{t('competitiveWatch')}</h3>
          <p className="q">{t('competitiveWatchSub')}</p>
        </div>
        <a className="icon-btn" href={latestWeek ? `#/watch/${latestWeek}` : '#/watch'}>
          <CalendarRange size={14} aria-hidden /> {t('latestWeekly')}{latestWeek && <span className="tnum">· {latestWeek}</span>}
        </a>
      </header>
      {errors.action_response ? <div className="state" role="alert">{t('fileError', { file: 'action_response.json' })}</div> : (
        <ul className="watch-list">
          {recent.map((a) => (
            <li key={a.action_id}>
              <span className="watch-date tnum">{a.date}</span>
              <div className="watch-body">
                <span className="watch-title">{a.actor} · {pickLabel(a)} <span className="tag mono" style={{ marginLeft: 4 }}>{a.action_id}</span></span>
                <span className="muted" style={{ fontSize: 12 }}>{t(`at_${a.action_type}`)}</span>
                <div className="responses">
                  {a.responses.length === 0 && <span className="muted" style={{ fontSize: 12 }}>{t('noResponse')}</span>}
                  {a.responses.map((r) => {
                    const fast = lag[r.responder] != null && r.lag_days <= lag[r.responder];
                    return (
                      <span key={r.responder} className={`resp ${fast ? 'fast' : ''}`} title={fast ? t('withinLag') : t('beyondLag')}>
                        {fast && <AlertTriangle size={11} aria-hidden />}
                        {r.responder} · {r.lag_days}{t('days') === 'days' ? 'd' : '天'}
                        <span className="sr-only">{fast ? t('withinLag') : t('beyondLag')}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Evidence({ manifest }) {
  const { t } = useI18n();
  if (!manifest) return null;
  return (
    <section className="card" aria-labelledby="sec-evidence">
      <header className="card-head">
        <div className="card-head-text">
          <h3 id="sec-evidence">{t('evidence')}</h3>
          <p className="q">
            {t('version')} <span className="mono">{manifest.version}</span> · {t('runDate')} {manifest.run_date} · {t('checkedBy')}: {manifest.checked_by ?? t('unverified')}
          </p>
        </div>
      </header>
      <div className="manifest-files">
        {manifest.files.map((f) => (
          <div key={f.name}>
            <span className="mono">{f.name}</span>
            <span className="muted tnum">{fmt.int(f.rows)} {t('rows')} · <span className="mono" title="checksum">{f.checksum.slice(0, 8)}</span></span>
          </div>
        ))}
      </div>
    </section>
  );
}
