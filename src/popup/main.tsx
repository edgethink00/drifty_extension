import { useEffect, useMemo, useState } from 'react';
import { browserTrackerClient, DRIFTY_CATEGORY_METADATA, DRIFTY_PRODUCTIVITY_METADATA } from '../lib/drifty';
import { formatDuration, formatTimeLabel, pluralize } from '../shared/format';
import { StatusBox, type ToneItem } from '../shared/SurfacePrimitives';
import { mountSurface } from '../shared/mount';

document.title = 'Drifty | Quick View';

type PopupData = Awaited<ReturnType<typeof loadPopupData>>;

type LoadState = {
  status: 'loading' | 'ready' | 'error';
  data: PopupData | null;
  error: string | null;
};

const productivityToneColor = {
  focus: 'var(--focus)',
  neutral: 'var(--neutral)',
  drift: 'var(--drift)'
} as const;

const categoryToneColor = {
  workspace: 'var(--category-workspace)',
  learning: 'var(--category-learning)',
  communication: 'var(--category-communication)',
  music: 'var(--category-music)',
  game: 'var(--category-game)',
  social_media: 'var(--category-social-media)',
  entertainment: 'var(--category-entertainment)',
  shopping: 'var(--category-shopping)',
  utility: 'var(--category-utility)',
  unknown: 'var(--category-unknown)'
} as const;

async function loadPopupData() {
  try {
    const { today, currentSession } = await browserTrackerClient.getPopupData();
    return { today, currentSession };
  } catch {
    const [today, currentSession] = await Promise.all([
      browserTrackerClient.getTodayStats(),
      browserTrackerClient.getCurrentSession().catch(() => null)
    ]);
    return { today, currentSession };
  }
}

function openDashboard() {
  const dashboardPath = 'dashboard/index.html';

  if (typeof chrome !== 'undefined' && chrome.tabs?.create && chrome.runtime?.getURL) {
    chrome.tabs.create({ url: chrome.runtime.getURL(dashboardPath) });
    return;
  }

  window.location.href = `../${dashboardPath}`;
}

function PopupApp() {
  const [state, setState] = useState<LoadState>({ status: 'loading', data: null, error: null });

  useEffect(() => {
    let active = true;

    loadPopupData()
      .then((data) => {
        if (active) setState({ status: 'ready', data, error: null });
      })
      .catch((error: unknown) => {
        if (active) {
          setState({ status: 'error', data: null, error: error instanceof Error ? error.message : 'Unable to load local activity.' });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const today = state.data?.today;
  const currentSession = state.data?.currentSession ?? null;
  const categoryItems = useMemo<ToneItem[]>(() => {
    return (today?.categoryDurations ?? [])
      .filter((item) => item.totalSeconds > 0)
      .slice(0, 4)
      .map((item) => ({
        label: DRIFTY_CATEGORY_METADATA[item.category].label,
        seconds: item.totalSeconds,
        ratio: item.ratio,
        color: categoryToneColor[item.category as keyof typeof categoryToneColor]
      }));
  }, [today]);
  const productivityItems = useMemo<ToneItem[]>(() => {
    return (today?.productivityDurations ?? [])
      .filter((item) => item.totalSeconds > 0)
      .map((item) => ({
        label: DRIFTY_PRODUCTIVITY_METADATA[item.productivity].label,
        seconds: item.totalSeconds,
        ratio: item.ratio,
        color: productivityToneColor[item.productivity]
      }));
  }, [today]);

  return (
    <main className="surface surface--popup">
      <div className="popup-shell">
        <header className="page-header page-header--popup">
          <div className="brand-lockup">
            <span className="eyebrow">Drifty browser</span>
            <h1>Your browser time</h1>
            <p className="muted">Local browser time, sites, and drift at a glance.</p>
          </div>
        </header>

        {state.status === 'error' ? (
          <StatusBox title="Extension reader paused" detail={state.error ?? 'Open this popup from the installed extension to see local activity.'} kind="error" />
        ) : null}

        <section className="popup-today-card">
          <div>
            <span className="eyebrow">Today</span>
            <strong>{formatDuration(today?.totalSeconds ?? 0)}</strong>
            <p className="muted">{pluralize(today?.segments.length ?? 0, 'local segment')}</p>
          </div>
          <div className="popup-stat-ring" role="img" aria-label={`Leading productivity mix: ${productivityItems[0]?.label ?? 'Quiet'} ${productivityItems[0] ? Math.round(productivityItems[0].ratio * 100) : 0}%`}>
            <span>{productivityItems[0]?.label ?? 'Quiet'}</span>
            <strong>{productivityItems[0] ? Math.round(productivityItems[0].ratio * 100) : 0}%</strong>
          </div>
        </section>

        <section className="popup-section popup-current-site-card">
          <div className="popup-section__head"><h2>Current site</h2></div>
            {currentSession ? (
              <div className="list-row">
                <div className="list-title">
                  <strong className="truncate">{currentSession.siteDomain ?? currentSession.siteTitle ?? currentSession.appName}</strong>
                  <span className="muted truncate">{DRIFTY_CATEGORY_METADATA[currentSession.classification?.category ?? 'unknown'].label} · Started {formatTimeLabel(currentSession.startedAt)}</span>
                </div>
                <span className="measure">{formatDuration(currentSession.durationSeconds)}</span>
              </div>
            ) : (
              <p className="muted popup-empty-line">No active session yet.</p>
            )}
        </section>

        <div className="popup-columns">
          <section className="popup-section popup-categories-card">
            <div className="popup-section__head"><h2>Categories</h2></div>
            {categoryItems.length > 0 ? (
              <div className="popup-compact-list">
                {categoryItems.slice(0, 3).map((item) => (
                  <div className="popup-compact-row" key={item.label}>
                    <span>{item.label}</span>
                    <strong>{formatDuration(item.seconds)}</strong>
                  </div>
                ))}
              </div>
            ) : <p className="muted popup-empty-line">No categories yet.</p>}
          </section>

          <section className="popup-section popup-top-sites-card">
            <div className="popup-section__head"><h2>Top Sites</h2></div>
            {today && today.topActivities.length > 0 ? (
              <div className="popup-compact-list">
                {today.topActivities.slice(0, 2).map((activity) => (
                  <div className="popup-compact-row" key={`${activity.usageKind}-${activity.siteDomain ?? activity.appName}`}>
                    <span className="truncate">{activity.siteDomain ?? activity.appName}</span>
                    <strong>{formatDuration(activity.totalSeconds)}</strong>
                  </div>
                ))}
              </div>
            ) : <p className="muted popup-empty-line">No top sites yet.</p>}
          </section>
        </div>

        <section className="popup-section popup-focus-card">
          <div className="popup-section__head"><h2>Focus and Drift</h2></div>
          <div className="popup-mix-strip">
            {(['focus', 'neutral', 'drift'] as const).map((productivity) => {
              const item = productivityItems.find((candidate) => candidate.label === DRIFTY_PRODUCTIVITY_METADATA[productivity].label);
              return (
                <div className={`popup-mix-item popup-mix-item--${productivity}`} key={productivity}>
                  <span>{DRIFTY_PRODUCTIVITY_METADATA[productivity].label}</span>
                  <strong>{formatDuration(item?.seconds ?? 0)}</strong>
                </div>
              );
            })}
          </div>
        </section>

        <button className="button button--primary" type="button" onClick={openDashboard}>Open dashboard</button>
      </div>
    </main>
  );
}

mountSurface(<PopupApp />);
