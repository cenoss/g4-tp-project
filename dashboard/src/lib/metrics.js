// Derived metrics and rules from the PRD. Kept pure so they can be checked against stored values.

export const PLATFORM_ORDER = ['Google', 'Meta', 'LINE', 'YouTube'];

// §2.3 decision model: N = (S1 + S2 + S4 + S6) − 2 × (S3 + S5) + F, with F = +1 weak / 0 medium / −1 strong.
// s7 is the 0–2 strength score for ETtoday's own direct + app channels, so F = 1 − s7.
export function scoreDecision(row) {
  const b = row.s1 + row.s2 + row.s4 + row.s6;
  const c = row.s3 + row.s5;
  const f = 1 - row.s7;
  const n = b - 2 * c + f;
  return { b, c, f, n, verdict: verdictFor(n) };
}

export const verdictFor = (n) => (n >= 2 ? 'partner' : n <= -2 ? 'rival' : 'mixed');

/** Latest and previous scoring round per platform, with an integrity check against the formula. */
export function decisionBoard(scores) {
  const byPlatform = {};
  for (const row of scores) (byPlatform[row.platform] ??= []).push(row);
  return Object.entries(byPlatform).map(([platform, rows]) => {
    rows.sort((a, b) => a.scored_date.localeCompare(b.scored_date));
    const current = rows.at(-1);
    const previous = rows.length > 1 ? rows.at(-2) : null;
    const computed = scoreDecision(current);
    return {
      platform,
      current,
      previous,
      computed,
      mismatch: computed.n !== current.n || computed.verdict !== current.verdict,
      verdictChanged: previous ? verdictFor(previous.n) !== verdictFor(current.n) : false,
    };
  });
}

// §4.1 M3: Σ [r_EMI(d) − r_TAIEX(d)] for d = −1 … +3 trading days around the event date.
export function excessReturns(stock, events) {
  const idx = new Map(stock.map((row, i) => [row.date, i]));
  const ret = (i, key) => (i > 0 ? (stock[i][key] / stock[i - 1][key] - 1) * 100 : null);
  return events.map((ev) => {
    // Event day = first trading day on or after the event date.
    let i = idx.get(ev.date);
    if (i === undefined) i = stock.findIndex((r) => r.date >= ev.date);
    if (i < 1 || i + 3 >= stock.length) return { ...ev, excess: null };
    let sum = 0;
    for (let d = -1; d <= 3; d++) sum += ret(i + d, 'emi_index') - ret(i + d, 'taiex_index');
    return { ...ev, excess: Math.round(sum * 100) / 100 };
  });
}

export const median = (xs) => {
  const s = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const TRIGGER_IDS = ['verdict', 'dependence', 'rules', 'rival', 'market'];

/**
 * §5.6 revisit triggers. Each returns status 'fired' | 'clear' | 'unavailable' (or 'annual', see 2) with
 * `hits` ({ platform, detail }; platform null = all platforms / not platform-specific) and display `detail`.
 * Thresholds are the PRD defaults.
 *
 * Without `window` the triggers are checked over the whole dataset as of the run (executive brief).
 * With `window` = { from, to } (a weekly brief, §5.7 module 4) only data dated inside the week counts,
 * and the verdict check compares the week's end with the brief before it.
 */
export function evaluateTriggers(data, runDate, window) {
  const inWindow = (d) => !window || (d >= window.from && d <= window.to);
  const result = (id, hits) => ({ id, status: hits.length ? 'fired' : 'clear', hits, detail: hits.map((h) => h.detail) });
  const unavailable = (id) => ({ id, status: 'unavailable', hits: [], detail: [] });
  const out = [];

  // 1. Verdict changes: N crosses +2 or −2 between the last two scoring rounds (or since the last brief).
  if (data.decision_scores) {
    const changed = window
      ? verdictShift(data.decision_scores, window).filter((p) => p.changed).map((p) => ({ platform: p.platform, from: p.before.n, to: p.current.n }))
      : decisionBoard(data.decision_scores).filter((p) => p.verdictChanged).map((p) => ({ platform: p.platform, from: p.previous.n, to: p.current.n }));
    out.push(result('verdict', changed.map((x) => ({ platform: x.platform, detail: `${x.platform}: ${verdictFor(x.from)} → ${verdictFor(x.to)}` }))));
  } else out.push(unavailable('verdict'));

  // 2. Dependence shift: N3 changes ≥ 5 pp year on year. N3 is annual and carries no release date,
  // so a weekly window cannot tell whether it moved that week: reported as 'annual', not as clear.
  if (window) out.push({ id: 'dependence', status: 'annual', hits: [], detail: [] });
  else if (data.network_effects) {
    const years = [...new Set(data.network_effects.map((r) => r.year))].sort();
    const [prevY, curY] = years.slice(-2);
    const at = (y, p) => data.network_effects.find((r) => r.year === y && r.platform === p)?.dependence_pct;
    const shifted = [...new Set(data.network_effects.map((r) => r.platform))]
      .map((p) => ({ p, delta: at(curY, p) != null && at(prevY, p) != null ? at(curY, p) - at(prevY, p) : null }))
      .filter((x) => x.delta != null && Math.abs(x.delta) >= 5);
    out.push(result('dependence', shifted.map((x) => ({ platform: x.p, detail: `${x.p}: ${x.delta > 0 ? '+' : ''}${x.delta.toFixed(1)} pp (${prevY}→${curY})` }))));
  } else out.push(unavailable('dependence'));

  // 3. Rule change: a regulatory_legal event in the last 30 days before the run (or inside the week).
  // The PRD action reopens rules-lever cards for all platforms, so the hit is not platform-specific.
  if (data.events) {
    const cutoff = new Date(new Date(runDate).getTime() - 30 * 864e5).toISOString().slice(0, 10);
    const rules = data.events.filter((e) => e.action_type === 'regulatory_legal' && (window ? inWindow(e.date) : e.date >= cutoff));
    out.push(result('rules', rules.map((e) => ({ platform: null, detail: `${e.event_id}` }))));
  } else out.push(unavailable('rules'));

  // 4. Rival answers ETtoday within its median lag (A5).
  if (data.action_response && data.amc_pairs) {
    const lag = Object.fromEntries(data.amc_pairs.map((r) => [r.rival, r.median_lag_days]));
    const fast = data.action_response
      .filter((a) => a.actor === 'ETtoday')
      .flatMap((a) => a.responses
        .filter((r) => inWindow(r.date) && lag[r.responder] != null && r.lag_days <= lag[r.responder])
        .map((r) => ({ platform: null, detail: `${r.responder} → ${a.action_id} (${r.lag_days}d)` })));
    out.push({ ...result('rival', fast), detail: fast.slice(-4).map((h) => h.detail) });
  } else out.push(unavailable('rival'));

  // 5. Market reacts: |M3| > 5% around an ETtoday event.
  if (data.emi_stock_daily && data.events) {
    const big = excessReturns(data.emi_stock_daily, data.events.filter((e) => e.actor === 'ETtoday' && inWindow(e.date)))
      .filter((e) => e.excess != null && Math.abs(e.excess) > 5);
    out.push(result('market', big.map((e) => ({ platform: null, detail: `${e.event_id}: ${e.excess > 0 ? '+' : ''}${e.excess}%` }))));
  } else out.push(unavailable('market'));

  return out;
}

/** The fired triggers as watch_briefs.json `triggers_fired` records. */
export const firedTriggers = (results) =>
  results.filter((r) => r.status === 'fired').flatMap((r) => r.hits.map((h) => ({ trigger: r.id, platform: h.platform, detail: h.detail })));

/**
 * Verdict in effect at the end of a window vs. the one in effect the day before it starts (the last brief).
 * Built on decisionBoard, so each row keeps the formula integrity check (`mismatch`).
 */
export function verdictShift(scores, { from, to }) {
  const before = new Map(decisionBoard(scores.filter((r) => r.scored_date < from)).map((p) => [p.platform, p.current]));
  return decisionBoard(scores.filter((r) => r.scored_date <= to)).map((p) => {
    const prev = before.get(p.platform) ?? null;
    return { ...p, before: prev, changed: prev ? verdictFor(prev.n) !== verdictFor(p.current.n) : false };
  });
}

/** The changed rows of a verdictShift as watch_briefs.json `verdict_changes` records. */
export const verdictChanges = (shift) =>
  shift.filter((p) => p.changed).map((p) => ({
    platform: p.platform, verdict_from: verdictFor(p.before.n), verdict_to: verdictFor(p.current.n), n_from: p.before.n, n_to: p.current.n,
  }));

/** Stored vs computed records compared by key: what the stored list lacks, and what it has that the check does not. */
export function diffRecords(stored, computed, keyOf) {
  const s = new Set(stored.map(keyOf));
  const c = new Set(computed.map(keyOf));
  return { missing: [...c].filter((k) => !s.has(k)), extra: [...s].filter((k) => !c.has(k)) };
}

// §5.4: the brief shows approved cards only, ranked by priority, at most three per horizon.
export const HORIZONS = ['now', 'next', 'later'];
export const MAX_PER_HORIZON = 3;
export function topActionsByHorizon(recs) {
  const approved = recs.filter((r) => r.status === 'approved');
  return Object.fromEntries(HORIZONS.map((h) => [h, approved.filter((r) => r.horizon === h).sort((a, b) => b.priority - a.priority).slice(0, MAX_PER_HORIZON)]));
}
