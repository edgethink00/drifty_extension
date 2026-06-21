import { useEffect, useMemo, useState } from 'react';
import {
  browserTrackerClient,
  DRIFTY_BROWSER_SETTINGS_DEFAULTS,
  DRIFTY_CATEGORY_LIST,
  DRIFTY_PRODUCTIVITY_LIST,
  summarizeLegacyStats
} from '../lib/drifty';
import { formatDuration } from '../shared/format';
import { EmptyState, Metric, Panel, PrivacyPills, StatusBox } from '../shared/SurfacePrimitives';
import { mountSurface } from '../shared/mount';
import { readOnboardingChoices, saveOnboardingChoices, type OnboardingChoices } from '../shared/storage';

document.title = 'Drifty | First Run';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type RuntimePreview = Awaited<ReturnType<typeof browserTrackerClient.getTodayStats>>;

const localPreviewFallback = summarizeLegacyStats({ categories: {}, totalTime: 0 });

function chromeDashboardUrl() {
  const dashboardPath = 'dashboard/index.html';

  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(dashboardPath);
  }

  return `../${dashboardPath}`;
}

function openDashboard() {
  const url = chromeDashboardUrl();

  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    chrome.tabs.create({ url });
    return;
  }

  window.location.href = url;
}

function ToggleRow({ label, detail, checked, onToggle }: { label: string; detail: string; checked: boolean; onToggle: () => void }) {
  return (
    <div className="setting-row setting-row--contained">
      <div className="stack-tight">
        <strong>{label}</strong>
        <span className="muted">{detail}</span>
      </div>
      <button className="switch" type="button" role="switch" aria-checked={checked} aria-label={label} onClick={onToggle} />
    </div>
  );
}

function LockedSetting({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="setting-row setting-row--contained">
      <div className="stack-tight">
        <strong>{label}</strong>
        <span className="muted">{detail}</span>
      </div>
      <span className="pill">Off</span>
    </div>
  );
}

function OnboardingApp() {
  const [historyImport, setHistoryImport] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [runtimePreview, setRuntimePreview] = useState<RuntimePreview | null>(null);
  const [runtimeReady, setRuntimeReady] = useState(false);

  useEffect(() => {
    let active = true;

    readOnboardingChoices().then((choices) => {
      if (!active || !choices) return;
      setHistoryImport(choices.historyImport);
      setNotifications(choices.notifications);
      setSaveState('saved');
    });

    browserTrackerClient.getTodayStats()
      .then((summary) => {
        if (!active) return;
        setRuntimePreview(summary);
        setRuntimeReady(true);
      })
      .catch(() => {
        if (!active) return;
        setRuntimePreview(localPreviewFallback);
        setRuntimeReady(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const taxonomySample = useMemo(() => DRIFTY_CATEGORY_LIST.slice(0, 6), []);
  const productivitySummary = useMemo(() => DRIFTY_PRODUCTIVITY_LIST.map((item) => item.label).join(', '), []);

  async function completeSetup() {
    const choices: OnboardingChoices = {
      historyImport,
      notifications,
      cloudSync: false,
      rawSync: false,
      completedAt: new Date().toISOString()
    };

    setSaveState('saving');
    setSaveError(null);

    try {
      await saveOnboardingChoices(choices);
      setSaveState('saved');
    } catch (error) {
      setSaveState('error');
      setSaveError(error instanceof Error ? error.message : 'Unable to save setup choices locally.');
    }
  }

  return (
    <main className="surface">
      <div className="shell shell--narrow">
        <header className="page-header onboarding-hero">
          <div className="brand-lockup">
            <span className="eyebrow">Drifty first run</span>
            <h1>Set up a calmer browser record.</h1>
            <p className="muted">Drifty keeps browsing time, site categories, and session summaries on this device so the dashboard can explain your day without uploading raw history.</p>
          </div>
          <PrivacyPills runtimeReady={runtimeReady} />
        </header>

        <div className="grid grid--dashboard">
          <div className="stack">
            <Panel title="What Drifty tracks" eyebrow="Local data">
              <div className="timeline-list">
                <div className="timeline-item">
                  <span className="step-mark">1</span>
                  <div className="stack-tight">
                    <strong>Browser sessions</strong>
                    <span className="muted">Start time, duration, active site domain, and local category are stored for summaries.</span>
                  </div>
                </div>
                <div className="timeline-item">
                  <span className="step-mark">2</span>
                  <div className="stack-tight">
                    <strong>Activity categories</strong>
                    <span className="muted">The extension maps sites into Drifty taxonomy cards such as {taxonomySample.map((item) => item.label).join(', ')}.</span>
                  </div>
                </div>
                <div className="timeline-item">
                  <span className="step-mark">3</span>
                  <div className="stack-tight">
                    <strong>Focus mix</strong>
                    <span className="muted">Daily summaries roll categories into {productivitySummary.toLowerCase()} so the popup can stay compact.</span>
                  </div>
                </div>
              </div>
            </Panel>

            <Panel title="Choose local setup options" eyebrow="First run">
              <ToggleRow
                label="Offer local history import"
                detail="Use Chrome history on this device to estimate recent browser time. Nothing is uploaded."
                checked={historyImport}
                onToggle={() => setHistoryImport((value) => !value)}
              />
              <ToggleRow
                label="Allow browser notifications"
                detail="Store a preference for local reminders when Drifty adds notification moments."
                checked={notifications}
                onToggle={() => setNotifications((value) => !value)}
              />
              <LockedSetting label="Cloud sync" detail="Off by default for this MV3 surface." />
              <LockedSetting label="Raw history and session sync" detail="Off by default. Raw browsing records stay in local extension storage." />
            </Panel>
          </div>

          <aside className="stack">
            <Panel title="Local storage posture" eyebrow="Privacy">
              <div className="notice">
                <strong>No upload during setup.</strong>
                <p className="muted">Choices are saved to chrome.storage.local when the extension runtime is available, with localStorage as the development fallback.</p>
              </div>
              <div className="grid grid--two">
                <Metric label="Cloud sync" value={DRIFTY_BROWSER_SETTINGS_DEFAULTS.sync.cloudSyncEnabled ? 'On' : 'Off'} detail="Default setting" />
                <Metric label="Raw sync" value={DRIFTY_BROWSER_SETTINGS_DEFAULTS.sync.rawHistorySyncEnabled || DRIFTY_BROWSER_SETTINGS_DEFAULTS.sync.rawSessionSyncEnabled ? 'On' : 'Off'} detail="Default setting" />
              </div>
            </Panel>

            <Panel title="Today preview" eyebrow="Runtime">
              {runtimePreview ? (
                <div className="stack">
                  <Metric label="Local time found" value={formatDuration(runtimePreview.totalSeconds)} detail={runtimeReady ? 'Read from extension runtime' : 'Runtime unavailable in this context'} />
                  {runtimePreview.topActivities.length > 0 ? (
                    <div className="list">
                      {runtimePreview.topActivities.slice(0, 3).map((activity) => (
                        <div className="list-row" key={`${activity.usageKind}-${activity.appName}`}>
                          <div className="list-title">
                            <strong className="truncate">{activity.siteDomain ?? activity.appName}</strong>
                            <span className="muted truncate">Saved locally</span>
                          </div>
                          <span className="measure">{formatDuration(activity.totalSeconds)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="No local activity yet" detail="After setup, browse normally and Drifty will begin filling the popup and dashboard." />
                  )}
                </div>
              ) : (
                <StatusBox title="Checking runtime" detail="Drifty is looking for today's local extension summary." />
              )}
            </Panel>

            {saveState === 'error' ? <StatusBox title="Setup was not saved" detail={saveError ?? 'Try again from the installed extension.'} kind="error" /> : null}
            {saveState === 'saved' ? <StatusBox title="Setup saved locally" detail="Your choices are stored on this browser only. You can open the dashboard now." /> : null}

            <div className="button-row">
              <button className="button button--primary" type="button" onClick={completeSetup} disabled={saveState === 'saving'}>
                {saveState === 'saving' ? 'Saving setup' : 'Save local setup'}
              </button>
              <button className="button button--secondary" type="button" onClick={openDashboard}>Open dashboard</button>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

mountSurface(<OnboardingApp />);
