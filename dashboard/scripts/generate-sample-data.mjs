// Generates SAMPLE data files in public/data that follow the PRD schemas (§4.4, §5.5).
// Every value here is synthetic. manifest.json carries "sample": true, which makes the
// dashboard show a SAMPLE banner. Replace these files with verified exports to go live.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// The weekly briefs' triggers and verdict changes come from the dashboard's own §5.6 / §2.3 logic.
import { evaluateTriggers, firedTriggers, verdictChanges, verdictShift } from '../src/lib/metrics.js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
const RUN_DATE = '2026-11-20';
const YEARS = [2024, 2025, 2026];
const PLATFORMS = ['Google', 'Meta', 'LINE', 'YouTube'];
const RIVALS = ['NOWnews', 'TVBS', 'SETN', 'EBC', 'UDN', 'LTN', 'CNA'];

// Deterministic PRNG so regenerating gives identical files.
let seed = 20261120;
const rand = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (lo, hi) => lo + rand() * (hi - lo);
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const kpi = () => `KPI-S${String(Math.floor(between(1, 999))).padStart(3, '0')}`;

const toCsv = (rows) => {
  const cols = Object.keys(rows[0]);
  const cell = (v) => (v === null || v === undefined ? '' : String(v));
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
};

const files = {};

// emi_stock_daily.csv — trading days from first 2024 trading day to run date.
{
  const rows = [];
  let emi = 18, taiex = 17900, peer = 120;
  let base;
  for (let d = new Date('2024-01-02'); d <= new Date(RUN_DATE); d.setDate(d.getDate() + 1)) {
    const wd = d.getDay();
    if (wd === 0 || wd === 6) continue;
    const prev = emi;
    emi = Math.max(5, emi * (1 + between(-0.022, 0.0235)));
    taiex *= 1 + between(-0.012, 0.0135);
    peer *= 1 + between(-0.025, 0.025);
    base ??= { emi, taiex, peer };
    rows.push({
      date: d.toISOString().slice(0, 10),
      emi_close: r2(emi),
      emi_return_pct: rows.length ? r2((emi / prev - 1) * 100) : null,
      emi_index: r2((100 * emi) / base.emi),
      taiex_index: r2((100 * taiex) / base.taiex),
      peer_6180_index: r2((100 * peer) / base.peer),
    });
  }
  files['emi_stock_daily.csv'] = rows;
}

// emi_segments.csv
{
  const rows = [];
  const segs = { new_media: [5200, 6400], new_retail: [14000, 17000], warehousing_logistics: [2600, 3600], other: [600, 1200] };
  for (const year of YEARS) {
    const vals = Object.fromEntries(Object.entries(segs).map(([k, [a, b]]) => [k, Math.round(between(a, b))]));
    const total = Object.values(vals).reduce((s, v) => s + v, 0);
    for (const [segment, v] of Object.entries(vals)) {
      rows.push({ year, segment, revenue_ntd_m: v, share_pct: r1((v / total) * 100), is_estimate: year === 2026, source_ids: kpi() });
    }
  }
  files['emi_segments.csv'] = rows;
}

// market_share.csv — ad share only exists for ETtoday (M6 is a ceiling; low bound added for the range).
{
  const rows = [];
  const brands = ['ETtoday', ...RIVALS];
  for (const year of YEARS) {
    const use = Object.fromEntries(brands.map((b) => [b, r1(between(b === 'ETtoday' ? 34 : 10, b === 'ETtoday' ? 42 : 36))]));
    const total = Object.values(use).reduce((s, v) => s + v, 0);
    for (const brand of brands) {
      const isEt = brand === 'ETtoday';
      const hi = isEt ? r1(between(5.5, 7.5)) : null;
      rows.push({
        year, brand,
        weekly_use_pct: use[brand],
        audience_share_pct: r1((use[brand] / total) * 100),
        trust_pct: r1(between(28, 58)),
        ad_share_pct: hi,
        ad_share_low_pct: isEt ? r1(hi * between(0.45, 0.6)) : null,
        is_estimate: isEt,
        source_ids: `${kpi()}|${kpi()}`,
      });
    }
  }
  files['market_share.csv'] = rows;
}

// network_effects.csv
{
  const rows = [];
  const prev = {};
  for (const year of YEARS) {
    for (const platform of PLATFORMS) {
      const reach = r1(between(18, 62));
      rows.push({
        year, platform,
        news_reach_pct: reach,
        momentum_pp: prev[platform] === undefined ? null : r1(reach - prev[platform]),
        dependence_pct: r1(between(4, 30)),
        nei_score: Math.round(between(15, 95)),
        is_estimate: true,
        source_ids: `${kpi()}|${kpi()}`,
      });
      prev[platform] = reach;
    }
  }
  files['network_effects.csv'] = rows;
}

// traffic_mix.csv
{
  const rows = [];
  for (const year of YEARS) {
    const raw = { direct: between(35, 50), app: between(25, 40), search: between(8, 16), social: between(5, 12), other: between(1, 4) };
    const total = Object.values(raw).reduce((s, v) => s + v, 0);
    for (const [channel, v] of Object.entries(raw)) {
      rows.push({ year, channel, share_pct: r1((v / total) * 100), owned: channel === 'direct' || channel === 'app', source_ids: kpi() });
    }
  }
  files['traffic_mix.csv'] = rows;
}

// amc_pairs.json
files['amc_pairs.json'] = RIVALS.map((rival) => {
  const mc = r2(between(0.35, 0.98)), rs = r2(between(0.3, 0.92));
  const a = Math.floor(between(0, 3)), m = Math.floor(between(0, 3)), c = Math.floor(between(0, 3));
  return { rival, mc, rs, awareness: a, motivation: m, capability: c, likelihood: r2((mc * rs * (a + m + c)) / 6), median_lag_days: Math.round(between(4, 60)) };
});

// events.json
const ACTION_TYPES = ['pricing', 'promotion', 'new_product_format', 'partnership_licensing', 'acquisition_investment', 'regulatory_legal', 'staffing_ai_restructuring'];
const ACTORS = ['ETtoday', ...PLATFORMS, ...RIVALS, 'Government'];
{
  const rows = [];
  for (let i = 0; i < 16; i++) {
    const d = new Date(new Date('2025-01-15').getTime() + i * 41 * 864e5 + Math.floor(between(0, 20)) * 864e5);
    if (d > new Date(RUN_DATE)) break;
    const date = d.toISOString().slice(0, 10);
    rows.push({
      event_id: `EV-${date.replaceAll('-', '')}-${String(i + 1).padStart(3, '0')}`,
      date,
      actor: i % 4 === 0 ? 'ETtoday' : pick(ACTORS),
      action_type: pick(ACTION_TYPES),
      label_zh: `範例事件 ${i + 1}`,
      label_en: `Sample event ${i + 1}`,
    });
  }
  files['events.json'] = rows;
}

// action_response.json — ETtoday and platform moves with rival responses.
{
  const rows = [];
  for (let i = 0; i < 12; i++) {
    const date = new Date(new Date('2025-02-01').getTime() + i * 52 * 864e5);
    if (date > new Date(RUN_DATE)) break;
    const actor = i % 3 === 0 ? pick(PLATFORMS) : 'ETtoday';
    const responders = [...RIVALS].sort(() => rand() - 0.5).slice(0, Math.floor(between(0, 4)));
    rows.push({
      action_id: `ACT-S${String(i + 1).padStart(3, '0')}`,
      actor,
      date: date.toISOString().slice(0, 10),
      action_type: pick(ACTION_TYPES),
      label_en: `Sample move ${i + 1}`,
      label_zh: `範例行動 ${i + 1}`,
      responses: responders.map((responder) => {
        const lag = Math.round(between(3, 95));
        return { responder, date: new Date(date.getTime() + lag * 864e5).toISOString().slice(0, 10), lag_days: lag };
      }),
    });
  }
  files['action_response.json'] = rows;
}

// decision_scores.json — two scoring rounds per platform (previous + current) so verdict-change triggers can be evaluated.
{
  const rows = [];
  const targets = { Google: -1, Meta: -3, LINE: 3, YouTube: 1 };
  for (const [round, date] of [[0, '2026-08-14'], [1, '2026-11-14']]) {
    for (const platform of PLATFORMS) {
      let s, n, b, c, f;
      for (let tries = 0; tries < 500; tries++) {
        s = Array.from({ length: 7 }, () => Math.floor(between(0, 3)));
        b = s[0] + s[1] + s[3] + s[5]; c = s[2] + s[4]; f = 1 - s[6];
        n = b - 2 * c + f;
        if (Math.abs(n - (targets[platform] + (round === 0 ? pick([-1, 0, 1]) : 0))) <= 0) break;
      }
      rows.push({
        platform,
        s1: s[0], s2: s[1], s3: s[2], s4: s[3], s5: s[4], s6: s[5], s7: s[6],
        b, c, f, n,
        verdict: n >= 2 ? 'partner' : n <= -2 ? 'rival' : 'mixed',
        confidence: pick(['strong', 'moderate', 'moderate', 'weak']),
        scored_by: 'Strategy pair (sample)',
        scored_date: date,
      });
    }
  }
  files['decision_scores.json'] = rows;
}

// recommendations.json — action cards (§5.5 schema).
{
  const levers = ['players', 'added_value', 'rules', 'tactics', 'scope'];
  const owners = ['audience growth', 'ad sales', 'platform partnerships', 'product', 'legal & policy'];
  const metrics = ['N3', 'N4', 'M5', 'M6', 'A5'];
  const current = files['decision_scores.json'].filter((d) => d.scored_date === '2026-11-14');
  const rows = [];
  for (let i = 0; i < 9; i++) {
    const p = current[i % 4];
    const impact = Math.floor(between(1, 4)), feasibility = Math.floor(between(1, 4));
    const confidence = pick(['strong', 'moderate']);
    const kpiId = pick(metrics);
    rows.push({
      rec_id: `REC-${String(i + 1).padStart(3, '0')}`,
      platform: p.platform,
      verdict: p.verdict,
      lever: pick(levers),
      action: `Sample action ${i + 1}: placeholder verb-first recommendation text`,
      rationale: 'Placeholder rationale. Drafted by the Business Strategist from verified evidence and approved at H4.',
      evidence_ids: [`EV-SAMPLE-${String(i + 1).padStart(3, '0')}`],
      metric_ids: [kpiId],
      confidence,
      impact, feasibility,
      priority: impact * (confidence === 'strong' ? 3 : 2) * feasibility,
      horizon: ['now', 'next', 'later'][i % 3],
      owner_role: pick(owners),
      kpi: kpiId,
      target_direction: pick(['rise', 'fall']),
      revisit_trigger: 'Placeholder trigger condition',
      status: i < 6 ? 'approved' : 'draft',
      approved_by: i < 6 ? 'Reviewer (sample)' : null,
    });
  }
  files['recommendations.json'] = rows;
}

// watch_briefs.json — four consecutive weekly briefs (§5.7), ISO weeks 2026-W43 to W46, each run the Monday after.
// Placed after every other file and free of PRNG calls, so the existing sample files keep their values.
// W44 is the quiet week; W46 holds the 2026-11-14 scoring round (Google rival → mixed) and is still a draft.
{
  const addDays = (d, n) => new Date(new Date(d).getTime() + n * 864e5).toISOString().slice(0, 10);

  // Sample events inside the brief weeks, appended to events.json. No ETtoday actor (keeps M3 unchanged),
  // and the regulatory event sits before the brief's 30-day rule window, so #/brief triggers are unchanged.
  const events = files['events.json'];
  const watchEvents = [
    ['2026-10-20', 'Government', 'regulatory_legal'],
    ['2026-10-22', 'Google', 'new_product_format'],
    ['2026-11-03', 'NOWnews', 'pricing'],
    ['2026-11-05', 'LINE', 'partnership_licensing'],
    ['2026-11-11', 'Meta', 'promotion'],
    ['2026-11-13', 'YouTube', 'new_product_format'],
  ].map(([date, actor, action_type]) => {
    const n = events.length + 1;
    const ev = { event_id: `EV-${date.replaceAll('-', '')}-${String(n).padStart(3, '0')}`, date, actor, action_type, label_zh: `範例事件 ${n}`, label_en: `Sample event ${n}` };
    events.push(ev);
    return ev;
  });
  const move = (ev, platform, criteria, relation_signal, response, rec_ids) =>
    ({ event_id: ev.event_id, actor: ev.actor, platform, criteria, relation_signal, response, rec_ids });
  const [gov, google, nownews, line, meta, youtube] = watchEvents;

  const HEADLINES = {
    change: ['Sample headline: placeholder for the week’s most important change.', '範例標題：本週最重要變化的佔位文字。'],
    quiet: ['Sample headline: no change this week.', '範例標題：本週無變化。'],
  };
  const WEEKS = [
    { week: '2026-W43', start: '2026-10-19', headline: 'change', moves: [
      move(gov, null, ['S5'], 'rival', 'respond_selectively', ['REC-006']),
      move(google, 'Google', ['S1', 'S3'], 'rival', 'cooperate_adapt', ['REC-001', 'REC-005']),
    ] },
    { week: '2026-W44', start: '2026-10-26', headline: 'quiet', moves: [] },
    { week: '2026-W45', start: '2026-11-02', headline: 'change', moves: [
      move(nownews, null, ['S1'], 'rival', 'respond_fast', ['REC-004']),
      move(line, 'LINE', ['S2', 'S4'], 'partner', 'monitor', []),
    ] },
    { week: '2026-W46', start: '2026-11-09', headline: null, moves: [
      move(meta, 'Meta', ['S3'], 'rival', 'respond_fast', ['REC-002']),
      move(youtube, 'YouTube', ['S1', 'S2'], 'partner', 'respond_selectively', ['REC-008']),
    ] },
  ];

  const stock = files['emi_stock_daily.csv'];
  // Week return = last close in the week vs. last close before it.
  const weekReturn = (start, end, key) => {
    const before = stock.filter((r) => r.date < start).at(-1);
    const last = stock.filter((r) => r.date <= end).at(-1);
    return before && last && last.date >= start ? r2((last[key] / before[key] - 1) * 100) : null;
  };
  const data = {
    decision_scores: files['decision_scores.json'], events, action_response: files['action_response.json'],
    amc_pairs: files['amc_pairs.json'], emi_stock_daily: stock, network_effects: files['network_effects.csv'],
  };
  const eventIds = new Set(events.map((e) => e.event_id));
  const recIds = new Set(files['recommendations.json'].map((r) => r.rec_id));

  files['watch_briefs.json'] = WEEKS.map(({ week, start, headline, moves }, i) => {
    const end = addDays(start, 6);
    const runDate = addDays(start, 7);
    for (const m of moves) {
      if (!eventIds.has(m.event_id)) throw new Error(`${week}: unknown event ${m.event_id}`);
      for (const id of m.rec_ids) if (!recIds.has(id)) throw new Error(`${week}: unknown action card ${id}`);
    }
    const window = { from: start, to: end };
    const emi = weekReturn(start, end, 'emi_close');
    const taiex = weekReturn(start, end, 'taiex_index');
    const approved = headline !== null;
    return {
      week,
      period_start: start,
      period_end: end,
      run_date: runDate,
      headline_en: approved ? HEADLINES[headline][0] : null,
      headline_zh: approved ? HEADLINES[headline][1] : null,
      moves,
      triggers_fired: firedTriggers(evaluateTriggers(data, runDate, window)),
      verdict_changes: verdictChanges(verdictShift(data.decision_scores, window)),
      emi_context: { week_return_pct: emi, taiex_return_pct: taiex, excess_return_pct: emi != null && taiex != null ? r2(emi - taiex) : null },
      watch_next: [
        { date: addDays(runDate, 2), label_en: `Sample scheduled item ${2 * i + 1}`, label_zh: `範例預定事項 ${2 * i + 1}` },
        ...(headline === 'quiet' ? [] : [{ date: addDays(runDate, 4), label_en: `Sample scheduled item ${2 * i + 2}`, label_zh: `範例預定事項 ${2 * i + 2}` }]),
      ],
      status: approved ? 'approved' : 'draft',
      approved_by: approved ? 'Reviewer (sample)' : null,
    };
  });
}

// Write files + manifest.
mkdirSync(OUT, { recursive: true });
const manifestFiles = [];
for (const [name, rows] of Object.entries(files)) {
  const body = name.endsWith('.csv') ? toCsv(rows) : JSON.stringify(rows, null, 2) + '\n';
  writeFileSync(join(OUT, name), body);
  manifestFiles.push({ name, rows: rows.length, checksum: createHash('sha256').update(body).digest('hex').slice(0, 16) });
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({
  version: '0.0.0-sample', run_date: RUN_DATE, sample: true, files: manifestFiles, checked_by: null,
}, null, 2) + '\n');
console.log(`Wrote ${manifestFiles.length} sample files + manifest.json to ${OUT}`);
