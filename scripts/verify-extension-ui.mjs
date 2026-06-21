import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const projectRoot = resolve(new URL('..', import.meta.url).pathname);
const extensionRoot = resolve(projectRoot, 'dist');
const popupViewport = { width: 380, height: 520 };
const dashboardViewport = { width: 1280, height: 900 };
const evidenceDir = process.env.DRIFTY_UI_EVIDENCE_DIR || '';
const runtimeDbName = 'drifty_browser_runtime';
const runtimeDbVersion = 1;
const runtimeSessionStore = 'sessions';
const runtimeVisitStore = 'visits';

const chromeCandidates = [
  process.env.CHROME_EXECUTABLE_PATH,
  '/Users/jeongjin/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium'
].filter(Boolean);

function findChromeExecutable() {
  const executable = chromeCandidates.find((candidate) => existsSync(candidate));

  if (!executable) {
    throw new Error(`Chrome executable not found. Set CHROME_EXECUTABLE_PATH or install Chrome for Testing. Checked: ${chromeCandidates.join(', ')}`);
  }

  return executable;
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localTimestampAt(hour, minute, dayOffset = 0) {
  const date = seedBaseDate();
  date.setHours(hour, minute, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  return date.getTime();
}

function seedBaseDate() {
  const date = new Date();
  if (date.getHours() < 4) {
    date.setDate(date.getDate() - 1);
  }
  return date;
}

function makeSeedSession({ id, category, startHour, startMinute, endHour, endMinute, domain, title, url, dayOffset = 0, endDayOffset = dayOffset }) {
  const startTime = localTimestampAt(startHour, startMinute, dayOffset);
  const endTime = localTimestampAt(endHour, endMinute, endDayOffset);
  const date = localDateKey(new Date(startTime));

  return {
    id,
    category,
    startTime,
    endTime,
    lastVisitTime: endTime,
    duration: Math.max(0, endTime - startTime),
    date,
    domain,
    title,
    url,
    appIconSrc: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"%3E%3Crect width="28" height="28" rx="8" fill="%232a7fff"/%3E%3C/svg%3E',
    visits: [{ id: `${id}-visit`, url, title, timestamp: startTime, date, domain, category }],
    source: 'ui-contract-seed'
  };
}

function seededDashboardSessions() {
  return [
    makeSeedSession({
      id: 'seed-docs-flow',
      category: 'productivity',
      startHour: 14,
      startMinute: 10,
      endHour: 14,
      endMinute: 20,
      domain: 'docs.example.com',
      title: 'Docs / Flow',
      url: 'https://docs.example.com/flow'
    }),
    makeSeedSession({
      id: 'seed-boundary-flow',
      category: 'education',
      startHour: 4,
      startMinute: 5,
      endHour: 4,
      endMinute: 8,
      domain: 'boundary.example.com',
      title: 'Boundary notes',
      url: 'https://boundary.example.com/notes'
    }),
    makeSeedSession({
      id: 'seed-post-midnight-flow',
      category: 'productivity',
      startHour: 2,
      startMinute: 5,
      endHour: 2,
      endMinute: 11,
      domain: 'night.example.com',
      title: 'Night handoff',
      url: 'https://night.example.com/handoff',
      dayOffset: 1
    }),
    makeSeedSession({
      id: 'seed-previous-date-boundary-flow',
      category: 'productivity',
      startHour: 23,
      startMinute: 55,
      endHour: 4,
      endMinute: 5,
      domain: 'early.example.com',
      title: 'Early boundary handoff',
      url: 'https://early.example.com/handoff',
      dayOffset: -1,
      endDayOffset: 0
    }),
    makeSeedSession({
      id: 'seed-midnight-span-flow',
      category: 'productivity',
      startHour: 23,
      startMinute: 55,
      endHour: 0,
      endMinute: 5,
      domain: 'midnight.example.com',
      title: 'Midnight span',
      url: 'https://midnight.example.com/span',
      endDayOffset: 1
    }),
    makeSeedSession({
      id: 'seed-meet-flow',
      category: 'communication',
      startHour: 12,
      startMinute: 0,
      endHour: 12,
      endMinute: 8,
      domain: 'meet.google.com',
      title: 'Design sync',
      url: 'https://meet.google.com/design-sync'
    }),
    makeSeedSession({
      id: 'seed-drift-flow',
      category: 'social',
      startHour: 16,
      startMinute: 30,
      endHour: 16,
      endMinute: 40,
      domain: 'instagram.com',
      title: 'Instagram',
      url: 'https://instagram.com/'
    }),
    makeSeedSession({
      id: 'seed-shopping-flow',
      category: 'shopping',
      startHour: 17,
      startMinute: 0,
      endHour: 17,
      endMinute: 6,
      domain: 'shop.example.com',
      title: 'Shopping cart',
      url: 'https://shop.example.com/cart'
    }),
    ...makeDenseWeekCluster()
  ];
}

function makeDenseWeekCluster() {
  const domains = [
    ['dense-youtube-1', 'youtube.com', 'Watch queue', 'https://youtube.com/watch?v=1', 'entertainment', 10, 0, 10, 4],
    ['dense-youtube-2', 'youtube.com', 'Watch queue', 'https://youtube.com/watch?v=2', 'entertainment', 10, 5, 10, 8],
    ['dense-github-1', 'github.com', 'Pull request', 'https://github.com/example/repo/pull/1', 'productivity', 10, 9, 10, 13],
    ['dense-chatgpt-1', 'chatgpt.com', 'Research prompt', 'https://chatgpt.com/c/1', 'productivity', 10, 14, 10, 18],
    ['dense-github-2', 'github.com', 'Issue triage', 'https://github.com/example/repo/issues/2', 'productivity', 10, 19, 10, 23],
    ['dense-youtube-3', 'youtube.com', 'Short clip', 'https://youtube.com/shorts/1', 'entertainment', 10, 24, 10, 27]
  ];

  return domains.map(([id, domain, title, url, category, startHour, startMinute, endHour, endMinute]) => makeSeedSession({
    id,
    category,
    startHour,
    startMinute,
    endHour,
    endMinute,
    domain,
    title,
    url,
    dayOffset: -2
  }));
}

async function waitFor(condition, description, timeoutMilliseconds = 12000) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMilliseconds) {
    try {
      const value = await condition();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }

    await delay(100);
  }

  throw new Error(`${description} timed out${lastError instanceof Error ? `: ${lastError.message}` : ''}`);
}

async function requestJson(url, init) {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }

  return response.json();
}

async function waitForDevTools(port) {
  return waitFor(() => requestJson(`http://127.0.0.1:${port}/json/version`), 'Chrome DevTools endpoint');
}

async function listTargets(port) {
  return requestJson(`http://127.0.0.1:${port}/json/list`);
}

async function discoverExtensionId(port) {
  return waitFor(async () => {
    const targets = await listTargets(port);
    const extensionTarget = targets.find((target) => {
      const url = target.url ?? '';
      return target.type === 'service_worker' && url.startsWith('chrome-extension://') && url.endsWith('/background/service-worker.js');
    });
    const match = extensionTarget?.url.match(/^chrome-extension:\/\/([^/]+)/);
    return match?.[1] ?? null;
  }, 'loaded Drifty extension target');
}

async function createPage(port) {
  return requestJson(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' });
}

class CdpPage {
  constructor(target) {
    this.target = target;
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(target.webSocketDebuggerUrl);
  }

  async connect() {
    if (this.socket.readyState === WebSocket.OPEN) return;

    await new Promise((resolveOpen, rejectOpen) => {
      this.socket.addEventListener('open', resolveOpen, { once: true });
      this.socket.addEventListener('error', rejectOpen, { once: true });
    });

    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data.toString());
      if (!message.id) return;

      const callbacks = this.pending.get(message.id);
      if (!callbacks) return;

      this.pending.delete(message.id);
      if (message.error) {
        callbacks.reject(new Error(message.error.message));
        return;
      }

      callbacks.resolve(message.result ?? {});
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;

    return new Promise((resolveSend, rejectSend) => {
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async setViewport({ width, height }) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false
    });
    await this.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: 'light' }]
    });
  }

  async waitUntilReady() {
    await this.send('Page.enable');
    await waitFor(async () => {
      const result = await this.evaluate(() => document.readyState);
      return result === 'complete' || result === 'interactive';
    }, `page ${this.target.url} to become ready`);
  }

  async navigate(url) {
    await this.send('Page.enable');
    const navigation = await this.send('Page.navigate', { url });

    if (navigation.errorText) {
      throw new Error(`Navigation to ${url} failed: ${navigation.errorText}`);
    }

    const startedAt = Date.now();
    let lastStatus = null;

    while (Date.now() - startedAt < 12000) {
      lastStatus = await this.evaluate(() => ({
        href: window.location.href,
        readyState: document.readyState,
        title: document.title,
        rootPresent: document.querySelector('#root') !== null,
        bodyText: document.body?.textContent?.slice(0, 160) ?? ''
      }));

      if (lastStatus.href === url && (lastStatus.readyState === 'complete' || lastStatus.readyState === 'interactive')) {
        return;
      }

      await delay(100);
    }

    throw new Error(`page to navigate to ${url} timed out with status ${JSON.stringify(lastStatus)}`);
  }

  async snapshot() {
    return this.evaluate(() => ({
      href: window.location.href,
      readyState: document.readyState,
      title: document.title,
      rootPresent: document.querySelector('#root') !== null,
      shellPresent: document.querySelector('.shell') !== null,
      popupPresent: document.querySelector('.surface--popup') !== null,
      bodyText: document.body?.textContent?.slice(0, 240) ?? ''
    }));
  }

  async evaluate(pageFunction, ...args) {
    const expression = `(${pageFunction.toString()})(...${JSON.stringify(args)})`;
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });

    if (result.exceptionDetails) {
      const description = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'Runtime evaluation failed';
      throw new Error(description);
    }

    return result.result?.value;
  }

  async clickAt(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }

  async hoverAt(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  }

  async screenshot(path) {
    await this.send('Page.enable');
    const result = await this.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    await writeFile(path, Buffer.from(result.data, 'base64'));
  }

  close() {
    this.socket.close();
  }
}

function collectPopupAssertions(layout) {
  const failures = [];

  if (!layout.hasPopupSurface) failures.push('popup .surface--popup is missing');
  if (!layout.hasDashboardButton) failures.push('popup Open dashboard button is missing');
  if (layout.hasGenericCopy) failures.push('popup still contains rejected generic copy: Quick local snapshot / Saved locally / Runtime connected');
  if (!layout.buttonVisibleInViewport) failures.push(`popup Open dashboard button is clipped: bottom ${layout.buttonRect?.bottom ?? 'n/a'} exceeds viewport ${popupViewport.height}`);
  if (!layout.buttonHasSafeBottomPadding) failures.push(`popup Open dashboard button is too close to the bottom edge: bottom ${layout.buttonRect?.bottom ?? 'n/a'} exceeds safe area ${popupViewport.height - 8}`);
  if (!layout.buttonInFinalArea) failures.push(`popup Open dashboard button is not anchored in the final visible area: top ${layout.buttonRect?.top ?? 'n/a'} is above ${popupViewport.height - 72}`);
  if (!layout.buttonClickable) failures.push('popup Open dashboard button is not the top hit-test target at its center');
  if (!layout.surfaceFitsViewport) failures.push(`popup surface overflows viewport: scrollHeight ${layout.surfaceScrollHeight} > clientHeight ${layout.surfaceClientHeight}`);
  if (!layout.shellFitsViewport) failures.push(`popup shell overflows: scrollHeight ${layout.shellScrollHeight} > clientHeight ${layout.shellClientHeight}`);
  if (!layout.documentFitsViewport) failures.push(`popup document overflows viewport: document ${layout.documentScrollHeight}, body ${layout.bodyScrollHeight}, viewport ${popupViewport.height}`);
  if (!layout.usesDriftyShellCopy) failures.push('popup does not expose Drifty shell copy from the Mac product language');
  if (!layout.hasLegacyPopupTodayCard) failures.push('popup should use legacy-style Today summary card');
  if (!layout.hasLegacyPopupCurrentSite) failures.push('popup should show legacy-style Current site section');
  if (!layout.hasLegacyPopupCategories) failures.push('popup should show legacy-style Categories section');
  if (!layout.hasLegacyPopupTopSites) failures.push('popup should show legacy-style Top Sites section');
  if (!layout.hasCompactCategoryRows) failures.push(`popup Categories should render at most 3 compact rows, found ${layout.categoryRowCount}`);
  if (!layout.hasCompactTopSiteRows) failures.push(`popup Top Sites should render at most 2 compact rows, found ${layout.topSiteRowCount}`);
  if (!layout.popupShellUsesTokenSurface) failures.push(`popup shell should use a flat tokenized Drifty surface, got ${JSON.stringify(layout.popupShellBackground ?? {})}`);

  return failures;
}

function collectDashboardAssertions(layout) {
  const failures = [];

  if (!layout.hasShell) failures.push('dashboard .shell is missing');
  if (!layout.hasMacStyleDashboardCopy) failures.push('dashboard does not expose Mac-Drifty dashboard language');
  if (!layout.hasLocalPrivacyCopy) failures.push('dashboard must keep local-first privacy copy visible');
  if (layout.hasLeaderboardCopy) failures.push('dashboard still contains leaderboard/profile/public ranking copy');
  if (!layout.sidebarVisible) failures.push('dashboard sidebar is not visible in the initial viewport');
  if (!layout.dashboardWithinViewport) failures.push(`dashboard initial shell width ${layout.shellWidth} exceeds viewport ${dashboardViewport.width}`);
  if (!layout.documentNoHorizontalOverflow) failures.push(`dashboard document overflows horizontally: document ${layout.documentScrollWidth}, body ${layout.bodyScrollWidth}, viewport ${dashboardViewport.width}`);
  if (!layout.hasMacDateNavigator) failures.push('dashboard missing Mac-style date navigator');
  if (!layout.dateNavigatorIsCompact) failures.push(`dashboard date navigator is too tall: ${JSON.stringify(layout.dateNavigatorCss ?? {})}`);
  if (!layout.hasFlowBreakdownLayout) failures.push('dashboard missing canonical .flow-breakdown-layout');
  if (!layout.hasFlowBreakdownChart) failures.push('dashboard missing canonical .flow-breakdown-layout__chart');
  if (!layout.hasFlowChartCard) failures.push('dashboard missing canonical .flow-chart-card');
  if (layout.flowInterval !== '3') failures.push(`dashboard flow chart should start at 3-minute interval, got ${layout.flowInterval ?? 'none'}`);
  if (layout.hourAxisCellCount !== 24) failures.push(`dashboard flow chart should render 24 hour-axis cells, got ${layout.hourAxisCellCount}`);
  if (layout.flowRowCount !== 20) failures.push(`dashboard 3-minute flow chart should render 20 minute rows, got ${layout.flowRowCount}`);
  if (!layout.hasLegendGroups) failures.push('dashboard flow chart missing Focus/Neutral/Drift legend groups');
  if (!layout.hasDocsCell) failures.push('dashboard flow chart missing seeded docs.example.com site cell');
  if (!layout.hasBoundaryCell) failures.push('dashboard flow chart missing seeded boundary-time site cell');
  if (!layout.hasPostMidnightCell) failures.push('dashboard flow chart missing post-midnight logical-day site cell');
  if (!layout.hasPreviousDateBoundaryCell) failures.push('dashboard flow chart missing previous-calendar-date session crossing the 4am logical-day boundary');
  if (!layout.hasDedupedMidnightSpanCell) failures.push('dashboard ordinary-midnight-spanning session should be supplied once, not doubled by two date queries');
  if (!layout.hasClippedLogicalDayTotal) failures.push(`dashboard logical-day totals should clip overlapping sessions before right-rail/summary aggregation, got ${layout.localTimeValue ?? 'none'}`);
  if (!layout.hasShoppingDriftCell) failures.push('dashboard shopping flow cell should be grouped as Drift like Mac FlowChartView');
  if (!layout.hasCompactSplitChart) failures.push('dashboard missing canonical .flow-compact-split-chart right rail');
  if (!layout.hasCurrentMarker) failures.push('dashboard flow chart missing current hour/row marker classes');
  if (!layout.hasCanonicalFlowCopy) failures.push('dashboard flow chart copy does not match canonical dominant app or site copy');
  if (!layout.hasCanonicalSocialMediaLabel) failures.push('dashboard category copy should use canonical Social media casing');
  if (!layout.hasCanonicalGlyphFallbackCss) failures.push(`dashboard app glyph/fallback icon CSS should match Mac canonical values: ${JSON.stringify(layout.glyphFallbackCss ?? {})}`);
  if (!layout.hasCanonicalSiteLineCss) failures.push(`dashboard site favicon/site-line CSS should match Mac canonical values: ${JSON.stringify(layout.siteLineCss ?? {})}`);
  if (!layout.hasCanonicalProductivityOrder) failures.push(`dashboard compact productivity order should be Focus, Drift, Neutral; got ${layout.compactProductivityOrder?.join(', ') ?? 'none'}`);
  if (!layout.hasCanonicalStartOfDayAxis) failures.push(`dashboard flow chart hour axis should start at 4am like Mac, got ${layout.firstHourLabel ?? 'none'}`);
  if (!layout.hasCanonicalCellAriaTime) failures.push('dashboard flow cell aria-label should use canonical en-dash Time block copy');
  if (!layout.hasCanonicalFlowCss) failures.push(`dashboard flow chart CSS values do not match Mac canonical values: ${JSON.stringify(layout.flowCss ?? {})}`);
  if (!layout.hasBrowserUsageSourceDetail) failures.push('dashboard Browser usage panel rows should include category/productivity/source detail from local segments');

  return failures;
}

function collectEmptyDashboardAssertions(layout) {
  const failures = [];

  if (!layout.hasNoTimelineCopy) failures.push('empty dashboard missing Mac empty-state copy: No timeline yet');
  if (!layout.hasCanonicalEmptyDetail) failures.push('empty dashboard detail copy should match Mac paused/live timeline copy');
  if (layout.hasFlowChartCard) failures.push('empty dashboard should not render .flow-chart-card');

  return failures;
}

async function clickDashboardTab(page, label) {
  const rect = await page.evaluate((tabLabel) => {
    const button = Array.from(document.querySelectorAll('.nav-item')).find((candidate) => candidate.textContent?.includes(tabLabel));
    const bounds = button?.getBoundingClientRect();
    return bounds ? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 } : null;
  }, label);

  if (!rect) return false;
  await page.clickAt(rect.x, rect.y);
  await waitFor(async () => page.evaluate((tabLabel) => {
    const button = Array.from(document.querySelectorAll('.nav-item')).find((candidate) => candidate.textContent?.includes(tabLabel));
    return button?.classList.contains('nav-item--active');
  }, label), `${label} tab to become selected`);
  return true;
}

async function collectDashboardTabAssertions(page) {
  const failures = [];
  const tabContracts = [
    {
      label: 'Week',
      description: 'week tab',
      check: () => ({
        hasSurface: document.querySelector('.week-tab-surface') !== null,
        hasMacWeekSurface: document.querySelector('.week-v2')?.getAttribute('aria-label') === 'Your week overview',
        hasWeekSummary: document.querySelector('.week-v2-summary')?.getAttribute('aria-label') === 'Week summary',
        hasSevenSummaryBars: document.querySelectorAll('.week-v2-summary__bar').length === 7,
        hasCalendarDayColumns: document.querySelectorAll('.week-v2-calendar__day-column').length === 7,
        hasCalendarDayHead: document.querySelectorAll('.week-v2-calendar__day-head > span').length === 8,
        hasCalendarTimeRail: document.querySelector('.week-v2-calendar__time-rail') !== null,
        hasCalendarEvents: document.querySelectorAll('.week-v2-calendar__event').length > 0,
        hasCalendarEventFavicons: document.querySelectorAll('.week-v2-calendar__event .site-favicon').length > 0,
        hasGroupedDenseCluster: document.querySelectorAll('.week-v2-calendar__event--grouped').length > 0,
        keepsGroupedClustersCompact: Array.from(document.querySelectorAll('.week-v2-calendar__event--grouped')).some((node) => {
          const rect = node.getBoundingClientRect();
          return rect.height >= 20 && rect.height <= 32;
        }),
        keepsGroupedClusterLabelsVisible: Array.from(document.querySelectorAll('.week-v2-calendar__event--grouped strong')).some((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 8 && rect.height > 8;
        }),
        avoidsExplodedDenseStack: document.querySelectorAll('.week-v2-calendar__event[title*="youtube.com"]').length <= 2,
        hasCategoryRail: /Category mix/i.test(document.body.textContent ?? '') && document.querySelector('.week-v2-side-card') !== null,
        hasRankedDays: /Ranked days/i.test(document.body.textContent ?? '') && document.querySelector('.week-v2-rank') !== null,
        hasFocusShare: /Focus share/i.test(document.body.textContent ?? ''),
        hasBestDay: /Best/i.test(document.body.textContent ?? ''),
        removedDailyLedger: !/Daily ledger/i.test(document.body.textContent ?? ''),
        hasTopSourcesThisWeek: /Top sources this week/i.test(document.body.textContent ?? '')
      })
    },
    {
      label: 'Classification',
      description: 'classification tab',
      check: () => ({
        hasSurface: document.querySelector('.classification-panel-view')?.getAttribute('aria-label') === 'Classification panel view',
        hasPanelGrid: document.querySelector('.classification-panel-view__grid') !== null,
        hasThreePanels: document.querySelectorAll('.classification-panel-view__panel').length >= 3,
        hasMacPanelHeaders: document.querySelectorAll('.classification-panel-view__panel-header .label-mono').length >= 3,
        hasCategoriesHeader: /Categories/i.test(document.querySelector('.classification-panel-view__panel[aria-label="Categories"]')?.textContent ?? ''),
        hasCategoryRows: document.querySelectorAll('.classification-panel-view__category-row').length > 0,
        hasSelectedCategory: document.querySelector('.classification-panel-view__category-row[data-selected="true"]') !== null,
        hasSourcesPanel: document.querySelector('.classification-panel-view__panel[aria-label="Apps and sites"]') !== null,
        hasSources: /Apps & Sites/i.test(document.body.textContent ?? ''),
        hasSourceRows: document.querySelectorAll('.classification-panel-view__source-row').length > 0,
        hasSelectedSource: document.querySelector('.classification-panel-view__source-row[data-selected="true"]') !== null,
        hasSourceProductivityDots: document.querySelectorAll('.classification-panel-view__source-productivity-dot').length > 0,
        hasDetailsPanel: document.querySelector('.classification-panel-view__panel--detail[aria-label="Activity details"]') !== null,
        hasDetails: /Activity details/i.test(document.body.textContent ?? ''),
        hasActivityRows: document.querySelectorAll('.classification-panel-view__activity-row').length > 0,
        hasActivityToggle: document.querySelector('.classification-panel-view__activity-toggle') !== null,
        hasActivityClassificationSummary: document.querySelector('.classification-panel-view__activity-classification') !== null,
        removedInsightCards: document.querySelector('.classification-panel-view__insight-card') === null,
        hasRangeControlClass: document.querySelector('.classification-range-control.seg') !== null,
        rangeControlIsCompact: (() => {
          const control = document.querySelector('.classification-range-control.seg');
          const button = document.querySelector('.classification-range-control.seg button');
          const controlRect = control?.getBoundingClientRect();
          const buttonRect = button?.getBoundingClientRect();
          return Boolean(controlRect && buttonRect && controlRect.height <= 44 && buttonRect.height <= 34);
        })(),
        hasTodayRange: Array.from(document.querySelectorAll('.classification-range-control button')).some((button) => button.textContent === 'Today'),
        hasWeekRange: Array.from(document.querySelectorAll('.classification-range-control button')).some((button) => button.textContent === 'Week'),
        hasTodaySelected: Array.from(document.querySelectorAll('.classification-range-control button')).some((button) => button.textContent === 'Today' && button.getAttribute('aria-pressed') === 'true'),
        hasCanonicalClassificationCss: (() => {
          const root = document.querySelector('.classification-panel-view');
          const categoryRow = document.querySelector('.classification-panel-view__category-row');
          const sourceRow = document.querySelector('.classification-panel-view__source-row');
          const bar = document.querySelector('.classification-panel-view__bar');
          const activitySummary = document.querySelector('.classification-panel-view__activity-summary, .classification-panel-view__activity-toggle');
          const grid = document.querySelector('.classification-panel-view__grid');
          if (!root || !categoryRow || !sourceRow || !bar || !activitySummary) return false;
          const rootStyle = getComputedStyle(root);
          const gridStyle = grid ? getComputedStyle(grid) : null;
          const categoryStyle = getComputedStyle(categoryRow);
          const sourceStyle = getComputedStyle(sourceRow);
          const barStyle = getComputedStyle(bar);
          const summaryStyle = getComputedStyle(activitySummary);
          return rootStyle.getPropertyValue('--classification-row-height').trim() === '48px'
            && rootStyle.height !== 'auto'
            && gridStyle?.height !== 'auto'
            && categoryStyle.minHeight === '48px'
            && categoryStyle.height === '48px'
            && categoryStyle.paddingTop === '5px'
            && categoryStyle.paddingRight === '8px'
            && sourceStyle.minHeight === '48px'
            && sourceStyle.height === '48px'
            && sourceStyle.paddingTop === '5px'
            && sourceStyle.paddingRight === '8px'
            && barStyle.height === '6px'
            && summaryStyle.minHeight === '48px';
        })()
      })
    },
    {
      label: 'History',
      description: 'history tab',
      check: () => ({
        hasSurface: document.querySelector('.history-tab-surface') !== null,
        hasHistoryList: document.querySelector('.history-list') !== null || document.querySelector('.history-toolbar') !== null || /No history found|Loading history/i.test(document.body.textContent ?? ''),
        hasHistoryIdentitySlot: document.querySelector('.history-row') === null || document.querySelector('.history-row__identity .site-favicon, .history-row__identity .app-glyph') !== null
      })
    },
    {
      label: 'Settings',
      description: 'settings tab',
      check: () => ({
        hasSurface: document.querySelector('.settings-tab-surface') !== null,
        hasGeneral: /General/i.test(document.body.textContent ?? ''),
        hasClassificationRules: /Classification rules/i.test(document.body.textContent ?? ''),
        hasDataExport: /Data & export/i.test(document.body.textContent ?? ''),
        hasRawHistoryCopy: /Raw tracking history is not published/i.test(document.body.textContent ?? '')
      })
    }
  ];

  for (const contract of tabContracts) {
    const clicked = await clickDashboardTab(page, contract.label);
	    if (!clicked) {
	      failures.push(`dashboard ${contract.description} tab button is missing`);
	      continue;
	    }

	    if (contract.label === 'Classification') {
	      await waitFor(async () => page.evaluate(() => document.querySelector('.classification-panel-view__activity-classification') !== null), 'classification activity classification summary');
	    }

	    const result = await page.evaluate(contract.check);
    for (const [key, passed] of Object.entries(result)) {
      if (!passed) failures.push(`dashboard ${contract.description} failed ${key}`);
    }

    if (evidenceDir && contract.label === 'Week') {
      await page.screenshot(join(evidenceDir, 'week-calendar.png'));
    }

    if (evidenceDir && contract.label === 'Classification') {
      await page.screenshot(join(evidenceDir, 'classification.png'));
    }
  }

  if (await clickDashboardTab(page, 'Classification')) {
    const stability = await measureClassificationCategoryStability(page);
    if (!stability.measured) {
      failures.push('dashboard classification category stability could not be measured');
    } else if (!stability.stable) {
      failures.push(`dashboard classification category selection moves layout: ${JSON.stringify(stability.maxDelta)}`);
    }

    const weekButtonRect = await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll('.classification-range-control button')).find((candidate) => candidate.textContent === 'Week');
      const rect = button?.getBoundingClientRect();
      return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
    });

    if (!weekButtonRect) {
      failures.push('dashboard classification range control missing Week button rect');
    } else {
      await page.clickAt(weekButtonRect.x, weekButtonRect.y);
      await waitFor(async () => page.evaluate(() => Array.from(document.querySelectorAll('.classification-range-control button')).some((button) => button.textContent === 'Week' && button.getAttribute('aria-pressed') === 'true')), 'classification Week range to become selected');
      const switched = await page.evaluate(() => ({
        hasWeekSelected: Array.from(document.querySelectorAll('.classification-range-control button')).some((button) => button.textContent === 'Week' && button.getAttribute('aria-pressed') === 'true'),
        hasWeekPanelGrid: document.querySelector('.classification-panel-view__grid') !== null,
        hasWeekActivityDetails: document.querySelectorAll('.classification-panel-view__activity-row').length > 0,
        hasWeeklySources: /docs\.example\.com|instagram\.com|shop\.example\.com/i.test(document.body.textContent ?? '')
      }));

      for (const [key, passed] of Object.entries(switched)) {
        if (!passed) failures.push(`dashboard classification Week range failed ${key}`);
      }
    }
  }

  return failures;
}

async function measureClassificationCategoryStability(page) {
  function delta(baseRect, nextRect) {
    return {
      left: Math.abs(baseRect.left - nextRect.left),
      top: Math.abs(baseRect.top - nextRect.top),
      width: Math.abs(baseRect.width - nextRect.width),
      height: Math.abs(baseRect.height - nextRect.height)
    };
  }

  function maxRectDelta(current, next) {
    return {
      left: Math.max(current.left, next.left),
      top: Math.max(current.top, next.top),
      width: Math.max(current.width, next.width),
      height: Math.max(current.height, next.height)
    };
  }

  const selectors = [
    '.classification-panel-view__grid',
    '.classification-panel-view__panel[aria-label="Categories"]',
    '.classification-panel-view__panel[aria-label="Apps and sites"]',
    '.classification-panel-view__panel[aria-label="Activity details"]',
    '.classification-panel-view__category-row:first-child',
    '.classification-panel-view__source-row:first-child'
  ];

  const base = await page.evaluate((items) => {
    const rects = {};
    for (const selector of items) {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      if (!rect) return null;
      rects[selector] = {
        left: Number(rect.left.toFixed(2)),
        top: Number(rect.top.toFixed(2)),
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2))
      };
    }
    return {
      rects,
      categoryCount: document.querySelectorAll('.classification-panel-view__category-row').length
    };
  }, selectors);

  if (!base || base.categoryCount < 2) return { measured: false, stable: false, maxDelta: null };

  let maxDelta = { left: 0, top: 0, width: 0, height: 0 };
  const clickCount = Math.min(base.categoryCount, 5);
  for (let index = 0; index < clickCount; index += 1) {
    const rowRect = await page.evaluate((rowIndex) => {
      const row = document.querySelectorAll('.classification-panel-view__category-row')[rowIndex];
      const rect = row?.getBoundingClientRect();
      return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
    }, index);

    if (!rowRect) return { measured: false, stable: false, maxDelta: null };
    await page.clickAt(rowRect.x, rowRect.y);
    await waitFor(async () => page.evaluate((rowIndex) => document.querySelectorAll('.classification-panel-view__category-row')[rowIndex]?.getAttribute('data-selected') === 'true', index), `classification category ${index} to become selected`);

    const next = await page.evaluate((items) => {
      const rects = {};
      for (const selector of items) {
        const rect = document.querySelector(selector)?.getBoundingClientRect();
        if (!rect) return null;
        rects[selector] = {
          left: Number(rect.left.toFixed(2)),
          top: Number(rect.top.toFixed(2)),
          width: Number(rect.width.toFixed(2)),
          height: Number(rect.height.toFixed(2))
        };
      }
      return rects;
    }, selectors);

    if (!next) return { measured: false, stable: false, maxDelta: null };
    for (const selector of selectors) {
      maxDelta = maxRectDelta(maxDelta, delta(base.rects[selector], next[selector]));
    }
  }

  const firstRowRect = await page.evaluate(() => {
    const row = document.querySelector('.classification-panel-view__category-row');
    const rect = row?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  });
  if (firstRowRect) {
    await page.clickAt(firstRowRect.x, firstRowRect.y);
    await waitFor(async () => page.evaluate(() => document.querySelector('.classification-panel-view__category-row')?.getAttribute('data-selected') === 'true'), 'classification first category to be restored');
  }

  const tolerance = 0.75;
  return {
    measured: true,
    stable: maxDelta.left <= tolerance && maxDelta.top <= tolerance && maxDelta.width <= tolerance && maxDelta.height <= tolerance,
    maxDelta
  };
}

async function seedRuntimeSessions(page, sessions) {
  await page.evaluate(async ({ dbName, dbVersion, sessionStore, visitStore, activeSessionKey, seededSessions }) => {
    function openRuntimeDb() {
      return new Promise((resolveOpen, rejectOpen) => {
        const request = indexedDB.open(dbName, dbVersion);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(sessionStore)) {
            const sessions = db.createObjectStore(sessionStore, { keyPath: 'id' });
            sessions.createIndex('date', 'date', { unique: false });
            sessions.createIndex('domain', 'domain', { unique: false });
            sessions.createIndex('category', 'category', { unique: false });
            sessions.createIndex('startTime', 'startTime', { unique: false });
          }
          if (!db.objectStoreNames.contains(visitStore)) {
            const visits = db.createObjectStore(visitStore, { keyPath: 'id' });
            visits.createIndex('date', 'date', { unique: false });
            visits.createIndex('domain', 'domain', { unique: false });
            visits.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
        request.onsuccess = () => resolveOpen(request.result);
        request.onerror = () => rejectOpen(request.error ?? new Error('Failed to open runtime DB'));
      });
    }

    function clearStore(db, storeName) {
      return new Promise((resolveClear, rejectClear) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        store.clear();
        transaction.oncomplete = () => resolveClear(undefined);
        transaction.onerror = () => rejectClear(transaction.error ?? new Error(`Failed to clear ${storeName}`));
      });
    }

    function writeSessions(db) {
      return new Promise((resolveWrite, rejectWrite) => {
        const transaction = db.transaction([sessionStore, visitStore], 'readwrite');
        const sessionObjectStore = transaction.objectStore(sessionStore);
        const visitObjectStore = transaction.objectStore(visitStore);
        for (const session of seededSessions) {
          sessionObjectStore.put(session);
          for (const visit of session.visits ?? []) visitObjectStore.put(visit);
        }
        transaction.oncomplete = () => resolveWrite(undefined);
        transaction.onerror = () => rejectWrite(transaction.error ?? new Error('Failed to seed runtime sessions'));
      });
    }

    const db = await openRuntimeDb();
    await Promise.all([clearStore(db, sessionStore), clearStore(db, visitStore)]);
    await writeSessions(db);
    await chrome.storage.local.remove(activeSessionKey);
  }, {
    dbName: runtimeDbName,
    dbVersion: runtimeDbVersion,
    sessionStore: runtimeSessionStore,
    visitStore: runtimeVisitStore,
    activeSessionKey: 'driftyActiveSession',
    seededSessions: sessions
  });
}

async function verifyPopup(port, extensionId) {
  const popupUrl = `chrome-extension://${extensionId}/popup/index.html`;
  const target = await createPage(port);
  const page = new CdpPage(target);
  await page.connect();
  await page.setViewport(popupViewport);
  await page.navigate(popupUrl);

  await waitFor(async () => {
    return page.evaluate(() => document.querySelector('.surface--popup') !== null);
  }, 'popup React surface');

  const layout = await page.evaluate((height) => {
    const surface = document.querySelector('.surface--popup');
    const shell = document.querySelector('.popup-shell');
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => /open dashboard/i.test(candidate.textContent ?? ''));
    const buttonRect = button?.getBoundingClientRect();
    const centerX = buttonRect ? buttonRect.left + buttonRect.width / 2 : 0;
    const centerY = buttonRect ? buttonRect.top + buttonRect.height / 2 : 0;
    const hitTarget = buttonRect ? document.elementFromPoint(centerX, centerY) : null;
    const bodyText = document.body.textContent ?? '';
    const categoryRowCount = document.querySelectorAll('.popup-categories-card .popup-compact-row').length;
    const topSiteRowCount = document.querySelectorAll('.popup-top-sites-card .popup-compact-row').length;
    const shellStyle = shell ? getComputedStyle(shell) : null;

    return {
      hasPopupSurface: Boolean(surface),
      hasDashboardButton: Boolean(button),
      hasGenericCopy: /Quick local snapshot|Saved locally|Runtime connected/.test(bodyText),
      usesDriftyShellCopy: /Your browser time|Drifty dashboard|Focus|Drift/.test(bodyText),
      hasLegacyPopupTodayCard: document.querySelector('.popup-today-card') !== null && /Today/i.test(bodyText),
      hasLegacyPopupCurrentSite: document.querySelector('.popup-current-site-card') !== null && /Current site/i.test(bodyText),
      hasLegacyPopupCategories: document.querySelector('.popup-categories-card') !== null && /Categories/i.test(bodyText),
      hasLegacyPopupTopSites: document.querySelector('.popup-top-sites-card') !== null && /Top Sites/i.test(bodyText),
      buttonRect: buttonRect ? {
        top: Number(buttonRect.top.toFixed(2)),
        right: Number(buttonRect.right.toFixed(2)),
        bottom: Number(buttonRect.bottom.toFixed(2)),
        left: Number(buttonRect.left.toFixed(2)),
        width: Number(buttonRect.width.toFixed(2)),
        height: Number(buttonRect.height.toFixed(2))
      } : null,
      buttonVisibleInViewport: Boolean(buttonRect && buttonRect.top >= 0 && buttonRect.bottom <= height),
      buttonHasSafeBottomPadding: Boolean(buttonRect && buttonRect.bottom <= height - 8),
      buttonInFinalArea: Boolean(buttonRect && buttonRect.top >= height - 72 && buttonRect.bottom <= height - 8),
      buttonClickable: Boolean(button && (hitTarget === button || button.contains(hitTarget))),
      surfaceClientHeight: surface?.clientHeight ?? 0,
      surfaceScrollHeight: surface?.scrollHeight ?? 0,
      surfaceFitsViewport: Boolean(surface && surface.scrollHeight <= surface.clientHeight),
      shellClientHeight: shell?.clientHeight ?? 0,
      shellScrollHeight: shell?.scrollHeight ?? 0,
      shellFitsViewport: Boolean(shell && shell.scrollHeight <= shell.clientHeight),
      documentScrollHeight: document.documentElement.scrollHeight,
      bodyScrollHeight: document.body.scrollHeight,
      documentFitsViewport: document.documentElement.scrollHeight <= height && document.body.scrollHeight <= height,
      categoryRowCount,
      topSiteRowCount,
      hasCompactCategoryRows: categoryRowCount <= 3,
      hasCompactTopSiteRows: topSiteRowCount <= 2,
      popupShellBackground: shellStyle ? {
        backgroundColor: shellStyle.backgroundColor,
        backgroundImage: shellStyle.backgroundImage
      } : null,
      popupShellUsesTokenSurface: Boolean(
        shellStyle
          && shellStyle.backgroundImage === 'none'
          && shellStyle.backgroundColor !== 'rgb(255, 255, 255)'
          && shellStyle.backgroundColor !== 'rgba(0, 0, 0, 0)'
      )
    };
  }, popupViewport.height);

  const failures = collectPopupAssertions(layout);

  if (evidenceDir) {
    await page.screenshot(join(evidenceDir, 'popup.png'));
  }

  if (failures.length === 0 && layout.buttonRect) {
    await page.clickAt(layout.buttonRect.left + layout.buttonRect.width / 2, layout.buttonRect.top + layout.buttonRect.height / 2);
    await waitFor(async () => {
      const targets = await listTargets(port);
      return targets.some((candidate) => candidate.url === `chrome-extension://${extensionId}/dashboard/index.html`);
    }, 'Open dashboard button to create dashboard tab');
  }

  page.close();
  return { layout, failures };
}

async function verifyDashboard(port, extensionId) {
  const dashboardUrl = `chrome-extension://${extensionId}/dashboard/index.html`;
  const target = await createPage(port);
  const page = new CdpPage(target);
  await page.connect();
  await page.setViewport(dashboardViewport);
  await page.navigate(dashboardUrl);
  await seedRuntimeSessions(page, seededDashboardSessions());
  await page.navigate(dashboardUrl);

  await waitFor(async () => {
    return page.evaluate(() => document.querySelector('.shell') !== null);
  }, 'dashboard React shell');

  await waitFor(async () => {
    return page.evaluate(() => document.querySelector('.flow-chart-card') !== null);
  }, 'seeded dashboard flow chart');

  const layout = await page.evaluate((width) => {
    const shell = document.querySelector('.shell');
    const sidebar = document.querySelector('.sidebar');
    const flowChart = document.querySelector('.flow-chart-card');
	    const shellRect = shell?.getBoundingClientRect();
	    const sidebarRect = sidebar?.getBoundingClientRect();
	    const bodyText = document.body.textContent ?? '';
	    const dateNavigator = document.querySelector('.dashboard-date-nav');
	    const dateNavigatorRect = dateNavigator?.getBoundingClientRect();
	    const dateNavigatorButton = document.querySelector('.dashboard-date-nav button');
	    const dateNavigatorButtonRect = dateNavigatorButton?.getBoundingClientRect();

	    return {
      hasShell: Boolean(shell),
      hasMacStyleDashboardCopy: /Your Day|Your Week|Classification|History|Settings|Today so far/.test(bodyText),
      hasLocalPrivacyCopy: /Raw sites, titles, and sessions stay in this browser|local browser storage|kept local/i.test(bodyText),
      hasLeaderboardCopy: /leaderboard|ranking|public profile|profile/i.test(bodyText),
	      sidebarVisible: Boolean(sidebarRect && sidebarRect.top >= 0 && sidebarRect.width > 0),
	      shellWidth: shellRect ? Number(shellRect.width.toFixed(2)) : 0,
	      dashboardWithinViewport: Boolean(shellRect && shellRect.width <= width),
	      documentScrollWidth: document.documentElement.scrollWidth,
	      bodyScrollWidth: document.body.scrollWidth,
	      documentNoHorizontalOverflow: document.documentElement.scrollWidth <= width && document.body.scrollWidth <= width,
	      hasMacDateNavigator: dateNavigator !== null,
	      dateNavigatorCss: dateNavigatorRect ? {
	        height: Number(dateNavigatorRect.height.toFixed(2)),
	        buttonHeight: dateNavigatorButtonRect ? Number(dateNavigatorButtonRect.height.toFixed(2)) : 0
	      } : null,
	      dateNavigatorIsCompact: Boolean(dateNavigatorRect && dateNavigatorButtonRect && dateNavigatorRect.height <= 40 && dateNavigatorButtonRect.height <= 32),
	      hasFlowBreakdownLayout: document.querySelector('.flow-breakdown-layout') !== null,
      hasFlowBreakdownChart: document.querySelector('.flow-breakdown-layout__chart') !== null,
      hasFlowChartCard: flowChart !== null,
      flowInterval: flowChart?.getAttribute('data-flow-interval') ?? null,
      hourAxisCellCount: Math.max(0, document.querySelectorAll('.flow-chart-hours > span').length - 1),
      flowRowCount: document.querySelectorAll('.flow-chart-row').length,
      hasLegendGroups: ['Focus', 'Neutral', 'Drift'].every((label) => Array.from(document.querySelectorAll('.flow-chart-legend__parent')).some((node) => node.textContent === label)),
      hasDocsCell: Array.from(document.querySelectorAll('.flow-cell')).some((node) => /docs\.example\.com/i.test(node.getAttribute('aria-label') ?? '')),
      hasBoundaryCell: Array.from(document.querySelectorAll('.flow-cell')).some((node) => /boundary\.example\.com/i.test(node.getAttribute('aria-label') ?? '')),
      hasPostMidnightCell: Array.from(document.querySelectorAll('.flow-cell')).some((node) => /night\.example\.com/i.test(node.getAttribute('aria-label') ?? '')),
      hasPreviousDateBoundaryCell: Array.from(document.querySelectorAll('.flow-cell')).some((node) => /early\.example\.com/i.test(node.getAttribute('aria-label') ?? '')),
      hasDedupedMidnightSpanCell: Array.from(document.querySelectorAll('.flow-cell')).some((node) => /midnight\.example\.com/i.test(node.getAttribute('aria-label') ?? '') && /Duration: 3m/.test(node.getAttribute('aria-label') ?? '')),
      localTimeValue: Array.from(document.querySelectorAll('.metric')).find((node) => /Local time/i.test(node.textContent ?? ''))?.querySelector('.measure')?.textContent ?? null,
      hasClippedLogicalDayTotal: Array.from(document.querySelectorAll('.metric')).find((node) => /Local time/i.test(node.textContent ?? ''))?.querySelector('.measure')?.textContent === '58m',
      hasShoppingDriftCell: Array.from(document.querySelectorAll('.flow-cell')).some((node) => /shop\.example\.com/i.test(node.getAttribute('aria-label') ?? '') && /Drift/i.test(node.getAttribute('aria-label') ?? '')),
      hasCompactSplitChart: document.querySelector('.flow-compact-split-chart') !== null,
      hasCurrentMarker: document.querySelector('.flow-chart-hour--now') !== null && document.querySelector('.flow-chart-row--now') !== null,
      hasCanonicalFlowCopy: /3-minute cells show the dominant app or site in each block; tracked totals live in Time breakdown\./.test(document.querySelector('.flow-chart-copy')?.textContent ?? ''),
      hasCanonicalSocialMediaLabel: document.body.textContent?.includes('Social media') === true && document.body.textContent?.includes('Social Media') !== true,
      glyphFallbackCss: (() => {
        const glyph = document.createElement('div');
        glyph.className = 'app-glyph app-glyph--sm';
        glyph.style.position = 'fixed';
        glyph.style.left = '-9999px';
        const fallback = document.createElement('div');
        fallback.className = 'site-favicon site-favicon--fallback';
        fallback.style.position = 'fixed';
        fallback.style.left = '-9999px';
        const appIcon = document.createElement('img');
        appIcon.className = 'app-icon app-icon--sm';
        appIcon.style.position = 'fixed';
        appIcon.style.left = '-9999px';
        document.body.append(glyph, fallback, appIcon);
        const glyphStyle = getComputedStyle(glyph);
        const fallbackStyle = getComputedStyle(fallback);
        const appIconStyle = getComputedStyle(appIcon);
        const glyphRect = glyph.getBoundingClientRect();
        const fallbackRect = fallback.getBoundingClientRect();
        const appIconRect = appIcon.getBoundingClientRect();
        const result = {
          glyphDisplay: glyphStyle.display,
          glyphWidth: Math.round(glyphRect.width),
          glyphHeight: Math.round(glyphRect.height),
          glyphBorder: glyphStyle.borderTopWidth,
          glyphRadius: glyphStyle.borderRadius,
          glyphColor: glyphStyle.color,
          glyphFontFamily: glyphStyle.fontFamily,
          fallbackDisplay: fallbackStyle.display,
          fallbackWidth: Math.round(fallbackRect.width),
          fallbackHeight: Math.round(fallbackRect.height),
          fallbackBorder: fallbackStyle.borderTopWidth,
          fallbackRadius: fallbackStyle.borderRadius,
          fallbackColor: fallbackStyle.color,
          fallbackFontFamily: fallbackStyle.fontFamily,
          appIconWidth: Math.round(appIconRect.width),
          appIconHeight: Math.round(appIconRect.height),
          appIconRadius: appIconStyle.borderRadius
        };
        glyph.remove();
        fallback.remove();
        appIcon.remove();
        return result;
      })(),
      hasCanonicalGlyphFallbackCss: (() => {
        const glyph = document.createElement('div');
        glyph.className = 'app-glyph app-glyph--sm';
        glyph.style.position = 'fixed';
        glyph.style.left = '-9999px';
        const fallback = document.createElement('div');
        fallback.className = 'site-favicon site-favicon--fallback';
        fallback.style.position = 'fixed';
        fallback.style.left = '-9999px';
        const appIcon = document.createElement('img');
        appIcon.className = 'app-icon app-icon--sm';
        appIcon.style.position = 'fixed';
        appIcon.style.left = '-9999px';
        document.body.append(glyph, fallback, appIcon);
        const glyphStyle = getComputedStyle(glyph);
        const fallbackStyle = getComputedStyle(fallback);
        const appIconStyle = getComputedStyle(appIcon);
        const glyphRect = glyph.getBoundingClientRect();
        const fallbackRect = fallback.getBoundingClientRect();
        const appIconRect = appIcon.getBoundingClientRect();
        const matches = glyphStyle.display === 'flex'
          && Math.round(glyphRect.width) === 28
          && Math.round(glyphRect.height) === 28
          && glyphStyle.borderTopWidth === '0px'
          && glyphStyle.borderRadius === '12px'
          && glyphStyle.color === 'rgb(28, 28, 25)'
          && !/SF Mono|ui-monospace|Fira Code|monospace/i.test(glyphStyle.fontFamily)
          && fallbackStyle.display === 'flex'
          && Math.round(fallbackRect.width) === 24
          && Math.round(fallbackRect.height) === 24
          && fallbackStyle.borderTopWidth === '0px'
          && fallbackStyle.borderRadius === '12px'
          && fallbackStyle.color === 'rgb(28, 28, 25)'
          && !/SF Mono|ui-monospace|Fira Code|monospace/i.test(fallbackStyle.fontFamily)
          && Math.round(appIconRect.width) === 28
          && Math.round(appIconRect.height) === 28
          && appIconStyle.borderRadius === '12px';
        glyph.remove();
        fallback.remove();
        appIcon.remove();
        return matches;
      })(),
      siteLineCss: (() => {
        const siteLine = document.createElement('span');
        siteLine.className = 'segment-site-pill flow-hover-card__site';
        siteLine.style.position = 'fixed';
        siteLine.style.left = '-9999px';
        const favicon = document.createElement('img');
        favicon.className = 'site-favicon';
        favicon.style.setProperty('--identity-icon-size', '14px');
        siteLine.append(favicon, 'docs.example.com');
        document.body.append(siteLine);
        const siteLineStyle = getComputedStyle(siteLine);
        const faviconStyle = getComputedStyle(favicon);
        const faviconRect = favicon.getBoundingClientRect();
        const result = {
          faviconWidth: Math.round(faviconRect.width),
          faviconHeight: Math.round(faviconRect.height),
          faviconDisplay: faviconStyle.display,
          faviconRadius: faviconStyle.borderRadius,
          faviconBorder: faviconStyle.borderTopWidth,
          faviconBackground: faviconStyle.backgroundColor,
          siteLineBorder: siteLineStyle.borderTopWidth,
          siteLineBackground: siteLineStyle.backgroundColor
        };
        siteLine.remove();
        return result;
      })(),
      hasCanonicalSiteLineCss: (() => {
        const siteLine = document.createElement('span');
        siteLine.className = 'segment-site-pill flow-hover-card__site';
        siteLine.style.position = 'fixed';
        siteLine.style.left = '-9999px';
        const favicon = document.createElement('img');
        favicon.className = 'site-favicon';
        favicon.style.setProperty('--identity-icon-size', '14px');
        siteLine.append(favicon, 'docs.example.com');
        document.body.append(siteLine);
        const siteLineStyle = getComputedStyle(siteLine);
        const faviconStyle = getComputedStyle(favicon);
        const faviconRect = favicon.getBoundingClientRect();
        const matches = Math.round(faviconRect.width) === 14
          && Math.round(faviconRect.height) === 14
          && faviconStyle.display === 'block'
          && faviconStyle.borderRadius === '12px'
          && faviconStyle.borderTopWidth === '0px'
          && faviconStyle.backgroundColor === 'rgba(0, 0, 0, 0)'
          && siteLineStyle.borderTopWidth === '0px'
          && siteLineStyle.backgroundColor === 'rgba(0, 0, 0, 0)';
        siteLine.remove();
        return matches;
      })(),
      compactProductivityOrder: Array.from(document.querySelectorAll('.flow-compact-split-chart__panel--circle .flow-compact-split-chart__legend-label')).map((node) => node.textContent ?? ''),
      hasCanonicalProductivityOrder: Array.from(document.querySelectorAll('.flow-compact-split-chart__panel--circle .flow-compact-split-chart__legend-label')).map((node) => node.textContent ?? '').join('|') === 'Focus|Drift|Neutral',
      firstHourLabel: document.querySelectorAll('.flow-chart-hours > span')[1]?.textContent ?? null,
      hasCanonicalStartOfDayAxis: document.querySelectorAll('.flow-chart-hours > span')[1]?.textContent === '4am',
      hasCanonicalCellAriaTime: Array.from(document.querySelectorAll('.flow-cell')).some((node) => /docs\.example\.com/i.test(node.getAttribute('aria-label') ?? '') && /Time block: \d{2}:\d{2}–\d{2}:\d{2}/.test(node.getAttribute('aria-label') ?? '') && !/Time block: \d{2}:\d{2}-\d{2}:\d{2}/.test(node.getAttribute('aria-label') ?? '')),
      flowCss: (() => {
        const chart = document.querySelector('.flow-breakdown-layout__chart');
        const panel = document.querySelector('.flow-compact-split-chart__panel');
        const circle = document.querySelector('.flow-compact-productivity-circle');
        const dial = document.querySelector('.flow-compact-productivity-circle__dial');
        const bar = document.querySelector('.flow-compact-split-chart__bar');
        const legendItem = document.querySelector('.flow-compact-split-chart__legend-item');
        const layout = document.querySelector('.flow-breakdown-layout');
        const compactHeadLabel = document.querySelector('.flow-compact-split-chart__head .label-mono');
        const compactHeadStrong = document.querySelector('.flow-compact-split-chart__head strong');
        const flowChartLabel = document.querySelector('.flow-chart-head .label-mono');
        const intervalControl = document.querySelector('.flow-interval-control.seg');
        const intervalButton = document.querySelector('.flow-interval-control.seg button');
        const selectedIntervalButton = document.querySelector('.flow-interval-control.seg button.on');
        const currentHour = document.querySelector('.flow-chart-hour--now');
        const currentRowLabel = document.querySelector('.flow-chart-row--time-label .flow-chart-row-label');
        const workspaceDot = document.querySelector('.flow-chart-legend__dot--workspace');
        const legendParent = document.querySelector('.flow-chart-legend__parent');
        const compactBarSegment = document.querySelector('.flow-compact-split-chart__segment');
        const firstFlowCell = document.querySelector('.flow-breakdown-layout__chart .flow-cell');
        const chartStyle = chart ? getComputedStyle(chart) : null;
        const panelStyle = panel ? getComputedStyle(panel) : null;
        const circleStyle = circle ? getComputedStyle(circle) : null;
        const dialStyle = dial ? getComputedStyle(dial) : null;
        const barStyle = bar ? getComputedStyle(bar) : null;
        const legendItemStyle = legendItem ? getComputedStyle(legendItem) : null;
        const layoutStyle = layout ? getComputedStyle(layout) : null;
        const compactHeadLabelStyle = compactHeadLabel ? getComputedStyle(compactHeadLabel) : null;
        const compactHeadStrongStyle = compactHeadStrong ? getComputedStyle(compactHeadStrong) : null;
        const flowChartLabelStyle = flowChartLabel ? getComputedStyle(flowChartLabel) : null;
        const intervalControlStyle = intervalControl ? getComputedStyle(intervalControl) : null;
        const intervalButtonStyle = intervalButton ? getComputedStyle(intervalButton) : null;
        const selectedIntervalButtonStyle = selectedIntervalButton ? getComputedStyle(selectedIntervalButton) : null;
        const currentHourStyle = currentHour ? getComputedStyle(currentHour) : null;
        const currentRowLabelStyle = currentRowLabel ? getComputedStyle(currentRowLabel) : null;
        const workspaceDotStyle = workspaceDot ? getComputedStyle(workspaceDot) : null;
        const legendParentStyle = legendParent ? getComputedStyle(legendParent) : null;
        const compactBarSegmentStyle = compactBarSegment ? getComputedStyle(compactBarSegment) : null;
        const firstFlowCellStyle = firstFlowCell ? getComputedStyle(firstFlowCell) : null;
        const workspaceDotRect = workspaceDot?.getBoundingClientRect();
        const legendParentRect = legendParent?.getBoundingClientRect();
        const compactBarRect = bar?.getBoundingClientRect();
        const compactBarSegmentRect = compactBarSegment?.getBoundingClientRect();
        const firstFlowCellRect = firstFlowCell?.getBoundingClientRect();
        const stylesheetText = Array.from(document.styleSheets)
          .flatMap((sheet) => {
            try {
              return Array.from(sheet.cssRules ?? [], (rule) => rule.cssText);
            } catch {
              return [];
            }
          })
          .join('\n');
        return {
          layoutGap: layoutStyle?.gap ?? null,
          layoutMarginBottom: layoutStyle?.marginBottom ?? null,
          chartPadding: chartStyle ? `${chartStyle.paddingTop} ${chartStyle.paddingRight} ${chartStyle.paddingBottom} ${chartStyle.paddingLeft}` : null,
          panelGap: panelStyle?.gap ?? null,
          panelPadding: panelStyle ? `${panelStyle.paddingTop} ${panelStyle.paddingRight} ${panelStyle.paddingBottom} ${panelStyle.paddingLeft}` : null,
          compactHeadLabelLetterSpacing: compactHeadLabelStyle?.letterSpacing ?? null,
          compactHeadStrongLetterSpacing: compactHeadStrongStyle?.letterSpacing ?? null,
          flowChartLabelColor: flowChartLabelStyle?.color ?? null,
          intervalControlGap: intervalControlStyle?.gap ?? null,
          intervalControlPadding: intervalControlStyle ? `${intervalControlStyle.paddingTop} ${intervalControlStyle.paddingRight} ${intervalControlStyle.paddingBottom} ${intervalControlStyle.paddingLeft}` : null,
          intervalControlRadius: intervalControlStyle?.borderRadius ?? null,
          intervalButtonPadding: intervalButtonStyle ? `${intervalButtonStyle.paddingTop} ${intervalButtonStyle.paddingRight} ${intervalButtonStyle.paddingBottom} ${intervalButtonStyle.paddingLeft}` : null,
          intervalButtonRadius: intervalButtonStyle?.borderRadius ?? null,
          intervalButtonFontSize: intervalButtonStyle?.fontSize ?? null,
          intervalButtonLetterSpacing: intervalButtonStyle?.letterSpacing ?? null,
          intervalButtonMinHeight: intervalButtonStyle?.minHeight ?? null,
          intervalButtonMinWidth: intervalButtonStyle?.minWidth ?? null,
          selectedIntervalBackground: selectedIntervalButtonStyle?.backgroundColor ?? null,
          selectedIntervalColor: selectedIntervalButtonStyle?.color ?? null,
          currentHourColor: currentHourStyle?.color ?? null,
          currentRowLabelColor: currentRowLabelStyle?.color ?? null,
          circleGap: circleStyle?.gap ?? null,
          circleTransform: circleStyle?.transform ?? null,
          dialBoxShadow: dialStyle?.boxShadow ?? null,
          barRadius: barStyle?.borderRadius ?? null,
          compactBarHeight: barStyle?.height ?? null,
          compactBarOverflowX: barStyle?.overflowX ?? null,
          compactBarRect: compactBarRect ? { width: compactBarRect.width, height: compactBarRect.height } : null,
          compactBarSegmentMinWidth: compactBarSegmentStyle?.minWidth ?? null,
          compactBarSegmentCursor: compactBarSegmentStyle?.cursor ?? null,
          compactBarSegmentRect: compactBarSegmentRect ? { width: compactBarSegmentRect.width, height: compactBarSegmentRect.height } : null,
          barBoxShadow: barStyle?.boxShadow ?? null,
          legendGap: legendItemStyle?.gap ?? null,
          legendParentMinHeight: legendParentStyle?.minHeight ?? null,
          legendParentRect: legendParentRect ? { width: legendParentRect.width, height: legendParentRect.height } : null,
          workspaceLegendDotWidth: workspaceDotStyle?.width ?? null,
          workspaceLegendDotHeight: workspaceDotStyle?.height ?? null,
          workspaceLegendDotRect: workspaceDotRect ? { width: workspaceDotRect.width, height: workspaceDotRect.height } : null,
          firstBreakdownCellMinHeight: firstFlowCellStyle?.minHeight ?? null,
          firstBreakdownCellRect: firstFlowCellRect ? { width: firstFlowCellRect.width, height: firstFlowCellRect.height } : null,
          hasMacFlowColumnRule: /\.flow-chart-hours,\s*\.flow-chart-row\s*\{[\s\S]*grid-template-columns:\s*var\(--flow-axis-gutter\) repeat\(24,\s*minmax\(1\.55rem,\s*1fr\)\)/.test(stylesheetText),
          hasMacFlowCellHeightRule: /\.flow-cell\s*\{[\s\S]*min-height:\s*var\(--flow-cell-min-height\)/.test(stylesheetText),
          hasMacBreakdownCellHeightRule: /\.flow-breakdown-layout__chart \.flow-cell\s*\{\s*min-height:\s*var\(--flow-breakdown-cell-min-height\)/.test(stylesheetText),
          hasMacFlowGridOverflowRule: /\.flow-chart-grid\s*\{[\s\S]*overflow-x:\s*auto/.test(stylesheetText)
        };
      })(),
      hasCanonicalFlowCss: (() => {
        const chart = document.querySelector('.flow-breakdown-layout__chart');
        const panel = document.querySelector('.flow-compact-split-chart__panel');
        const circle = document.querySelector('.flow-compact-productivity-circle');
        const dial = document.querySelector('.flow-compact-productivity-circle__dial');
        const bar = document.querySelector('.flow-compact-split-chart__bar');
        const legendItem = document.querySelector('.flow-compact-split-chart__legend-item');
        const layout = document.querySelector('.flow-breakdown-layout');
        const compactHeadLabel = document.querySelector('.flow-compact-split-chart__head .label-mono');
        const compactHeadStrong = document.querySelector('.flow-compact-split-chart__head strong');
        const flowChartLabel = document.querySelector('.flow-chart-head .label-mono');
        const intervalControl = document.querySelector('.flow-interval-control.seg');
        const intervalButton = document.querySelector('.flow-interval-control.seg button');
        const selectedIntervalButton = document.querySelector('.flow-interval-control.seg button.on');
        const currentHour = document.querySelector('.flow-chart-hour--now');
        const currentRowLabel = document.querySelector('.flow-chart-row--time-label .flow-chart-row-label');
        const workspaceDot = document.querySelector('.flow-chart-legend__dot--workspace');
        const legendParent = document.querySelector('.flow-chart-legend__parent');
        const compactBarSegment = document.querySelector('.flow-compact-split-chart__segment');
        const firstFlowCell = document.querySelector('.flow-breakdown-layout__chart .flow-cell');
        const chartStyle = chart ? getComputedStyle(chart) : null;
        const panelStyle = panel ? getComputedStyle(panel) : null;
        const circleStyle = circle ? getComputedStyle(circle) : null;
        const dialStyle = dial ? getComputedStyle(dial) : null;
        const barStyle = bar ? getComputedStyle(bar) : null;
        const legendItemStyle = legendItem ? getComputedStyle(legendItem) : null;
        const layoutStyle = layout ? getComputedStyle(layout) : null;
        const compactHeadLabelStyle = compactHeadLabel ? getComputedStyle(compactHeadLabel) : null;
        const compactHeadStrongStyle = compactHeadStrong ? getComputedStyle(compactHeadStrong) : null;
        const flowChartLabelStyle = flowChartLabel ? getComputedStyle(flowChartLabel) : null;
        const intervalControlStyle = intervalControl ? getComputedStyle(intervalControl) : null;
        const intervalButtonStyle = intervalButton ? getComputedStyle(intervalButton) : null;
        const selectedIntervalButtonStyle = selectedIntervalButton ? getComputedStyle(selectedIntervalButton) : null;
        const currentHourStyle = currentHour ? getComputedStyle(currentHour) : null;
        const currentRowLabelStyle = currentRowLabel ? getComputedStyle(currentRowLabel) : null;
        const workspaceDotStyle = workspaceDot ? getComputedStyle(workspaceDot) : null;
        const legendParentStyle = legendParent ? getComputedStyle(legendParent) : null;
        const compactBarSegmentStyle = compactBarSegment ? getComputedStyle(compactBarSegment) : null;
        const firstFlowCellStyle = firstFlowCell ? getComputedStyle(firstFlowCell) : null;
        const workspaceDotRect = workspaceDot?.getBoundingClientRect();
        const legendParentRect = legendParent?.getBoundingClientRect();
        const compactBarRect = bar?.getBoundingClientRect();
        const compactBarSegmentRect = compactBarSegment?.getBoundingClientRect();
        const firstFlowCellRect = firstFlowCell?.getBoundingClientRect();
        const stylesheetText = Array.from(document.styleSheets)
          .flatMap((sheet) => {
            try {
              return Array.from(sheet.cssRules ?? [], (rule) => rule.cssText);
            } catch {
              return [];
            }
          })
          .join('\n');
        const canonicalCurrentColor = 'color(srgb 0.981961 0.981961 0.974745)';
        const canonicalTextSoftColor = 'rgb(121, 119, 111)';
        const canonicalTextColor = 'rgb(28, 28, 25)';
        const canonicalCanvasColor = 'rgb(242, 241, 237)';
        return layoutStyle?.gap === '8px'
          && layoutStyle.marginBottom === '10px'
          && chartStyle?.paddingTop === '7px'
          && chartStyle.paddingRight === '8px'
          && chartStyle.paddingBottom === '9px'
          && chartStyle.paddingLeft === '8px'
          && panelStyle?.gap === '5px'
          && panelStyle.paddingTop === '7.04px'
          && panelStyle.paddingRight === '10.24px'
          && panelStyle.paddingBottom === '7.04px'
          && panelStyle.paddingLeft === '10.24px'
          && circleStyle?.gap === '9.92px'
          && circleStyle.transform !== 'none'
          && /color\(srgb 1 1 1 \/ 0\.14\)/.test(dialStyle?.boxShadow ?? '')
          && barStyle?.borderRadius === '5.44px'
          && Math.abs(parseFloat(barStyle.height) - 14.592) < 0.1
          && barStyle.overflowX === 'hidden'
          && compactBarSegmentStyle?.minWidth === '0px'
          && compactBarSegmentStyle.cursor === 'default'
          && compactBarRect
          && compactBarRect.height < 16
          && compactBarSegmentRect
          && compactBarSegmentRect.height < 16
          && /color\(srgb 1 1 1 \/ 0\.12\)/.test(barStyle?.boxShadow ?? '')
          && legendItemStyle?.gap === '5.44px'
          && legendParentStyle?.minHeight === 'auto'
          && legendParentRect
          && legendParentRect.height < 21
          && compactHeadLabelStyle?.letterSpacing === '1.17px'
          && compactHeadStrongStyle?.letterSpacing === 'normal'
          && flowChartLabelStyle?.color === canonicalTextSoftColor
          && intervalControlStyle?.gap === '2px'
          && intervalControlStyle.paddingTop === '3px'
          && intervalControlStyle.paddingRight === '3px'
          && intervalControlStyle.paddingBottom === '3px'
          && intervalControlStyle.paddingLeft === '3px'
          && intervalControlStyle.borderRadius === '8px'
          && intervalButtonStyle?.paddingTop === '3px'
          && intervalButtonStyle.paddingRight === '8px'
          && intervalButtonStyle.paddingBottom === '3px'
          && intervalButtonStyle.paddingLeft === '8px'
          && intervalButtonStyle.borderRadius === '6px'
          && intervalButtonStyle.fontSize === '9.28px'
          && intervalButtonStyle.letterSpacing === '0.5568px'
          && intervalButtonStyle.minHeight === 'auto'
          && intervalButtonStyle.minWidth === 'auto'
          && selectedIntervalButtonStyle?.backgroundColor === canonicalTextColor
          && selectedIntervalButtonStyle.color === canonicalCanvasColor
          && currentHourStyle?.color === canonicalCurrentColor
          && currentRowLabelStyle?.color === canonicalCurrentColor
          && Math.abs(parseFloat(workspaceDotStyle?.width ?? '0') - 8.736) < 0.1
          && Math.abs(parseFloat(workspaceDotStyle?.height ?? '0') - 8.736) < 0.1
          && workspaceDotRect
          && workspaceDotRect.width < 12
          && workspaceDotRect.height < 12
          && firstFlowCellStyle?.minHeight === '12.16px'
          && firstFlowCellRect
          && firstFlowCellRect.height < 20
          && /\.flow-chart-hours,\s*\.flow-chart-row\s*\{[\s\S]*grid-template-columns:\s*var\(--flow-axis-gutter\) repeat\(24,\s*minmax\(1\.55rem,\s*1fr\)\)/.test(stylesheetText)
          && /\.flow-cell\s*\{[\s\S]*min-height:\s*var\(--flow-cell-min-height\)/.test(stylesheetText)
          && /\.flow-breakdown-layout__chart \.flow-cell\s*\{\s*min-height:\s*var\(--flow-breakdown-cell-min-height\)/.test(stylesheetText)
          && /\.flow-chart-grid\s*\{[\s\S]*overflow-x:\s*auto/.test(stylesheetText);
      })(),
      hasBrowserUsageSourceDetail: /Browser usage panel/i.test(bodyText) && /Workspace · Focus · Custom rule/i.test(bodyText)
    };
  }, dashboardViewport.width);

  const failures = collectDashboardAssertions(layout);

  if (evidenceDir) {
    await page.screenshot(join(evidenceDir, 'flow-chart.png'));
  }

  if (failures.length === 0) {
    const interaction = await page.evaluate(() => {
      const intervalButtons = Object.fromEntries(
        ['5m', '10m'].map((label) => {
          const button = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.textContent === label);
          const rect = button?.getBoundingClientRect();
          return [label, rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null];
        })
      );
      const cell = Array.from(document.querySelectorAll('.flow-cell')).find((candidate) => /docs\.example\.com/i.test(candidate.getAttribute('aria-label') ?? ''));
      const cellRect = cell?.getBoundingClientRect();
      const compactBarSegment = document.querySelector('.flow-compact-split-chart__bar .flow-compact-split-chart__segment');
      const compactBarRect = compactBarSegment?.getBoundingClientRect();
      const compactCircleSegment = document.querySelector('.flow-compact-productivity-circle__segment');
      const compactCircleRect = compactCircleSegment?.getBoundingClientRect();
      const workspaceDot = document.querySelector('.flow-chart-legend__dot--workspace');
      const workspaceDotRect = workspaceDot?.getBoundingClientRect();
      return {
        intervalButtons,
        cellRect: cellRect ? { x: cellRect.left + cellRect.width / 2, y: cellRect.top + cellRect.height / 2 } : null,
        compactBarRect: compactBarRect ? { x: compactBarRect.left + compactBarRect.width / 2, y: compactBarRect.top + compactBarRect.height / 2 } : null,
        compactCircleRect: compactCircleRect ? { x: compactCircleRect.left + compactCircleRect.width / 2, y: compactCircleRect.top + compactCircleRect.height * 0.05 } : null,
        workspaceDotRect: workspaceDotRect ? { x: workspaceDotRect.left + workspaceDotRect.width / 2, y: workspaceDotRect.top + workspaceDotRect.height / 2 } : null
      };
    });

    if (!interaction.intervalButtons['5m']) failures.push('dashboard flow chart missing 5m interval button');
    if (!interaction.intervalButtons['10m']) failures.push('dashboard flow chart missing 10m interval button');
    if (!interaction.cellRect) failures.push('dashboard flow chart missing hoverable docs.example.com cell');
    if (!interaction.compactBarRect) failures.push('dashboard compact category bar missing hoverable segment');
    if (!interaction.compactCircleRect) failures.push('dashboard compact productivity circle missing hoverable segment');
    if (!interaction.workspaceDotRect) failures.push('dashboard flow chart missing hoverable workspace legend dot');

    if (interaction.cellRect) {
      await page.hoverAt(interaction.cellRect.x, interaction.cellRect.y);
      await waitFor(async () => page.evaluate(() => {
        const text = document.querySelector('.flow-hover-card')?.textContent ?? '';
        return /docs\.example\.com/i.test(text) && /\d{2}:\d{2}–\d{2}:\d{2}/.test(text) && !/Time block:/i.test(text) && !/\d{2}:\d{2}-\d{2}:\d{2}/.test(text);
      }), 'flow chart hover card for docs.example.com with canonical time copy');
      const docsFaviconSrc = await page.evaluate(() => document.querySelector('.flow-hover-card:not(.category-hover-card) .site-favicon')?.getAttribute('src') ?? null);
      if (!docsFaviconSrc?.startsWith(`chrome-extension://${extensionId}/_favicon/?pageUrl=https%3A%2F%2Fdocs.example.com&size=64`)) {
        failures.push(`dashboard flow hover favicon should use Chrome _favicon API, got ${docsFaviconSrc ?? 'none'}`);
      }
    }

    await page.evaluate(() => {
      const cell = Array.from(document.querySelectorAll('.flow-cell')).find((candidate) => /docs\.example\.com/i.test(candidate.getAttribute('aria-label') ?? ''));
      cell?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: window.innerWidth - 2, clientY: window.innerHeight - 2 }));
      cell?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: window.innerWidth - 2, clientY: window.innerHeight - 2 }));
    });
    await page.evaluate(() => {
      const cell = Array.from(document.querySelectorAll('.flow-cell')).find((candidate) => /docs\.example\.com/i.test(candidate.getAttribute('aria-label') ?? ''));
      cell?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: window.innerWidth - 2, clientY: window.innerHeight - 2 }));
    });
    await waitFor(async () => page.evaluate(() => {
      const card = document.querySelector('.flow-hover-card:not(.category-hover-card)');
      const rect = card?.getBoundingClientRect();
      return Boolean(rect && rect.right <= window.innerWidth - 16 && rect.bottom <= window.innerHeight - 16 && rect.left >= 16 && rect.top >= 16 && rect.left < window.innerWidth - 2 && rect.top < window.innerHeight - 2);
    }), 'flow hover card to flip and stay viewport safe');

    if (interaction.workspaceDotRect) {
      await page.hoverAt(interaction.workspaceDotRect.x, interaction.workspaceDotRect.y);
      const hasCanonicalIdentityIconSizing = await page.evaluate(() => {
        const probeIdentityIcon = document.createElement('span');
        probeIdentityIcon.className = 'usage-identity-icon usage-identity-icon--sm';
        probeIdentityIcon.style.position = 'fixed';
        probeIdentityIcon.style.left = '-9999px';
        document.body.append(probeIdentityIcon);
        const probeIdentityIconRect = probeIdentityIcon.getBoundingClientRect();
        probeIdentityIcon.remove();

        const probeGlyph = document.createElement('div');
        probeGlyph.className = 'app-glyph app-glyph--sm';
        probeGlyph.style.position = 'fixed';
        probeGlyph.style.left = '-9999px';
        document.body.append(probeGlyph);
        const probeGlyphRect = probeGlyph.getBoundingClientRect();
        probeGlyph.remove();
        return Boolean(
          Math.round(probeIdentityIconRect.width) === 28
          && Math.round(probeIdentityIconRect.height) === 28
          && Math.round(probeGlyphRect.width) === 28
          && Math.round(probeGlyphRect.height) === 28
        );
      });
      if (!hasCanonicalIdentityIconSizing) failures.push('dashboard identity icon and small app glyph CSS should be 28px like Mac');

      await page.evaluate(() => {
        const dot = document.querySelector('.flow-chart-legend__dot--workspace');
        dot?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: window.innerWidth - 2, clientY: window.innerHeight - 2 }));
      });
      await waitFor(async () => page.evaluate(() => {
        const card = document.querySelector('.flow-hover-card.category-hover-card:not(.compact-classification-hover-card)');
        const rect = card?.getBoundingClientRect();
        return Boolean(rect && rect.right <= window.innerWidth - 16 && rect.bottom <= window.innerHeight - 16 && rect.left >= 16 && rect.top >= 16 && rect.left < window.innerWidth - 2 && rect.top < window.innerHeight - 2);
      }), 'legend hover card to flip and stay viewport safe');
    }

    if (interaction.compactBarRect) {
      await page.hoverAt(interaction.compactBarRect.x, interaction.compactBarRect.y);
      await waitFor(async () => page.evaluate(() => {
        const text = document.querySelector('.compact-classification-hover-card')?.textContent ?? '';
        return /of tracked time/i.test(text) && /docs\.example\.com|boundary\.example\.com|night\.example\.com|early\.example\.com|midnight\.example\.com|instagram\.com|meet\.google\.com|shop\.example\.com/i.test(text);
      }), 'compact category hover card with source breakdown');
    }

    if (interaction.compactCircleRect) {
      await page.hoverAt(interaction.compactCircleRect.x, interaction.compactCircleRect.y);
      await waitFor(async () => page.evaluate(() => {
        const text = document.querySelector('.compact-classification-hover-card')?.textContent ?? '';
        return /of tracked time/i.test(text) && /docs\.example\.com|boundary\.example\.com|night\.example\.com|early\.example\.com|midnight\.example\.com|instagram\.com|meet\.google\.com|shop\.example\.com/i.test(text);
      }), 'compact productivity hover card with source breakdown');
    }

    await page.hoverAt(dashboardViewport.width - 2, dashboardViewport.height - 2);
    const edgeHover = await page.evaluate(() => {
      const segment = document.querySelector('.flow-compact-split-chart__bar .flow-compact-split-chart__segment');
      const rect = segment?.getBoundingClientRect();
      return rect ? { x: rect.right - 1, y: rect.top + rect.height / 2 } : null;
    });
    if (edgeHover) {
      await page.hoverAt(edgeHover.x, edgeHover.y);
      await waitFor(async () => page.evaluate(() => {
        const card = document.querySelector('.compact-classification-hover-card');
        const rect = card?.getBoundingClientRect();
        return Boolean(rect && rect.right <= window.innerWidth - 16 && rect.bottom <= window.innerHeight - 16 && rect.left >= 16 && rect.top >= 16 && rect.left < window.innerWidth - 2);
      }), 'compact hover card to flip and stay viewport safe');
    }

    if (interaction.intervalButtons['5m']) {
      await page.clickAt(interaction.intervalButtons['5m'].x, interaction.intervalButtons['5m'].y);
      await waitFor(async () => page.evaluate(() => document.querySelector('.flow-chart-card')?.getAttribute('data-flow-interval') === '5' && document.querySelectorAll('.flow-chart-row').length === 12), 'flow chart interval to switch to 5m with 12 rows');
    }

    if (interaction.intervalButtons['10m']) {
      await page.clickAt(interaction.intervalButtons['10m'].x, interaction.intervalButtons['10m'].y);
      await waitFor(async () => page.evaluate(() => document.querySelector('.flow-chart-card')?.getAttribute('data-flow-interval') === '10' && document.querySelectorAll('.flow-chart-row').length === 6), 'flow chart interval to switch to 10m with 6 rows');
    }

  }

  failures.push(...await collectDashboardTabAssertions(page));

  await seedRuntimeSessions(page, []);
  await page.navigate(dashboardUrl);
  await waitFor(async () => page.evaluate(() => document.querySelector('.shell') !== null), 'empty dashboard React shell');
  await clickDashboardTab(page, 'Today');
  const emptyLayout = await page.evaluate(() => ({
    hasNoTimelineCopy: /No timeline yet/i.test(document.body.textContent ?? ''),
    hasCanonicalEmptyDetail: /Tracking is paused\. Use the sidebar control or move to a day with recorded activity\./.test(document.body.textContent ?? '') || /Tracker is live for .+\./.test(document.body.textContent ?? ''),
    hasFlowChartCard: document.querySelector('.flow-chart-card') !== null
  }));
  failures.push(...collectEmptyDashboardAssertions(emptyLayout));

  page.close();
  return { layout: { ...layout, empty: emptyLayout }, failures };
}

async function main() {
  const manifestPath = resolve(extensionRoot, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Built extension manifest is missing at ${manifestPath}. Run npm run build first.`);
  }

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.permissions) || !manifest.permissions.includes('favicon')) {
    throw new Error('Built extension manifest must include the favicon permission for Mac-like site favicon rendering.');
  }

  if (typeof WebSocket !== 'function') {
    throw new Error('This UI verifier requires a Node runtime with a global WebSocket implementation.');
  }

  if (evidenceDir) {
    await mkdir(evidenceDir, { recursive: true });
  }

  const port = 9339;
  const userDataDir = await mkdtemp(join(tmpdir(), 'drifty-ui-qa-'));
  const chrome = spawn(findChromeExecutable(), [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    `--disable-extensions-except=${extensionRoot}`,
    `--load-extension=${extensionRoot}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-popup-blocking',
    '--disable-background-networking',
    '--window-size=1280,900',
    'about:blank'
  ], { stdio: 'ignore' });

  try {
    await waitForDevTools(port);
    const extensionId = await discoverExtensionId(port);
    const popup = await verifyPopup(port, extensionId);
    const dashboard = await verifyDashboard(port, extensionId);
    const failures = [...popup.failures, ...dashboard.failures];

    console.log(JSON.stringify({ extensionId, popup: popup.layout, dashboard: dashboard.layout, failures }, null, 2));

    if (failures.length > 0) {
      throw new Error(`Drifty extension UI contract failed:\n- ${failures.join('\n- ')}`);
    }
  } finally {
    chrome.kill('SIGTERM');
    await delay(250);
    if (!chrome.killed) chrome.kill('SIGKILL');
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
