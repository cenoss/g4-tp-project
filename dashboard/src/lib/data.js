import Papa from 'papaparse';
import { useEffect, useState } from 'react';
import { TRIGGER_IDS } from './metrics.js';

// Every view reads exactly these files from /data (PRD §4.4 + recommendations.json from §5.5 + watch_briefs.json from §5.7).
export const DATA_FILES = [
  'emi_stock_daily.csv',
  'emi_segments.csv',
  'market_share.csv',
  'network_effects.csv',
  'traffic_mix.csv',
  'amc_pairs.json',
  'action_response.json',
  'decision_scores.json',
  'events.json',
  'recommendations.json',
  'watch_briefs.json',
];

const BASE = `${import.meta.env.BASE_URL}data/`;

// PRD file convention: missing values are empty in CSV and null in JSON, never zero.
// Papa's dynamicTyping turns "" into "", so normalise empties to null explicitly.
function parseCsv(text) {
  const { data, errors } = Papa.parse(text.trim(), { header: true, dynamicTyping: true, skipEmptyLines: true });
  if (errors.length) throw new Error(errors[0].message);
  return data.map((row) =>
    Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === '' || v === undefined ? null : v])),
  );
}

// PRD §5.7 output file. Checked on load so a malformed file fails closed like a missing one.
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const RESPONSES = ['respond_fast', 'respond_selectively', 'cooperate_adapt', 'monitor'];
const VERDICTS = ['partner', 'mixed', 'rival'];
const isStr = (v) => typeof v === 'string';
const isStrOrNull = (v) => v === null || isStr(v);
const isNumOrNull = (v) => v === null || Number.isFinite(v);
const isList = (v, ok) => Array.isArray(v) && v.every(ok);

function validateWatchBriefs(rows) {
  if (!Array.isArray(rows)) throw new Error('expected a list of weekly briefs');
  const weeks = new Set();
  rows.forEach((b, i) => {
    const fail = (field) => { throw new Error(`record ${i + 1}${isStr(b?.week) ? ` (${b.week})` : ''}: invalid ${field}`); };
    if (!b || typeof b !== 'object') fail('record');
    if (!isStr(b.week) || !/^\d{4}-W\d{2}$/.test(b.week)) fail('week');
    if (weeks.has(b.week)) fail('week (duplicate)');
    weeks.add(b.week);
    for (const f of ['period_start', 'period_end', 'run_date']) if (!isStr(b[f]) || !DATE.test(b[f])) fail(f);
    if (b.period_end < b.period_start) fail('period_end');
    if (!isStrOrNull(b.headline_en) || !isStrOrNull(b.headline_zh)) fail('headline');
    if (!isList(b.moves, (m) => m && isStr(m.event_id) && isStr(m.actor) && isStrOrNull(m.platform)
      && isList(m.criteria, isStr) && ['partner', 'rival'].includes(m.relation_signal)
      && RESPONSES.includes(m.response) && isList(m.rec_ids, isStr))) fail('moves');
    if (!isList(b.triggers_fired, (t) => t && TRIGGER_IDS.includes(t.trigger) && isStrOrNull(t.platform) && isStrOrNull(t.detail))) fail('triggers_fired');
    if (!isList(b.verdict_changes, (v) => v && isStr(v.platform) && VERDICTS.includes(v.verdict_from) && VERDICTS.includes(v.verdict_to)
      && Number.isInteger(v.n_from) && Number.isInteger(v.n_to))) fail('verdict_changes');
    const e = b.emi_context;
    if (!e || typeof e !== 'object' || !isNumOrNull(e.week_return_pct) || !isNumOrNull(e.taiex_return_pct) || !isNumOrNull(e.excess_return_pct)) fail('emi_context');
    if (!isList(b.watch_next, (w) => w && isStr(w.date) && DATE.test(w.date) && isStr(w.label_en) && isStr(w.label_zh))) fail('watch_next');
    if (!['draft', 'approved'].includes(b.status) || !isStrOrNull(b.approved_by)) fail('status');
  });
  return rows;
}

const VALIDATORS = { 'watch_briefs.json': validateWatchBriefs };

async function loadFile(name) {
  const res = await fetch(BASE + name, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const parsed = name.endsWith('.csv') ? parseCsv(await res.text()) : await res.json();
  return VALIDATORS[name] ? VALIDATORS[name](parsed) : parsed;
}

const keyOf = (name) => name.replace(/\.(csv|json)$/, '');

/**
 * Loads the manifest and every data file. A file that fails to load is reported in
 * `errors` and left undefined, so its charts show an error state instead of guessing (fail closed).
 */
export function useDashboardData() {
  const [state, setState] = useState({ status: 'loading', manifest: null, data: {}, errors: {} });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const manifest = await loadFile('manifest.json').catch(() => null);
      const results = await Promise.allSettled(DATA_FILES.map(loadFile));
      if (cancelled) return;
      const data = {};
      const errors = {};
      results.forEach((r, i) => {
        const key = keyOf(DATA_FILES[i]);
        if (r.status === 'fulfilled') data[key] = r.value;
        else errors[key] = r.reason?.message ?? 'Failed to load';
      });
      setState({ status: 'ready', manifest, data, errors });
    })();
    return () => { cancelled = true; };
  }, []);

  return state;
}
