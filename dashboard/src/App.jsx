import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarRange, FileText, Languages, Moon, Sun, TrendingUp, Info, CircleCheck, FlaskConical } from 'lucide-react';
import { I18nProvider, useI18n } from './lib/i18n.jsx';
import { useDashboardData } from './lib/data.js';
import { useChartTokens, useTheme } from './lib/theme.js';
import { DashContext } from './lib/dash.js';
import ExecutiveBrief from './views/ExecutiveBrief.jsx';
import Analytics from './views/Analytics.jsx';
import WatchBrief from './views/WatchBrief.jsx';

const ROUTES = { brief: ExecutiveBrief, watch: WatchBrief, analytics: Analytics };
const TITLES = { brief: 'navBrief', watch: 'navWatch', analytics: 'navAnalytics' };

// Hash routing keeps views deep-linkable on any static host. Format: #/view or #/view/section.
function useHashRoute() {
  const parse = () => {
    const [, view = 'brief', section] = window.location.hash.split('/');
    return { view: ROUTES[view] ? view : 'brief', section };
  };
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onHash = () => setRoute(parse());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

function Shell() {
  const { t, lang, setLang } = useI18n();
  // Theme effect is declared before token reading so tokens resolve against the new theme.
  const [theme, setTheme] = useTheme();
  const tokens = useChartTokens(theme);
  const { status, manifest, data, errors } = useDashboardData();
  const route = useHashRoute();
  const View = ROUTES[route.view];

  // A missing manifest is treated as sample: never present unverified data as verified.
  const isSample = !manifest || manifest.sample === true;
  const isSigned = !!manifest?.checked_by;
  const ctx = useMemo(() => ({ data, errors, manifest, tokens, theme, isSample }), [data, errors, manifest, tokens, theme, isSample]);

  useEffect(() => {
    if (status !== 'ready') return;
    if (route.section) document.getElementById(route.section)?.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, 0);
  }, [status, route.view, route.section]);

  const title = t(TITLES[route.view]);

  return (
    <DashContext.Provider value={ctx}>
      <div className="shell">
        <aside className="sidebar" aria-label="Primary">
          <div className="brand">
            <div className="brand-mark" aria-hidden><TrendingUp size={18} /></div>
            <div>
              <div className="brand-name">{t('appName')}</div>
              <div className="brand-sub">{t('appSub')}</div>
            </div>
          </div>
          <nav className="nav">
            <a href="#/brief" aria-current={route.view === 'brief' ? 'page' : undefined}>
              <FileText size={17} aria-hidden /> {t('navBrief')}
            </a>
            <a href="#/watch" aria-current={route.view === 'watch' ? 'page' : undefined}>
              <CalendarRange size={17} aria-hidden /> {t('navWatch')}
            </a>
            <a href="#/analytics" aria-current={route.view === 'analytics' && !route.section ? 'page' : undefined}>
              <BarChart3 size={17} aria-hidden /> {t('navAnalytics')}
            </a>
            <div className="sub">
              <a href="#/analytics/market" aria-current={route.section === 'market' ? 'page' : undefined}>{t('secMarket')}</a>
              <a href="#/analytics/network" aria-current={route.section === 'network' ? 'page' : undefined}>{t('secNetwork')}</a>
              <a href="#/analytics/competitive" aria-current={route.section === 'competitive' ? 'page' : undefined}>{t('secCompetitive')}</a>
            </div>
          </nav>
          <div className="sidebar-foot">
            {manifest && (
              <>
                <div>{t('version')}: <strong className="mono">{manifest.version}</strong></div>
                <div>{t('runDate')}: <strong className="tnum">{manifest.run_date}</strong></div>
              </>
            )}
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <span className="topbar-title">{title}</span>
            {manifest && (
              <span className={`status-chip ${isSample ? 'sample' : ''}`}>
                {isSample ? <FlaskConical size={13} aria-hidden /> : <CircleCheck size={13} aria-hidden />}
                {isSample ? t('sample') : isSigned ? t('verified') : t('unverified')} · {t('runDate')} {manifest.run_date}
              </span>
            )}
            <span className="topbar-spacer" />
            <div className="segmented" role="group" aria-label={t('language')}>
              <Languages size={14} aria-hidden style={{ margin: '0 4px 0 6px', alignSelf: 'center', color: 'var(--muted)' }} />
              <button type="button" aria-pressed={lang === 'zh'} onClick={() => setLang('zh')}>中</button>
              <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
            </div>
            <div className="segmented" role="group" aria-label={t('theme')}>
              <button type="button" aria-pressed={theme === 'light'} onClick={() => setTheme('light')} aria-label={t('light')}><Sun size={15} aria-hidden /></button>
              <button type="button" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')} aria-label={t('dark')}><Moon size={15} aria-hidden /></button>
            </div>
          </header>

          <main className="content" id="main">
            {isSample && status === 'ready' && (
              <div className="sample-banner" role="note">
                <Info size={16} aria-hidden />
                <span>{t('sampleBanner')}</span>
              </div>
            )}
            {status === 'loading' ? <div className="state">{t('loading')}</div> : <View section={route.section} />}
          </main>
        </div>
      </div>
    </DashContext.Provider>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <Shell />
    </I18nProvider>
  );
}
