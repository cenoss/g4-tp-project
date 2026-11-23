# Platform Strategy Dashboard (ETtoday · Group 4)

Internal dashboard for the PRD question: **Which platforms should ETtoday partner with, and which should it treat as rivals?**
React + Vite + Recharts. Bilingual (中 / EN toggle), light and dark themes, deep-linkable views.

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # static site in dist/ (deploy anywhere; base path is relative)
npm run sample-data  # regenerate the SAMPLE files in public/data
```

## Views

| Route | Contents | PRD |
|---|---|---|
| `#/brief` | Headline, verdict board (N, B/C/F breakdown, confidence, change vs previous round), F3 scoreboard, top actions by horizon, parent-company context, revisit triggers, competitive watch (with a link to the latest weekly brief), evidence/manifest | §5.5, §5.4, §5.6, §2.3 |
| `#/watch` (`#/watch/YYYY-Www`) | Weekly Platform Watch Brief, one week at a time: headline, this week's moves, verdict status, triggers fired, recommended responses (each with its action card), parent-company context, watch next week. Week selector plus an archive of every week, newest first. Defaults to the latest week. | §5.7, §5.6, §5.3 |
| `#/analytics` | C1–C8 in three sections (`/market`, `/network`, `/competitive`), one filter row (price range, snapshot year) | §4.5 |

Every chart card shows its ID, its question, a source line, the as-of date, estimate/indicative tags, verified record IDs, and a **Table** toggle (the accessible fallback).

## How the data works

The app reads only `public/data/*` (the PRD's `/data` folder). **To go live, replace those files with verified exports that use the same field names.** Nothing else changes.

- `manifest.json` with `"sample": true` (or a missing manifest) → SAMPLE banner and tags on every card. Remove the flag for real data. A non-null `checked_by` shows "Verified data".
- A file that fails to load blanks only its own panels with an error. Nothing is guessed (fail closed).
- Computed on the client from the PRD formulas: N and the verdict (an integrity check flags stored N values that don't match the formula), M3 excess returns, N4 owned ratio, the §5.6 triggers, and action ranking with at most three cards per horizon.
- Weekly briefs: `triggers_fired` and `verdict_changes` are re-checked with the same §5.6 trigger code and N formula (`lib/metrics.js`, run over the brief's week). A stored value that disagrees is flagged on the panel and is not replaced. `npm run sample-data` imports the same functions, so there is only one copy of the logic. `watch_briefs.json` is also schema-checked on load, and an invalid file blanks the `#/watch` panels just like a missing one.

### Schema additions beyond PRD §4.4 (please confirm)

| File | Addition | Why |
|---|---|---|
| `decision_scores.json` | `confidence` field; one row **per scoring round** (latest round = current) | The brief must show the confidence grade (§1.3, §5.5). Keeping the previous round lets the "verdict changes" trigger be evaluated. |
| `market_share.csv` | `ad_share_low_pct`, `is_estimate` | C4 is a "line with range" and needs a lower bound. M6 is the ceiling. |
| `action_response.json`, `events.json` | `label_en` / `label_zh` on actions | Bilingual labels in C8 and the competitive watch. |
| `recommendations.json` | Listed in the asset table | It is used in §5.5 but missing from the §4.4 table. |
| `watch_briefs.json` | New file. Exactly the §5.7 "Output file" fields: `week`, `period_start`, `period_end`, `run_date`, `headline_en`, `headline_zh`, `moves[event_id, actor, platform, criteria, relation_signal, response, rec_ids]`, `triggers_fired[trigger, platform, detail]`, `verdict_changes[platform, verdict_from, verdict_to, n_from, n_to]`, `emi_context{week_return_pct, taiex_return_pct, excess_return_pct}`, `watch_next[date, label_en, label_zh]`, `status`, `approved_by`. The sample has four weeks (2026-W43 to W46; W44 is quiet, W46 has a verdict change and is a draft). | §5.7 defines it, but the §4.4 asset table doesn't list it. The sample also appends six sample events (EV-…-017 to 022) to `events.json` for the moves to point at. |

## Open PRD gaps

1. **The seven criteria S1–S7 are never named.** The verdict cards therefore show only the B / C / F totals.
2. §2.7 says "four gates" but lists five keep conditions. The schema tables say "As in 6.1/6.2" instead of §2.6.
3. The diagrams referenced in §3.4, §3.5 and §4.3 (`assets/p4-…png`) are missing.
4. No field holds the H4-approved **headline**. The brief writes a placeholder from the verdicts until one is added.

**§5.7 Weekly Platform Watch Brief.** These points are unspecified. Each was handled as stated below; please confirm or correct.

5. **`moves.criteria` format** is not given, and the criteria are unnamed (gap 1). Stored as criterion IDs `S1`–`S7`.
6. **`moves.relation_signal` values** are not listed. Only `partner` and `rival` are accepted, from "partner or rival signal". There is no value for a move that signals neither.
7. **`moves.platform`** for a move by a rival outlet or the government is not defined. Stored as `null`.
8. **`triggers_fired.trigger` identifiers** are not listed. The dashboard's IDs are used: `verdict`, `dependence`, `rules`, `rival`, `market`. `platform` is `null` when a trigger is not platform-specific. For `rules`, null is shown as "all platforms", since §5.6 reopens rules-lever cards for every platform.
9. **"Changed since the last brief"** versus quarterly scoring: verdict status compares the scoring round in effect at `period_end` with the round in effect the day before `period_start`.
10. **Weekly window for the §5.6 triggers** is not defined. In a brief, only data dated inside the week counts. That means regulatory events in the week (not the brief's 30-day window), rival responses dated in the week, and ETtoday events in the week for M3.
11. **The dependence trigger (N3) cannot be checked weekly.** N3 is annual and has no release date, so a weekly run cannot tell whether it moved that week. It is shown as "not re-checked this week (annual data)", not as clear.
12. **`emi_context` week return** has no formula. The sample uses the last close in the week against the last close before it. The view shows the stored values without recomputing them, so there is no integrity check on this block.
13. **"Watch next week" source is `events.json`**, but that file has no way to hold scheduled future events, and `watch_next` has no `event_id`. The entries are not linked to events.
14. **"Linked action card"** has no target for cards the executive brief doesn't show (drafts, or cards below the top three per horizon). `#/watch` shows each card inline and links to `#/brief/rec-…` only when the card is on the brief.
15. **Draft briefs.** §5.7 says a brief is published only when approved, but the dashboard lists drafts too, with a Draft tag and a placeholder headline.

## Design notes

- Chart palette checked with the dataviz validator against the real card surfaces (light `#ffffff`, dark `#111827`). All hard gates pass. Light slots 3–5 are below 3:1 contrast, which is why every chart has direct labels and a table view.
- Colour follows the entity: Google, Meta, LINE and YouTube keep their slot everywhere. Verdicts use a diverging scale (blue partner, gray mixed, red rival), always shown with an icon and a label.
- Emphasis encoding where the question is about one entity (C2 new media, C6 owned channels, C7 likely responders).
