const EXTENSION_NAME = 'Drifty';
const DB_NAME = 'drifty_browser_runtime';
const DB_VERSION = 1;
const SESSION_STORE = 'sessions';
const VISIT_STORE = 'visits';
const ACTIVE_SESSION_KEY = 'driftyActiveSession';
const SETTINGS_KEY = 'driftySettings';
const AUTOSAVE_ALARM = 'drifty-active-session-autosave';
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;
const ACTIVE_SAVE_INTERVAL_MINUTES = 1;
const IGNORED_PROTOCOLS = new Set(['chrome:', 'chrome-extension:', 'edge:', 'about:', 'devtools:']);

const CATEGORY_METADATA = {
  productivity: {
    id: 'productivity',
    name: 'Productivity',
    label: 'Productivity',
    productivity: 'focus',
    domains: ['github.com', 'gitlab.com', 'linear.app', 'notion.so', 'docs.google.com', 'drive.google.com', 'figma.com', 'slack.com', 'gmail.com', 'mail.google.com'],
    keywords: ['dashboard', 'docs', 'document', 'project', 'task', 'issue', 'pull request', 'workspace']
  },
  learning: {
    id: 'learning',
    name: 'Learning',
    label: 'Learning',
    productivity: 'focus',
    domains: ['coursera.org', 'edx.org', 'khanacademy.org', 'udemy.com', 'wikipedia.org', 'stackoverflow.com', 'developer.mozilla.org', 'docs.python.org'],
    keywords: ['learn', 'course', 'tutorial', 'documentation', 'docs', 'lesson', 'reference']
  },
  social: {
    id: 'social',
    name: 'Social',
    label: 'Social',
    productivity: 'neutral',
    domains: ['facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'tiktok.com', 'reddit.com', 'threads.net', 'bsky.app'],
    keywords: ['social', 'feed', 'post', 'reel', 'shorts']
  },
  games: {
    id: 'games',
    name: 'Games',
    label: 'Games',
    productivity: 'neutral',
    domains: ['steampowered.com', 'roblox.com', 'twitch.tv', 'epicgames.com', 'chess.com', 'ign.com'],
    keywords: ['game', 'gaming', 'play']
  },
  entertainment: {
    id: 'entertainment',
    name: 'Entertainment',
    label: 'Entertainment',
    productivity: 'drift',
    domains: ['youtube.com', 'netflix.com', 'hulu.com', 'disneyplus.com', 'primevideo.com', 'vimeo.com'],
    keywords: ['watch', 'video', 'movie', 'stream', 'episode']
  },
  music: {
    id: 'music',
    name: 'Music',
    label: 'Music',
    productivity: 'neutral',
    domains: ['spotify.com', 'music.apple.com', 'soundcloud.com', 'bandcamp.com', 'tidal.com'],
    keywords: ['music', 'playlist', 'album', 'song', 'artist']
  },
  shopping: {
    id: 'shopping',
    name: 'Shopping',
    label: 'Shopping',
    productivity: 'drift',
    domains: ['amazon.com', 'ebay.com', 'etsy.com', 'shopify.com', 'coupang.com', 'target.com', 'walmart.com'],
    keywords: ['shop', 'cart', 'checkout', 'product', 'order']
  },
  news: {
    id: 'news',
    name: 'News',
    label: 'News',
    productivity: 'neutral',
    domains: ['nytimes.com', 'bbc.com', 'cnn.com', 'reuters.com', 'apnews.com', 'theguardian.com', 'medium.com', 'substack.com'],
    keywords: ['news', 'article', 'report', 'headline', 'newsletter']
  },
  adult: {
    id: 'adult',
    name: 'Adult',
    label: 'Adult',
    productivity: 'drift',
    domains: [],
    keywords: ['adult']
  },
  communication: {
    id: 'communication',
    name: 'Communication',
    label: 'Communication',
    productivity: 'neutral',
    domains: ['discord.com', 'meet.google.com', 'zoom.us', 'teams.microsoft.com', 'web.whatsapp.com', 'telegram.org'],
    keywords: ['chat', 'meeting', 'call', 'message']
  },
  utility: {
    id: 'utility',
    name: 'Utility',
    label: 'Utility',
    productivity: 'neutral',
    domains: ['google.com', 'duckduckgo.com', 'icloud.com', 'dropbox.com', 'maps.google.com'],
    keywords: ['search', 'map', 'weather', 'utility']
  },
  other: {
    id: 'other',
    name: 'Other',
    label: 'Other',
    productivity: 'neutral',
    domains: [],
    keywords: []
  }
};

const DEFAULT_SETTINGS = {
  trackingEnabled: true,
  privacyMode: false,
  sync: {
    cloudSyncEnabled: false,
    remoteCategorySyncEnabled: false,
    rawHistorySyncEnabled: false,
    rawSessionSyncEnabled: false
  },
  privacy: {
    preserveRawBrowsingLocalOnly: true,
    preserveRawSessionsLocalOnly: true
  },
  blocking: {
    enabled: false,
    limits: {}
  }
};

let dbPromise = null;

function getDb() {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        const sessions = db.createObjectStore(SESSION_STORE, { keyPath: 'id' });
        sessions.createIndex('date', 'date', { unique: false });
        sessions.createIndex('domain', 'domain', { unique: false });
        sessions.createIndex('category', 'category', { unique: false });
        sessions.createIndex('startTime', 'startTime', { unique: false });
      }
      if (!db.objectStoreNames.contains(VISIT_STORE)) {
        const visits = db.createObjectStore(VISIT_STORE, { keyPath: 'id' });
        visits.createIndex('date', 'date', { unique: false });
        visits.createIndex('domain', 'domain', { unique: false });
        visits.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });

  return dbPromise;
}

function runStore(storeName, mode, action) {
  return getDb().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let actionResult;

    transaction.oncomplete = () => resolve(actionResult);
    transaction.onerror = () => reject(transaction.error ?? new Error(`IndexedDB transaction failed for ${storeName}`));
    transaction.onabort = () => reject(transaction.error ?? new Error(`IndexedDB transaction aborted for ${storeName}`));

    actionResult = action(store);
  }));
}

function getAllFromStore(storeName) {
  return runStore(storeName, 'readonly', (store) => new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error ?? new Error(`Failed to read ${storeName}`));
  }));
}

function putInStore(storeName, value) {
  return runStore(storeName, 'readwrite', (store) => {
    store.put(value);
  });
}

function getStorage(keys) {
  return chrome.storage.local.get(keys);
}

function setStorage(values) {
  return chrome.storage.local.set(values);
}

function removeStorage(keys) {
  return chrome.storage.local.remove(keys);
}

function todayDate(now = Date.now()) {
  return dateKey(now);
}

function dateKey(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function datesForLastSevenDays(now = Date.now()) {
  const dates = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    dates.push(dateKey(date.getTime()));
  }
  return dates;
}

function normalizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return null;
  }

  try {
    const url = new URL(rawUrl);
    if (IGNORED_PROTOCOLS.has(url.protocol)) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function domainFromUrl(rawUrl) {
  const url = normalizeUrl(rawUrl);
  return url ? url.hostname.replace(/^www\./, '').toLowerCase() : '';
}

function classifyVisit(url, title = '') {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) {
    return 'other';
  }

  const domain = normalizedUrl.hostname.replace(/^www\./, '').toLowerCase();
  const haystack = `${domain} ${normalizedUrl.pathname} ${title}`.toLowerCase();
  let bestCategory = 'other';
  let bestScore = 0;

  for (const [category, metadata] of Object.entries(CATEGORY_METADATA)) {
    if (category === 'other') {
      continue;
    }

    let score = 0;
    if (metadata.domains.some((candidate) => domain === candidate || domain.endsWith(`.${candidate}`))) {
      score += 100;
    }
    for (const keyword of metadata.keywords) {
      if (haystack.includes(keyword)) {
        score += 8;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

function sanitizeMetadata(input) {
  const url = typeof input?.url === 'string' ? input.url : '';
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) {
    return null;
  }

  const title = typeof input?.title === 'string' ? input.title.slice(0, 300) : '';
  const domain = (typeof input?.domain === 'string' && input.domain.trim()) || domainFromUrl(url);
  return {
    url: normalizedUrl.href,
    title,
    domain: domain.replace(/^www\./, '').toLowerCase(),
    timestamp: Number.isFinite(input?.timestamp) ? input.timestamp : Date.now()
  };
}

async function loadActiveSession() {
  const stored = await getStorage(ACTIVE_SESSION_KEY);
  return stored[ACTIVE_SESSION_KEY] ?? null;
}

async function saveActiveSession(session) {
  if (!session) {
    await removeStorage(ACTIVE_SESSION_KEY);
    return;
  }

  await setStorage({ [ACTIVE_SESSION_KEY]: session });
}

function createVisit(metadata, category) {
  return {
    id: `visit-${metadata.timestamp}-${Math.random().toString(36).slice(2)}`,
    url: metadata.url,
    title: metadata.title,
    timestamp: metadata.timestamp,
    date: dateKey(metadata.timestamp),
    domain: metadata.domain,
    category
  };
}

function createSession(metadata, category) {
  const visit = createVisit(metadata, category);
  return {
    id: `session-${metadata.timestamp}-${Math.random().toString(36).slice(2)}`,
    category,
    startTime: metadata.timestamp,
    endTime: null,
    lastVisitTime: metadata.timestamp,
    duration: 0,
    date: dateKey(metadata.timestamp),
    domain: metadata.domain,
    title: metadata.title,
    url: metadata.url,
    visits: [visit],
    source: 'chrome-mv3'
  };
}

function updateSession(session, metadata, category) {
  const visit = createVisit(metadata, category);
  const startTime = Number(session.startTime) || metadata.timestamp;
  const lastVisitTime = Math.max(Number(session.lastVisitTime) || startTime, metadata.timestamp);

  return {
    ...session,
    category: session.category || category,
    endTime: null,
    lastVisitTime,
    duration: Math.max(0, lastVisitTime - startTime),
    date: dateKey(startTime),
    domain: metadata.domain || session.domain,
    title: metadata.title || session.title,
    url: metadata.url || session.url,
    visits: [...(session.visits ?? []), visit].slice(-50)
  };
}

function shouldContinueSession(session, metadata, category) {
  if (!session) {
    return false;
  }

  const elapsed = metadata.timestamp - (Number(session.lastVisitTime) || Number(session.startTime) || metadata.timestamp);
  if (elapsed > SESSION_TIMEOUT_MS) {
    return false;
  }

  return session.category === category || session.domain === metadata.domain;
}

async function persistVisit(metadata, category) {
  await putInStore(VISIT_STORE, createVisit(metadata, category));
}

async function finishActiveSession(reason = 'ended') {
  const session = await loadActiveSession();
  if (!session) {
    return null;
  }

  const now = Date.now();
  const startTime = Number(session.startTime) || now;
  const lastVisitTime = Number(session.lastVisitTime) || startTime;
  const endTime = Math.max(lastVisitTime, now);
  const finishedSession = {
    ...session,
    endTime,
    duration: Math.max(Number(session.duration) || 0, endTime - startTime),
    endReason: reason
  };

  await putInStore(SESSION_STORE, finishedSession);
  await removeStorage(ACTIVE_SESSION_KEY);
  return finishedSession;
}

async function recordPageMetadata(input) {
  const metadata = sanitizeMetadata(input);
  if (!metadata) {
    return { recorded: false };
  }

  const category = classifyVisit(metadata.url, metadata.title);
  const current = await loadActiveSession();
  if (current && !shouldContinueSession(current, metadata, category)) {
    await finishActiveSession('category-or-timeout-change');
  }

  const reloaded = await loadActiveSession();
  const nextSession = shouldContinueSession(reloaded, metadata, category)
    ? updateSession(reloaded, metadata, category)
    : createSession(metadata, category);

  await persistVisit(metadata, category);
  await saveActiveSession(nextSession);

  return { recorded: true, category, domain: metadata.domain, sessionId: nextSession.id };
}

async function saveActiveSnapshot() {
  const session = await loadActiveSession();
  if (!session) {
    return;
  }

  const now = Date.now();
  const startTime = Number(session.startTime) || now;
  const lastVisitTime = Number(session.lastVisitTime) || startTime;
  const snapshot = {
    ...session,
    duration: Math.max(Number(session.duration) || 0, Math.min(now, lastVisitTime + SESSION_TIMEOUT_MS) - startTime)
  };

  await saveActiveSession(snapshot);
}

function sessionWithLiveDuration(session) {
  if (!session) {
    return null;
  }

  const now = Date.now();
  const startTime = Number(session.startTime) || now;
  const lastVisitTime = Number(session.lastVisitTime) || startTime;
  const endTime = session.endTime ?? Math.min(now, lastVisitTime + SESSION_TIMEOUT_MS);

  return {
    ...session,
    endTime: session.endTime ?? null,
    duration: Math.max(Number(session.duration) || 0, endTime - startTime)
  };
}

function getSessionsByDateRange(storeName, startDate, endDate) {
  return runStore(storeName, 'readonly', (store) => new Promise((resolve, reject) => {
    const index = store.index('date');
    const range = IDBKeyRange.bound(startDate, endDate);
    const request = index.getAll(range);
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error ?? new Error(`Failed to query ${storeName} by date range`));
  }));
}

function shiftDateKey(dateKeyStr, offsetDays) {
  const [year, month, day] = String(dateKeyStr).split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + offsetDays);
  return dateKey(date.getTime());
}

async function sessionsForDate(date) {
  const prevDate = shiftDateKey(date, -1);
  const nextDate = shiftDateKey(date, 1);
  const sessions = await getSessionsByDateRange(SESSION_STORE, prevDate, nextDate);
  const active = await loadActiveSession();
  const allSessions = active ? [...sessions, sessionWithLiveDuration(active)] : sessions;
  return allSessions.filter((session) => sessionOverlapsDate(session, date));
}

function dateBounds(date) {
  const [year, month, day] = String(date).split('-').map((part) => Number(part));
  const start = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
  return { start, end: start + 24 * 60 * 60 * 1000 };
}

function sessionOverlapsDate(session, date) {
  if (!session) return false;
  const startTime = Number(session.startTime);
  const endTime = Number(session.endTime ?? session.lastVisitTime ?? session.startTime);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return session.date === date;
  const bounds = dateBounds(date);
  return startTime < bounds.end && Math.max(endTime, startTime) > bounds.start;
}

function emptyCategoryStats() {
  return Object.keys(CATEGORY_METADATA).reduce((result, category) => {
    result[category] = { time: 0, sessionCount: 0, topSites: [] };
    return result;
  }, {});
}

function buildStats(date, sessions) {
  const categories = emptyCategoryStats();
  const domains = {};
  let totalTime = 0;

  for (const session of sessions) {
    const category = session.category && categories[session.category] ? session.category : 'other';
    const duration = Math.max(0, Number(session.duration) || 0);
    const domain = session.domain || domainFromUrl(session.url);

    totalTime += duration;
    categories[category].time += duration;
    categories[category].sessionCount += 1;

    if (domain) {
      domains[domain] = (domains[domain] || 0) + duration;
    }
  }

  const topSites = Object.entries(domains)
    .sort((a, b) => b[1] - a[1])
    .map(([domain, time]) => ({ domain, time }));

  for (const categoryStats of Object.values(categories)) {
    const categoryDomains = new Map();
    for (const session of sessions) {
      if ((session.category || 'other') !== Object.keys(categories).find((key) => categories[key] === categoryStats)) {
        continue;
      }
      const domain = session.domain || domainFromUrl(session.url);
      if (domain) {
        categoryDomains.set(domain, (categoryDomains.get(domain) || 0) + (Number(session.duration) || 0));
      }
    }
    categoryStats.topSites = [...categoryDomains.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([domain, time]) => ({ domain, time }));
  }

  return {
    date,
    categories,
    totalTime,
    pickups: sessions.length,
    sessions,
    recentSessions: [...sessions].sort((a, b) => (b.startTime || 0) - (a.startTime || 0)).slice(0, 10),
    domains,
    topSites: topSites.slice(0, 10)
  };
}

async function getDateStats(date) {
  const targetDate = date || todayDate();
  const sessions = await sessionsForDate(targetDate);
  return { stats: buildStats(targetDate, sessions), sessions };
}

async function getWeeklyStats() {
  const dates = datesForLastSevenDays();
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];
  const allSessions = await getSessionsByDateRange(SESSION_STORE, startDate, endDate);
  const active = await loadActiveSession();
  const allSessionsWithActive = active ? [...allSessions, sessionWithLiveDuration(active)] : allSessions;
  const dailyStats = [];
  let totalTime = 0;

  for (const date of dates) {
    const sessions = allSessionsWithActive.filter((session) => sessionOverlapsDate(session, date));
    const stats = buildStats(date, sessions);
    totalTime += stats.totalTime;
    dailyStats.push(stats);
  }

  return {
    dailyStats,
    totalTime,
    dailyAverage: Math.round(totalTime / dates.length)
  };
}

async function getSettings() {
  const stored = await getStorage(SETTINGS_KEY);
  const storedSettings = stored[SETTINGS_KEY] ?? {};
  const settings = {
    ...DEFAULT_SETTINGS,
    ...storedSettings,
    sync: { ...DEFAULT_SETTINGS.sync, ...(storedSettings.sync ?? {}) },
    privacy: { ...DEFAULT_SETTINGS.privacy, ...(storedSettings.privacy ?? {}) },
    blocking: { ...DEFAULT_SETTINGS.blocking, ...(storedSettings.blocking ?? {}) }
  };

  return settings;
}

async function getBlockingStatus(url) {
  const settings = await getSettings();
  const domain = domainFromUrl(url);
  const category = classifyVisit(url, '');

  return {
    blocked: false,
    isBlocked: false,
    shouldBlock: false,
    enabled: Boolean(settings.blocking?.enabled),
    reason: null,
    category,
    domain,
    limit: null,
    remainingTime: null
  };
}

function respondSuccess(sendResponse, data) {
  sendResponse({ success: true, data });
}

function respondFailure(sendResponse, error) {
  sendResponse({ success: false, error: error?.message || String(error) });
}

async function handleMessage(message, sender) {
  const type = message?.type || message?.action;

  switch (type) {
    case 'DRIFTY_PING':
      return 'pong';
    case 'GET_TODAY_STATS': {
      const result = await getDateStats(todayDate());
      return result.stats;
    }
    case 'GET_WEEKLY_STATS':
      return getWeeklyStats();
    case 'GET_DATE_STATS':
      return getDateStats(message.date || todayDate());
    case 'GET_CURRENT_SESSION': {
      const session = sessionWithLiveDuration(await loadActiveSession());
      return { session, state: session ? 'active' : 'idle' };
    }
    case 'GET_POPUP_DATA': {
      const [todayResult, weekResult, sessionResult] = await Promise.all([
        getDateStats(todayDate()),
        getWeeklyStats(),
        (async () => {
          const session = sessionWithLiveDuration(await loadActiveSession());
          return { session, state: session ? 'active' : 'idle' };
        })()
      ]);
      return {
        today: todayResult.stats,
        week: weekResult,
        currentSession: sessionResult
      };
    }
    case 'GET_SETTINGS':
      return getSettings();
    case 'GET_CATEGORIES':
      return CATEGORY_METADATA;
    case 'CHECK_SITE_BLOCKED':
    case 'CHECK_BLOCKING_STATUS':
      return getBlockingStatus(message.url || sender?.tab?.url || '');
    case 'PAGE_METADATA':
    case 'RECORD_PAGE_METADATA':
      return recordPageMetadata({
        url: message.url || message.data?.url || sender?.tab?.url,
        title: message.title || message.data?.title || sender?.tab?.title,
        domain: message.domain || message.data?.domain,
        timestamp: message.timestamp || message.data?.timestamp || Date.now()
      });
    default:
      throw new Error(`Unsupported message type: ${type || 'unknown'}`);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(AUTOSAVE_ALARM, { periodInMinutes: ACTIVE_SAVE_INTERVAL_MINUTES });
  chrome.idle.setDetectionInterval(60);
  getDb().catch((error) => console.warn(`${EXTENSION_NAME} IndexedDB initialization failed`, error));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((data) => respondSuccess(sendResponse, data))
    .catch((error) => respondFailure(sendResponse, error));
  return true;
});

async function requestTabMetadata(tabId) {
  if (!tabId) return;
  await chrome.tabs.sendMessage(tabId, { type: 'REQUEST_PAGE_METADATA' }).catch(() => null);
}

async function requestFocusedTabMetadata(windowId) {
  const query = windowId === undefined ? { active: true, lastFocusedWindow: true } : { active: true, windowId };
  const tabs = await chrome.tabs.query(query);
  await requestTabMetadata(tabs[0]?.id);
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  requestTabMetadata(tabId).catch((error) => console.warn(`${EXTENSION_NAME} failed to request activated tab metadata`, error));
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    finishActiveSession('window-focus-lost').catch((error) => console.warn(`${EXTENSION_NAME} failed to end focus-lost session`, error));
    return;
  }

  requestFocusedTabMetadata(windowId).catch((error) => console.warn(`${EXTENSION_NAME} failed to request focused tab metadata`, error));
});

chrome.idle.onStateChanged.addListener((state) => {
  if (state === 'idle' || state === 'locked') {
    finishActiveSession(state).catch((error) => console.warn(`${EXTENSION_NAME} failed to end idle session`, error));
    return;
  }

  if (state === 'active') {
    requestFocusedTabMetadata().catch((error) => console.warn(`${EXTENSION_NAME} failed to request idle resume metadata`, error));
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== AUTOSAVE_ALARM) {
    return;
  }

  saveActiveSnapshot().catch((error) => console.warn(`${EXTENSION_NAME} failed to autosave active session`, error));
});

chrome.alarms.create(AUTOSAVE_ALARM, { periodInMinutes: ACTIVE_SAVE_INTERVAL_MINUTES });
getDb().catch((error) => console.warn(`${EXTENSION_NAME} startup IndexedDB initialization failed`, error));
