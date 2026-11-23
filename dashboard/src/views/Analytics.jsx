import { useState } from 'react';
import { useI18n } from '../lib/i18n.jsx';
import { useDash } from '../lib/dash.js';
import { C1IndexedPrice, C2Segments, C3AudienceTrust, C4AdShare } from '../charts/MarketCharts.jsx';
import { C5Quadrant, C6TrafficMix } from '../charts/NetworkCharts.jsx';
import { C7CompetitorMap, C8Timeline } from '../charts/CompetitiveCharts.jsx';
import { Disclaimer } from '../components/ui.jsx';

export default function Analytics() {
  const { t } = useI18n();
  const { data } = useDash();
  const years = [...new Set([...(data.market_share ?? []), ...(data.network_effects ?? [])].map((r) => r.year))].sort();
  const [range, setRange] = useState('r1y');
  const [year, setYear] = useState(() => years.at(-1));

  return (
    <>
      <div className="page-head">
        <h1>{t('analyticsTitle')}</h1>
        <p>{t('analyticsSub')}</p>
      </div>

      {/* One filter row above everything it scopes (dataviz interaction rule). */}
      <div className="filterbar" role="group" aria-label={t('filters')}>
        <div className="filter">
          <span className="filter-label" id="f-range">{t('priceRange')}</span>
          <div className="segmented" role="group" aria-labelledby="f-range">
            {['r6m', 'r1y', 'rAll'].map((r) => (
              <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}>{t(r)}</button>
            ))}
          </div>
        </div>
        {years.length > 0 && (
          <div className="filter">
            <span className="filter-label" id="f-year">{t('snapshotYear')}</span>
            <div className="segmented" role="group" aria-labelledby="f-year">
              {years.map((y) => (
                <button key={y} type="button" aria-pressed={year === y} onClick={() => setYear(y)}>{y}</button>
              ))}
            </div>
            <span className="filter-hint">{t('snapshotHint')}</span>
          </div>
        )}
      </div>

      <section className="section" id="market" aria-labelledby="sec-market">
        <div className="section-head">
          <h2 id="sec-market">{t('secMarket')}</h2>
          <p>{t('contextOnly')}</p>
        </div>
        <div className="grid grid-2">
          <C1IndexedPrice range={range} />
          <C2Segments />
          <C3AudienceTrust year={year} />
          <C4AdShare />
        </div>
      </section>

      <section className="section" id="network" aria-labelledby="sec-network">
        <div className="section-head"><h2 id="sec-network">{t('secNetwork')}</h2></div>
        <div className="grid grid-2">
          <C5Quadrant year={year} />
          <C6TrafficMix />
        </div>
      </section>

      <section className="section" id="competitive" aria-labelledby="sec-competitive">
        <div className="section-head"><h2 id="sec-competitive">{t('secCompetitive')}</h2></div>
        <div className="grid grid-2">
          <C7CompetitorMap />
          <C8Timeline />
        </div>
      </section>

      <Disclaimer>{t('outsideView')}</Disclaimer>
    </>
  );
}
