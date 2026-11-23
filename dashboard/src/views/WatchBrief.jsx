import { useMemo } from 'react';
import { AlertTriangle, ArrowRight, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Flag } from 'lucide-react';
import { useI18n } from '../lib/i18n.jsx';
import { useDash } from '../lib/dash.js';
import { PLATFORM_ORDER, diffRecords, evaluateTriggers, firedTriggers, topActionsByHorizon, verdictChanges, verdictShift } from '../lib/metrics.js';
import { CardFoot, Disclaimer, VerdictBadge, fmt, plainSource } from '../components/ui.jsx';

// PRD §5.7 Weekly Platform Watch Brief: one brief at a time, seven blocks, plus the archive.
// Triggers and verdict changes are re-checked with the §5.6 / §2.3 logic in metrics.js; stored values that
// disagree are flagged, never silently replaced.

const FILE = 'watch_briefs.json';
const RESPONSE_ORDER = ['respond_fast', 'respond_selectively', 'cooperate_adapt', 'monitor'];
const goToWeek = (week) => { window.location.hash = `#/watch/${week}`; };

export default function WatchBrief({ section }) {
  const { t } = useI18n();
  const { data, errors } = useDash();
  const briefs = useMemo(() => [...(data.watch_briefs ?? [])].sort((a, b) => b.week.localeCompare(a.week)), [data.watch_briefs]);
  const idx = Math.max(0, briefs.findIndex((b) => b.week === section));
  const brief = briefs[idx];
  const fileError = errors.watch_briefs;

  return (
    <>
      <div className="page-head" id={brief?.week}>
        <h1>{t('watchTitle')}</h1>
        <p>{t('watchSub')}</p>
      </div>

      {!fileError && !brief ? <div className="state">{t('noBriefs')}</div> : (
        <>
          {brief && <WeekSelector briefs={briefs} idx={idx} />}
          <Headline brief={brief} error={fileError} />
          <div className="grid grid-2">
            <Moves brief={brief} error={fileError} />
            <VerdictStatus brief={brief} error={fileError} />
            <TriggersFired brief={brief} error={fileError} />
            <Responses brief={brief} error={fileError} />
            <EmiContext brief={brief} error={fileError} />
            <WatchNext brief={brief} error={fileError} />
          </div>
          <Archive briefs={briefs} current={brief?.week} error={fileError} />
        </>
      )}
      <Disclaimer>{t('outsideView')}</Disclaimer>
    </>
  );
}

/** Card frame for a brief block: fails closed on `error` (the file that is missing or invalid). */
function Panel({ id, title, sub, source, asOf, error, reason, className = '', children }) {
  return (
    <section className={`card ${className}`} aria-labelledby={`${id}-title`}>
      <header className="card-head">
        <div className="card-head-text">
          <h3 id={`${id}-title`}>{title}</h3>
          {sub && <p className="q">{sub}</p>}
        </div>
      </header>
      {error ? <FileError file={error} reason={reason} /> : children}
      <CardFoot source={source} asOf={error ? null : asOf} />
    </section>
  );
}

function FileError({ file, reason }) {
  const { t } = useI18n();
  return (
    <div className="state compact" role="alert">
      <div>
        {t('fileError', { file })}
        {reason && <div className="mono muted" style={{ marginTop: 4 }}>{reason}</div>}
      </div>
    </div>
  );
}

function Quiet({ children }) {
  return <p className="quiet-state"><CircleCheck size={15} aria-hidden />{children}</p>;
}

function Alert({ children }) {
  return <p className="alert-inline" role="alert"><AlertTriangle size={13} aria-hidden style={{ flex: 'none', marginTop: 1 }} />{children}</p>;
}

/** The first file the block depends on that failed, so the block blanks instead of guessing. */
function firstError(errors, fileError, deps) {
  if (fileError) return { error: FILE, reason: fileError };
  const failed = deps.find((d) => errors[d.replace(/\.(csv|json)$/, '')]);
  return failed ? { error: failed, reason: null } : {};
}

function WeekSelector({ briefs, idx }) {
  const { t } = useI18n();
  const older = briefs[idx + 1];
  const newer = briefs[idx - 1];
  return (
    <div className="filterbar">
      <div className="filter">
        <label className="filter-label" htmlFor="week-select">{t('week')}</label>
        <button type="button" className="icon-btn" disabled={!older} onClick={() => goToWeek(older.week)} aria-label={t('prevWeek')}>
          <ChevronLeft size={14} aria-hidden />
        </button>
        <select id="week-select" className="select" value={briefs[idx].week} onChange={(e) => goToWeek(e.target.value)}>
          {briefs.map((b) => (
            <option key={b.week} value={b.week}>
              {b.week} · {b.period_start} – {b.period_end}{b.status === 'draft' ? ` · ${t('draft')}` : ''}
            </option>
          ))}
        </select>
        <button type="button" className="icon-btn" disabled={!newer} onClick={() => goToWeek(newer.week)} aria-label={t('nextWeek')}>
          <ChevronRight size={14} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function Headline({ brief, error }) {
  const { t, pickLabel, detail } = useI18n();
  const { isSample } = useDash();
  if (error) {
    return <Panel id="watch-headline" title={t('headline')} source={FILE} error={FILE} reason={error} />;
  }
  // A null headline means "not yet approved at H4": show a placeholder, never generated text.
  const text = pickLabel(brief, 'headline');
  return (
    <section className="card headline-card" aria-labelledby="watch-headline">
      <div className="headline-top">
        <span className="eyebrow">{t('headline')} · {brief.week}</span>
        {brief.status === 'draft' && <span className="tag draft">{t('draft')}</span>}
        {isSample && <span className="tag estimate">{t('sample')}</span>}
      </div>
      <h2 id="watch-headline" className={text ? undefined : 'pending'}>{text ?? t('headlinePlaceholder')}</h2>
      <div className="headline-meta">
        <div><span>{t('period')}</span><span className="tnum">{brief.period_start} – {brief.period_end}</span></div>
        <div><span>{t('runDate')}</span><span className="tnum">{brief.run_date}</span></div>
        <div><span>{t('status')}</span><span>{t(brief.status)}{brief.approved_by ? ` · ${brief.approved_by}` : ''}</span></div>
      </div>
      <p className="note">{t('source')}: {detail ? FILE : plainSource(FILE, t)} · {t('headlineSource')} · {t('asOf')}: <span className="tnum">{brief.run_date}</span></p>
    </section>
  );
}

function Moves({ brief, error: fileError }) {
  const { t, pickLabel, detail } = useI18n();
  const { data, errors } = useDash();
  const { error, reason } = firstError(errors, fileError, ['events.json']);
  const evById = new Map((data.events ?? []).map((e) => [e.event_id, e]));

  return (
    <Panel id="watch-moves" title={t('movesTitle')} sub={t('movesSub')} source={`${FILE} · events.json · action_response.json`}
      asOf={brief?.period_end} error={error} reason={reason}>
      {brief?.moves.length === 0 ? <Quiet>{t('noMoves')}</Quiet> : (
        <ul className="watch-list">
          {brief?.moves.map((m) => {
            const ev = evById.get(m.event_id);
            const outside = ev && (ev.date < brief.period_start || ev.date > brief.period_end);
            return (
              <li key={m.event_id}>
                <span className="watch-date tnum">{ev?.date ?? '—'}</span>
                <div className="watch-body">
                  <span className="watch-title">
                    {m.actor}{m.platform && m.platform !== m.actor ? ` · ${m.platform}` : ''}{ev ? ` · ${pickLabel(ev)}` : ''}
                    {detail && <span className="tag mono" style={{ marginLeft: 6 }}>{m.event_id}</span>}
                  </span>
                  {ev && <span className="muted" style={{ fontSize: 12 }}>{t(`at_${ev.action_type}`)}</span>}
                  <div className="action-meta" style={{ alignItems: 'center' }}>
                    {detail && <span className="muted" style={{ fontSize: 12 }}>{t('criteria')}:</span>}
                    {detail && m.criteria.map((c) => <span key={c} className="tag mono">{c}</span>)}
                    <span className="muted" style={{ fontSize: 12, marginLeft: detail ? 6 : 0 }}>{t('signal')}:</span>
                    <VerdictBadge verdict={m.relation_signal} />
                  </div>
                  {!ev && <Alert>{t('eventMissing', { id: m.event_id })}</Alert>}
                  {outside && <Alert>{t('eventOutside', { id: m.event_id })}</Alert>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function VerdictStatus({ brief, error: fileError }) {
  const { t, detail } = useI18n();
  const { data, errors } = useDash();
  const { error, reason } = firstError(errors, fileError, ['decision_scores.json']);
  const shift = useMemo(() => {
    if (!brief || !data.decision_scores) return [];
    return verdictShift(data.decision_scores, { from: brief.period_start, to: brief.period_end });
  }, [brief, data.decision_scores]);
  const byPlatform = new Map(shift.map((p) => [p.platform, p]));
  const platforms = [...PLATFORM_ORDER, ...shift.map((p) => p.platform).filter((p) => !PLATFORM_ORDER.includes(p))];

  const computed = verdictChanges(shift);
  const key = (v) => `${v.platform} ${v.verdict_from} → ${v.verdict_to} (${fmt.signed(v.n_from)} → ${fmt.signed(v.n_to)})`;
  const diff = brief ? diffRecords(brief.verdict_changes, computed, key) : { missing: [], extra: [] };
  const asOf = shift.map((p) => p.current.scored_date).sort().at(-1);

  return (
    <Panel id="watch-verdicts" title={t('verdictStatus')} sub={t('verdictStatusSub')} source={`decision_scores.json · H3 · ${FILE}`}
      asOf={asOf} error={error} reason={reason}>
      <ul className="watch-list">
        {platforms.map((name) => {
          const p = byPlatform.get(name);
          return (
            <li key={name} className="verdict-row">
              <span className="platform-name">{name}</span>
              {p ? (
                <>
                  <VerdictBadge verdict={p.current.verdict} />
                  <span className="tnum" style={{ fontWeight: 600 }}>{detail ? 'N' : t('netScore')} {fmt.signed(p.current.n)}</span>
                  <span className="verdict-change">
                    {p.changed
                      ? <span className="flag-inline"><Flag size={12} aria-hidden /> {t('changed')}: {t(p.before.verdict)} → {t(p.current.verdict)} ({fmt.signed(p.before.n)} → {fmt.signed(p.current.n)})</span>
                      : <span className="muted">{t('unchanged')}</span>}
                  </span>
                  {p.mismatch && <Alert>{t('integrity')}</Alert>}
                </>
              ) : <span className="muted verdict-change">{t('noRound')}</span>}
            </li>
          );
        })}
      </ul>
      {(diff.missing.length > 0 || diff.extra.length > 0) && (
        <Alert>{t('verdictMismatch', { computed: computed.map(key).join('; ') || t('none'), stored: brief.verdict_changes.map(key).join('; ') || t('none') })}</Alert>
      )}
    </Panel>
  );
}

function TriggersFired({ brief, error: fileError }) {
  const { t, detail } = useI18n();
  const { data } = useDash();
  const results = useMemo(
    () => (brief ? evaluateTriggers(data, brief.run_date, { from: brief.period_start, to: brief.period_end }) : []),
    [brief, data],
  );
  // Only triggers the rule check could evaluate this week are compared; the rest are listed as not re-checked.
  const checkable = new Set(results.filter((r) => r.status === 'fired' || r.status === 'clear').map((r) => r.id));
  const notChecked = results.filter((r) => !checkable.has(r.id));
  const computed = firedTriggers(results);
  const stored = brief?.triggers_fired ?? [];
  const key = (x) => `${x.trigger}|${x.platform ?? ''}`;
  const compared = stored.filter((x) => checkable.has(x.trigger));
  const diff = diffRecords(compared, computed, key);
  const label = (x) => `${t(`trig_${x.trigger}`)}${x.platform ? ` · ${x.platform}` : ''}`;
  const scope = (x) => x.platform ?? (x.trigger === 'rules' ? t('allPlatforms') : null);

  return (
    <Panel id="watch-triggers" title={t('triggersFired')} sub={t('triggersFiredSub')} source={`${FILE} · PRD §5.6`}
      asOf={brief?.run_date} error={fileError && FILE} reason={fileError}>
      {stored.length === 0 ? <Quiet>{t('noTriggers')}</Quiet> : (
        <ul className="trigger-list">
          {stored.map((x, i) => (
            <li key={`${key(x)}-${i}`}>
              <span className="trigger-icon fired"><CircleAlert size={15} aria-hidden /></span>
              <div className="trigger-body">
                <div className="trigger-title">
                  {t(`trig_${x.trigger}`)}
                  {scope(x) && <span className="tag">{scope(x)}</span>}
                  <span className="status-text fired">{t('fired')}</span>
                </div>
                {detail && x.detail && <div className="trigger-detail mono">{x.detail}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {(diff.missing.length > 0 || diff.extra.length > 0) && (
        <Alert>{t('triggerMismatch', { computed: computed.map(label).join('; ') || t('none'), stored: compared.map(label).join('; ') || t('none') })}</Alert>
      )}
      {detail && notChecked.length > 0 && (
        <p className="muted" style={{ fontSize: 12 }}>
          {t('notChecked', { list: notChecked.map((r) => `${t(`trig_${r.id}`)} (${r.status === 'annual' ? t('annualNote') : t('unavailable')})`).join('; ') })}
        </p>
      )}
    </Panel>
  );
}

function Responses({ brief, error: fileError }) {
  const { t, pickLabel, detail } = useI18n();
  const { data, errors } = useDash();
  const { error, reason } = firstError(errors, fileError, ['recommendations.json']);
  const recs = data.recommendations ?? [];
  const recById = new Map(recs.map((r) => [r.rec_id, r]));
  // Cards the executive brief shows (approved, top three per horizon) are the ones a link can land on.
  const onBrief = new Set(Object.values(topActionsByHorizon(recs)).flat().map((r) => r.rec_id));
  const evById = new Map((data.events ?? []).map((e) => [e.event_id, e]));
  const groups = RESPONSE_ORDER.map((resp) => [resp, (brief?.moves ?? []).filter((m) => m.response === resp)]).filter(([, ms]) => ms.length);

  return (
    <Panel id="watch-responses" title={t('responsesTitle')} sub={t('responsesSub')} source={`${FILE} · recommendations.json`}
      asOf={brief?.run_date} error={error} reason={reason}>
      {groups.length === 0 ? <Quiet>{t('noResponses')}</Quiet> : groups.map(([resp, ms]) => (
        <div className="response-group" key={resp}>
          <h4>{t(`resp_${resp}`)}</h4>
          {ms.map((m) => {
            const ev = evById.get(m.event_id);
            return (
              <div className="response-item" key={m.event_id}>
                <span className="muted" style={{ fontSize: 12 }}>
                  {m.actor}{ev ? ` · ${pickLabel(ev)}` : ''} {detail && <span className="mono">{m.event_id}</span>}
                </span>
                {m.rec_ids.length === 0 && <span className="muted" style={{ fontSize: 12 }}>{t('noCard')}</span>}
                {m.rec_ids.map((id) => {
                  const r = recById.get(id);
                  if (!r) return <Alert key={id}>{t('recMissing', { id })}</Alert>;
                  return (
                    <article className="action-card" data-verdict={r.verdict} key={id}>
                      <div className="action-meta">
                        {detail && <span className="tag mono">{r.rec_id}</span>}
                        <span className="tag">{r.platform}</span>
                        {detail && <span className="tag">{t('lever')}: {t(`lever_${r.lever}`)}</span>}
                        {r.status !== 'approved' && <span className="tag draft">{t('draft')}</span>}
                      </div>
                      <p className="action-text">{r.action}</p>
                      {onBrief.has(id)
                        ? <a className="card-link" href={`#/brief/rec-${id}`}>{t('openCard')} <ArrowRight size={12} aria-hidden /></a>
                        : <span className="muted" style={{ fontSize: 12 }}>{t('cardNotOnBrief')}</span>}
                    </article>
                  );
                })}
              </div>
            );
          })}
        </div>
      ))}
    </Panel>
  );
}

function EmiContext({ brief, error }) {
  const { t } = useI18n();
  const e = brief?.emi_context;
  const pct = (v) => (v == null ? '—' : `${fmt.signed(v, 2)}%`);
  return (
    <Panel id="watch-emi" title={t('parentContext')} sub={t('contextOnly')} source={`TWSE · emi_stock_daily.csv · ${FILE}`}
      asOf={brief?.period_end} error={error && FILE} reason={error}>
      <div>
        <div className="stat-tile"><span className="stat-label">{t('weekEmi')}</span><span className="stat-value">{pct(e?.week_return_pct)}</span></div>
        <div className="stat-tile"><span className="stat-label">{t('weekTaiex')}</span><span className="stat-value">{pct(e?.taiex_return_pct)}</span></div>
        <div className="stat-tile"><span className="stat-label">{t('weekExcess')}</span><span className="stat-value">{pct(e?.excess_return_pct)}</span></div>
      </div>
    </Panel>
  );
}

function WatchNext({ brief, error }) {
  const { t, pickLabel } = useI18n();
  return (
    <Panel id="watch-next" title={t('watchNext')} sub={t('watchNextSub')} source={`${FILE} · events.json`}
      asOf={brief?.run_date} error={error && FILE} reason={error}>
      {brief?.watch_next.length === 0 ? <Quiet>{t('nothingScheduled')}</Quiet> : (
        <ul className="watch-list">
          {brief?.watch_next.map((w, i) => (
            <li key={`${w.date}-${i}`}>
              <span className="watch-date tnum">{w.date}</span>
              <div className="watch-body"><span className="watch-title">{pickLabel(w)}</span></div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Archive({ briefs, current, error }) {
  const { t, pickLabel } = useI18n();
  return (
    <Panel id="watch-archive" title={t('archive')} sub={t('archiveSub')} source={FILE}
      asOf={briefs[0]?.run_date} error={error && FILE} reason={error}>
      <ul className="archive-list">
        {briefs.map((b) => {
          const headline = pickLabel(b, 'headline');
          return (
            <li key={b.week}>
              <a href={`#/watch/${b.week}`} aria-current={b.week === current ? 'true' : undefined}>
                <span className="mono" style={{ fontWeight: 600 }}>{b.week}</span>
                <span className="tnum muted" style={{ fontSize: 12 }}>{b.period_start} – {b.period_end}</span>
                <span className={headline ? 'archive-headline' : 'archive-headline muted'}>{headline ?? t('headlinePlaceholder')}</span>
                <span className="action-meta" style={{ alignItems: 'center' }}>
                  {b.status === 'draft' && <span className="tag draft">{t('draft')}</span>}
                  {b.verdict_changes.length > 0 && <span className="flag-inline"><Flag size={12} aria-hidden /> {t('verdictChanged')}</span>}
                  <span className="muted" style={{ fontSize: 12 }}>{t('movesCount', { n: b.moves.length })}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
