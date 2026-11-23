// Generates SAMPLE data files in public/data that follow the PRD schemas (§4.4, §5.5, §5.7).
// Everything here is FICTIONAL: the events, scores, recommendations and figures are illustrative scenarios
// written to look like a realistic weekly run, not findings. No real people are named. manifest.json carries
// "sample": true, which makes the dashboard show the SAMPLE banner and tags. Replace these files with
// verified exports to go live.
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

// Deterministic PRNG, used only for the daily price walk, so regenerating gives identical files.
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
const addDays = (d, n) => new Date(new Date(d).getTime() + n * 864e5).toISOString().slice(0, 10);

// Verified-record IDs in the PRD's KPI-NNNN style, issued in order.
let kpiSeq = 100;
const kpi = () => `KPI-${String(++kpiSeq).padStart(4, '0')}`;

const toCsv = (rows) => {
  const cols = Object.keys(rows[0]);
  const cell = (v) => (v === null || v === undefined ? '' : String(v));
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
};

const files = {};

// emi_stock_daily.csv — trading days from first 2024 trading day to run date (synthetic random walk).
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

// emi_segments.csv — revenue in NT$ m per year (2024, 2025, 2026); new media grows steadily.
{
  const segs = {
    new_media: [5480, 5910, 6240],
    new_retail: [15200, 15900, 16400],
    warehousing_logistics: [2950, 3120, 3300],
    other: [820, 760, 790],
  };
  const rows = [];
  YEARS.forEach((year, y) => {
    const total = Object.values(segs).reduce((s, v) => s + v[y], 0);
    for (const [segment, v] of Object.entries(segs)) {
      rows.push({ year, segment, revenue_ntd_m: v[y], share_pct: r1((v[y] / total) * 100), is_estimate: year === 2026, source_ids: kpi() });
    }
  });
  files['emi_segments.csv'] = rows;
}

// market_share.csv — weekly use and trust per brand per year; ad share only for ETtoday
// (M6 is a ceiling; the low bound gives C4 its range).
{
  const weeklyUse = {
    ETtoday: [37.8, 38.6, 39.9], NOWnews: [18.2, 19.0, 19.4], TVBS: [27.5, 27.1, 26.8], SETN: [24.9, 25.6, 26.3],
    EBC: [22.4, 21.8, 21.5], UDN: [21.0, 20.3, 19.8], LTN: [25.7, 25.1, 24.6], CNA: [14.6, 15.2, 15.9],
  };
  const trust = {
    ETtoday: [38.5, 39.4, 40.2], NOWnews: [36.1, 36.8, 37.0], TVBS: [47.2, 46.5, 46.9], SETN: [40.3, 40.8, 41.5],
    EBC: [39.6, 39.1, 39.4], UDN: [48.1, 47.6, 47.9], LTN: [46.0, 45.4, 45.8], CNA: [56.2, 56.9, 57.4],
  };
  const adShareHigh = [6.1, 6.4, 6.6];
  const rows = [];
  YEARS.forEach((year, y) => {
    const total = Object.values(weeklyUse).reduce((s, v) => s + v[y], 0);
    for (const brand of Object.keys(weeklyUse)) {
      const isEt = brand === 'ETtoday';
      rows.push({
        year, brand,
        weekly_use_pct: weeklyUse[brand][y],
        audience_share_pct: r1((weeklyUse[brand][y] / total) * 100),
        trust_pct: trust[brand][y],
        ad_share_pct: isEt ? adShareHigh[y] : null,
        ad_share_low_pct: isEt ? r1(adShareHigh[y] * 0.52) : null,
        is_estimate: isEt,
        source_ids: `${kpi()}|${kpi()}`,
      });
    }
  });
  files['market_share.csv'] = rows;
}

// network_effects.csv — platform news reach (N1), ETtoday dependence (N3) and NEI per year.
// Story: Facebook referrals fall after the 2025 feed-ranking change; search and LINE TODAY gain weight.
{
  const reach = { Google: [37.5, 38.2, 39.0], Meta: [54.0, 51.2, 48.9], LINE: [57.1, 58.4, 59.6], YouTube: [46.8, 48.9, 51.3] };
  const dependence = { Google: [21.5, 23.0, 25.8], Meta: [16.4, 14.1, 7.9], LINE: [11.2, 12.0, 13.1], YouTube: [4.8, 5.6, 6.9] };
  const nei = { Google: [72, 74, 76], Meta: [64, 58, 51], LINE: [61, 63, 66], YouTube: [48, 53, 58] };
  const rows = [];
  YEARS.forEach((year, y) => {
    for (const platform of PLATFORMS) {
      rows.push({
        year, platform,
        news_reach_pct: reach[platform][y],
        momentum_pp: y === 0 ? null : r1(reach[platform][y] - reach[platform][y - 1]),
        dependence_pct: dependence[platform][y],
        nei_score: nei[platform][y],
        is_estimate: true,
        source_ids: `${kpi()}|${kpi()}`,
      });
    }
  });
  files['network_effects.csv'] = rows;
}

// traffic_mix.csv — owned channels (direct + app) slowly gain on social.
{
  const mix = {
    direct: [41.2, 40.1, 39.0], app: [29.8, 31.9, 34.6], search: [14.9, 15.6, 16.2], social: [11.3, 9.6, 7.4], other: [2.8, 2.8, 2.8],
  };
  const rows = [];
  YEARS.forEach((year, y) => {
    for (const channel of Object.keys(mix)) {
      rows.push({ year, channel, share_pct: mix[channel][y], owned: channel === 'direct' || channel === 'app', source_ids: kpi() });
    }
  });
  files['traffic_mix.csv'] = rows;
}

// amc_pairs.json — market commonality, resource similarity, awareness/motivation/capability (0–2) and median lag.
files['amc_pairs.json'] = [
  ['NOWnews', 0.82, 0.71, 2, 2, 1, 9],
  ['TVBS', 0.78, 0.66, 2, 2, 2, 14],
  ['SETN', 0.88, 0.74, 2, 2, 2, 7],
  ['EBC', 0.71, 0.69, 1, 2, 2, 12],
  ['UDN', 0.62, 0.58, 2, 1, 2, 21],
  ['LTN', 0.55, 0.52, 1, 1, 2, 28],
  ['CNA', 0.41, 0.45, 1, 0, 1, 45],
].map(([rival, mc, rs, awareness, motivation, capability, median_lag_days]) => ({
  rival, mc, rs, awareness, motivation, capability,
  likelihood: r2((mc * rs * (awareness + motivation + capability)) / 6),
  median_lag_days,
}));

// events.json — verified platform, rival and policy moves (fictional scenarios). Labels leave out the actor,
// which every view prints beside them, unless they name a product or body (Facebook, LINE TODAY, NCC).
const event = (n, date, actor, action_type, label_en, label_zh) =>
  ({ event_id: `EV-${date.replaceAll('-', '')}-${String(n).padStart(3, '0')}`, date, actor, action_type, label_zh, label_en });
files['events.json'] = [
  ['2025-02-03', 'ETtoday', 'pricing', 'Raises programmatic ad floor prices on article pages', '調高文章頁程序化廣告底價'],
  ['2025-03-10', 'Google', 'new_product_format', 'Widens AI Overviews to Traditional Chinese news queries', '將 AI 摘要擴及繁體中文新聞查詢'],
  ['2025-04-15', 'SETN', 'new_product_format', 'Adds a vertical short-video news feed to its app', 'App 新增直式短影音新聞'],
  ['2025-05-27', 'ETtoday', 'partnership_licensing', 'Signs a video licensing deal with LINE TODAY', '與 LINE TODAY 簽訂影音授權'],
  ['2025-06-18', 'Meta', 'new_product_format', 'Facebook lowers the weight of news links in feed ranking', 'Facebook 降低新聞連結在動態排序中的權重'],
  ['2025-08-12', 'ETtoday', 'staffing_ai_restructuring', 'Sets up an AI desk for summaries and tagging', '成立 AI 編輯台，處理摘要與標籤'],
  ['2025-09-23', 'Government', 'regulatory_legal', 'Ministry of Digital Affairs publishes a draft platform–publisher bargaining framework', '數位發展部公布平台與新聞媒體議價框架草案'],
  ['2025-10-28', 'NOWnews', 'pricing', 'Cuts sponsored-content rates for small advertisers', '調降中小企業業配價格'],
  ['2025-12-09', 'YouTube', 'promotion', 'Opens a news creator programme for Taiwanese publishers', '推出台灣新聞媒體創作者計畫'],
  ['2026-01-20', 'ETtoday', 'new_product_format', 'Relaunches its app with a personalised home feed', 'App 改版，首頁改為個人化推薦'],
  ['2026-02-24', 'TVBS', 'acquisition_investment', 'Invests in a data-journalism studio', '投資數據新聞工作室'],
  ['2026-04-14', 'LINE', 'partnership_licensing', 'LINE TODAY revises revenue-share terms for content partners', 'LINE TODAY 調整內容夥伴分潤條款'],
  ['2026-05-19', 'ETtoday', 'pricing', 'Launches a paid ad-free membership tier', '推出付費免廣告會員方案'],
  ['2026-07-07', 'Government', 'regulatory_legal', 'NCC opens a public consultation on platform news distribution', 'NCC 就平台新聞分發規範召開公眾諮詢'],
  ['2026-08-18', 'LTN', 'promotion', 'Runs a free-trial campaign for its digital subscription', '推出數位訂閱免費試用活動'],
  ['2026-09-29', 'EBC', 'new_product_format', 'Launches an AI-assisted overnight news bulletin', '推出 AI 輔助的夜間新聞快報'],
].map(([date, actor, type, en, zh], i) => event(i + 1, date, actor, type, en, zh));

// action_response.json — first moves and the rival responses that followed (lag in days).
files['action_response.json'] = [
  ['2025-02-03', 'ETtoday', 'pricing', 'Raises programmatic ad floor prices', '調高程序化廣告底價', [['NOWnews', 18], ['SETN', 26]]],
  ['2025-03-10', 'Google', 'new_product_format', 'AI Overviews widen to Traditional Chinese news', 'AI 摘要擴及繁中新聞查詢', [['UDN', 34]]],
  ['2025-05-27', 'ETtoday', 'partnership_licensing', 'Video licensing deal with LINE TODAY', '與 LINE TODAY 簽訂影音授權', [['SETN', 6], ['TVBS', 19]]],
  ['2025-06-18', 'Meta', 'new_product_format', 'Facebook lowers news-link weight in feed', 'Facebook 降低新聞連結權重', []],
  ['2025-08-12', 'ETtoday', 'staffing_ai_restructuring', 'AI desk for summaries and tagging', '成立 AI 編輯台', [['EBC', 41], ['LTN', 60]]],
  ['2025-10-06', 'ETtoday', 'new_product_format', 'Weekly investigative video series', '推出每週調查報導影音節目', [['TVBS', 22]]],
  ['2025-12-09', 'YouTube', 'promotion', 'News creator programme for Taiwanese publishers', '台灣新聞媒體創作者計畫', [['SETN', 15], ['EBC', 20]]],
  ['2026-01-20', 'ETtoday', 'new_product_format', 'App relaunch with personalised home feed', 'App 改版為個人化首頁', [['NOWnews', 30], ['UDN', 52]]],
  ['2026-03-16', 'ETtoday', 'acquisition_investment', 'Stake in a local podcast network', '入股在地 Podcast 聯播網', []],
  ['2026-04-14', 'LINE', 'partnership_licensing', 'LINE TODAY revises partner revenue share', 'LINE TODAY 調整夥伴分潤', [['TVBS', 12], ['UDN', 25]]],
  ['2026-05-19', 'ETtoday', 'pricing', 'Paid ad-free membership tier', '付費免廣告會員方案', [['NOWnews', 8], ['LTN', 91]]],
  ['2026-08-04', 'ETtoday', 'new_product_format', 'Vertical video news feed in the app', 'App 新增直式影音新聞', [['TVBS', 17]]],
].map(([date, actor, action_type, label_en, label_zh, responses], i) => ({
  action_id: `ACT-${String(i + 1).padStart(3, '0')}`,
  actor, date, action_type, label_en, label_zh,
  responses: responses.map(([responder, lag]) => ({ responder, date: addDays(date, lag), lag_days: lag })),
}));

// decision_scores.json — two H3 scoring rounds per platform (previous + current) so the verdict-change trigger
// can be evaluated. Scores are 0–2; N is computed with the §2.3 formula. Google moves rival → mixed in November.
{
  const rounds = {
    '2026-08-14': {
      Google: [[2, 0, 2, 1, 1, 1, 1], 'moderate'], Meta: [[1, 1, 2, 0, 1, 1, 1], 'strong'],
      LINE: [[2, 2, 1, 1, 0, 0, 1], 'moderate'], YouTube: [[1, 1, 1, 1, 1, 1, 1], 'moderate'],
    },
    '2026-11-14': {
      Google: [[2, 1, 2, 1, 1, 1, 1], 'moderate'], Meta: [[1, 1, 2, 0, 1, 1, 1], 'strong'],
      LINE: [[2, 2, 1, 1, 0, 0, 1], 'strong'], YouTube: [[1, 2, 1, 1, 1, 1, 1], 'moderate'],
    },
  };
  const rows = [];
  for (const [date, byPlatform] of Object.entries(rounds)) {
    for (const platform of PLATFORMS) {
      const [s, confidence] = byPlatform[platform];
      const b = s[0] + s[1] + s[3] + s[5], c = s[2] + s[4], f = 1 - s[6];
      const n = b - 2 * c + f;
      rows.push({
        platform,
        s1: s[0], s2: s[1], s3: s[2], s4: s[3], s5: s[4], s6: s[5], s7: s[6],
        b, c, f, n,
        verdict: n >= 2 ? 'partner' : n <= -2 ? 'rival' : 'mixed',
        confidence,
        scored_by: 'Strategy pair',
        scored_date: date,
      });
    }
  }
  files['decision_scores.json'] = rows;
}

// recommendations.json — action cards (§5.5 schema). REC-001 to 006 approved at H4, 007 to 009 still drafts.
{
  const ev = Object.fromEntries(files['events.json'].map((e) => [e.event_id.slice(-3), e.event_id]));
  const current = Object.fromEntries(files['decision_scores.json'].filter((d) => d.scored_date === '2026-11-14').map((d) => [d.platform, d.verdict]));
  const cards = [
    ['Google', 'added_value', 'now', 'Keep full stories and video on owned pages, and give search only headlines and summaries marked up for citation in AI Overviews.',
      'AI Overviews answer many news queries without a click. Being the cited source keeps referral traffic while full value stays on ETtoday pages.',
      ['002'], ['N3', 'N4'], 'moderate', 3, 3, 'audience growth', 'N4', 'rise', 'Search share of ETtoday traffic falls 3 pp or more in a quarter'],
    ['Meta', 'scope', 'next', 'Shift short-video output from Facebook Reels to the ETtoday app and YouTube, keeping Facebook for headline links only.',
      'Facebook referrals have fallen since the 2025 feed-ranking change, and Reels payouts do not cover production costs.',
      ['005'], ['N3'], 'strong', 3, 2, 'audience growth', 'N3', 'fall', 'Meta restores news-link weight in feed ranking'],
    ['LINE', 'added_value', 'later', 'Offer LINE TODAY exclusive explainer videos in exchange for a higher revenue share and audience data.',
      'LINE TODAY reaches the widest news audience and the 2025 licensing deal performed well; exclusives strengthen the next negotiation.',
      ['004', '012'], ['N1', 'M6'], 'moderate', 2, 2, 'platform partnerships', 'M6', 'rise', 'LINE TODAY changes partner revenue share again'],
    ['YouTube', 'tactics', 'now', 'Sell YouTube channel video together with on-site pre-roll as one package for advertisers.',
      'Video ad budgets are moving to YouTube; packaging both keeps the buyer relationship with ETtoday ad sales.',
      ['009'], ['M6'], 'strong', 2, 3, 'ad sales', 'M6', 'rise', 'A close rival matches the package within its median lag'],
    ['Google', 'tactics', 'next', 'Publish exclusives in the app and newsletter 30 minutes before they are opened to search indexing.',
      'A short head start moves loyal readers to owned channels without giving up search reach on the story.',
      ['002', '010'], ['N4'], 'moderate', 2, 2, 'product', 'N4', 'rise', 'Owned ratio (N4) stops rising for two quarters'],
    ['Meta', 'rules', 'later', 'Support bargaining-bill provisions that require platforms to give publishers notice of feed-ranking changes.',
      'Unannounced ranking changes cut ETtoday traffic in 2025; notice rules reduce that risk for every platform.',
      ['007', '014'], ['N3'], 'strong', 2, 1, 'legal & policy', 'N3', 'fall', 'The draft bargaining bill passes committee review or is withdrawn'],
    ['LINE', 'tactics', 'now', 'Co-promote the ad-free membership through LINE official account rich menus.',
      'LINE official accounts reach readers who already follow ETtoday, at low acquisition cost.',
      ['013'], ['N4'], 'moderate', 2, 3, 'audience growth', 'N4', 'rise', 'Membership sign-ups from LINE fall below 10% of the total'],
    ['YouTube', 'scope', 'next', 'Pilot a dedicated Shorts news channel that links back to full reports in the app.',
      'Shorts reach younger readers ETtoday does not reach on its own channels; links back test whether that reach converts.',
      ['009'], ['N1', 'N4'], 'moderate', 2, 2, 'product', 'N4', 'rise', 'YouTube changes how Shorts link to external sites'],
    ['Google', 'rules', 'later', 'Prepare a licensing offer covering summary and AI-training use of ETtoday archives.',
      'If bargaining rules pass, a ready offer lets ETtoday negotiate early rather than accept a standard rate.',
      ['007', '014'], ['N3'], 'moderate', 3, 1, 'legal & policy', 'N3', 'fall', 'Bargaining rules require platforms to pay for news use'],
  ];
  files['recommendations.json'] = cards.map(([platform, lever, horizon, action, rationale, evIds, metric_ids, confidence, impact, feasibility, owner_role, kpiId, target_direction, revisit_trigger], i) => ({
    rec_id: `REC-${String(i + 1).padStart(3, '0')}`,
    platform,
    verdict: current[platform],
    lever,
    action,
    rationale,
    evidence_ids: evIds.map((n) => ev[n]),
    metric_ids,
    confidence,
    impact, feasibility,
    priority: impact * (confidence === 'strong' ? 3 : 2) * feasibility,
    horizon,
    owner_role,
    kpi: kpiId,
    target_direction,
    revisit_trigger,
    status: i < 6 ? 'approved' : 'draft',
    approved_by: i < 6 ? 'Review pair' : null,
  }));
}

// watch_briefs.json — four consecutive weekly briefs (§5.7), ISO weeks 2026-W43 to W46, each run the Monday after.
// W44 is the quiet week; W46 holds the 2026-11-14 scoring round (Google rival → mixed) and is still a draft.
{
  // Moves inside the brief weeks, appended to events.json. No ETtoday actor (keeps M3 unchanged), and the
  // regulatory event sits before the executive brief's 30-day rule window, so #/brief triggers are unchanged.
  const events = files['events.json'];
  const watchEvents = [
    ['2026-10-20', 'Government', 'regulatory_legal', 'Legislative Yuan committee schedules review of the draft news bargaining bill', '立法院委員會排審新聞議價法草案'],
    ['2026-10-22', 'Google', 'new_product_format', 'Shows AI Overviews on more Taiwan breaking-news searches', '在更多台灣即時新聞搜尋中顯示 AI 摘要'],
    ['2026-11-03', 'NOWnews', 'pricing', 'Sells video pre-roll and display ads as a discounted bundle', '推出影音前貼片與橫幅廣告優惠組合'],
    ['2026-11-05', 'LINE', 'partnership_licensing', 'LINE TODAY opens a video channel programme for publishers', 'LINE TODAY 開放媒體影音頻道計畫'],
    ['2026-11-11', 'Meta', 'promotion', 'Offers bonus payouts for Reels from news pages', '為新聞粉專 Reels 提供額外獎勵金'],
    ['2026-11-13', 'YouTube', 'new_product_format', 'Adds a Taiwan top-news shelf for Shorts', '新增台灣 Shorts 焦點新聞專區'],
  ].map(([date, actor, type, en, zh]) => {
    const ev = event(events.length + 1, date, actor, type, en, zh);
    events.push(ev);
    return ev;
  });
  const move = (ev, platform, criteria, relation_signal, response, rec_ids) =>
    ({ event_id: ev.event_id, actor: ev.actor, platform, criteria, relation_signal, response, rec_ids });
  const [bill, aiOverviews, nownewsBundle, lineVideo, reelsBonus, shortsShelf] = watchEvents;

  const WEEKS = [
    {
      week: '2026-W43', start: '2026-10-19',
      headline: ['The bargaining bill moves to committee review and Google widens AI Overviews on breaking news. Rules-lever cards are reopened.',
        '新聞議價法草案進入委員會審查，Google 擴大即時新聞 AI 摘要；規則槓桿行動卡重新檢視。'],
      moves: [
        move(bill, null, ['S5'], 'rival', 'respond_selectively', ['REC-006']),
        move(aiOverviews, 'Google', ['S1', 'S3'], 'rival', 'cooperate_adapt', ['REC-001', 'REC-005']),
      ],
      watch_next: [['2026-10-28', 'Legislative Yuan committee hearing on the bargaining bill', '立法院委員會就議價法草案舉行公聽會']],
    },
    {
      week: '2026-W44', start: '2026-10-26',
      headline: ['No change. No platform or rival move met the filters this week.', '無變化：本週沒有符合篩選條件的平台或對手動態。'],
      moves: [],
      watch_next: [['2026-11-04', 'LINE TODAY briefing for content partners', 'LINE TODAY 內容夥伴說明會']],
    },
    {
      week: '2026-W45', start: '2026-11-02',
      headline: ['NOWnews undercuts video ad bundles. Respond fast with a combined YouTube and on-site video package.',
        '今日新聞以低價影音廣告組合搶客；建議以 YouTube 與站內影音合併方案快速回應。'],
      moves: [
        move(nownewsBundle, null, ['S1'], 'rival', 'respond_fast', ['REC-004']),
        move(lineVideo, 'LINE', ['S2', 'S4'], 'partner', 'monitor', []),
      ],
      watch_next: [
        ['2026-11-11', 'YouTube Taiwan news partner briefing', 'YouTube 台灣新聞夥伴說明會'],
        ['2026-11-14', 'Quarterly re-scoring of all four platforms', '四大平台季度重新評分'],
      ],
    },
    {
      week: '2026-W46', start: '2026-11-09', headline: null,
      moves: [
        move(reelsBonus, 'Meta', ['S3'], 'rival', 'respond_fast', ['REC-002']),
        move(shortsShelf, 'YouTube', ['S1', 'S2'], 'partner', 'respond_selectively', ['REC-008']),
      ],
      watch_next: [
        ['2026-11-18', 'Strategy pair re-reviews Google after the verdict change', '判定變更後，策略小組重新檢視 Google'],
        ['2026-11-20', 'NCC consultation on platform news distribution closes', 'NCC 平台新聞分發規範諮詢截止'],
      ],
    },
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

  files['watch_briefs.json'] = WEEKS.map(({ week, start, headline, moves, watch_next }) => {
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
      headline_en: approved ? headline[0] : null,
      headline_zh: approved ? headline[1] : null,
      moves,
      triggers_fired: firedTriggers(evaluateTriggers(data, runDate, window)),
      verdict_changes: verdictChanges(verdictShift(data.decision_scores, window)),
      emi_context: { week_return_pct: emi, taiex_return_pct: taiex, excess_return_pct: emi != null && taiex != null ? r2(emi - taiex) : null },
      watch_next: watch_next.map(([date, label_en, label_zh]) => ({ date, label_en, label_zh })),
      status: approved ? 'approved' : 'draft',
      approved_by: approved ? 'Review pair' : null,
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
