import { sessionTracker } from './session-tracker.js';
import { dbManager } from './db-manager.js';
import { categoryDetector } from './category-detector.js';
import { serverSync } from './server-sync.js';
import { historyAnalyzer } from './history-analyzer.js';
import { remoteDeviceTracker } from './remote-device-tracker.js';
import { categoryScheduler } from './category-scheduler.js';
import { visitBuffer } from './visit-buffer.js';
import { getTodayDate, getDateFromTimestamp, normalizeDomain } from '../common/utils.js';
import { PRODUCTIVITY_GROUPS } from '../common/constants.js';
import { getWellKnownDomain } from '../common/well-known-domains.js';

// Initialize extension
const SW_START_TIME = Date.now();
console.log(`deTime - Service Worker starting at ${new Date().toISOString()}...`);

// Centralized alarm dispatcher — MUST be top-level for MV3
// (listeners registered inside async init() can be lost on SW restart)
chrome.alarms.onAlarm.addListener((alarm) => {
  const name = alarm.name;
  // session-tracker
  if (name === 'checkIdle')              sessionTracker.handleAlarm(alarm);
  else if (name === 'saveSession')       sessionTracker.handleAlarm(alarm);
  // server-sync
  else if (name === 'serverSync')        serverSync.handleAlarm(alarm);
  else if (name === 'statsUpload')       serverSync.handleAlarm(alarm);
  else if (name === 'categorySync')      serverSync.handleAlarm(alarm);
  // remote-device-tracker
  else if (name === 'pollRemoteHistory') remoteDeviceTracker.handleAlarm(alarm);
  // category-scheduler
  else if (name === 'categorize-batch')  categoryScheduler.handleAlarm(alarm);
  else if (name === 'categorize-retry')  categoryScheduler.handleAlarm(alarm);
  // visit-buffer
  else if (name === 'flushVisitBuffer')  visitBuffer.handleAlarm(alarm);
});

// Initialize modules — each step is independent so one failure doesn't block others
(async () => {
  try { await sessionTracker.init(); console.log('Session Tracker initialized'); }
  catch (e) { console.error('Session Tracker init failed:', e); }

  try {
    await Promise.all([dbManager.fixInvalidCategorySessions(), dbManager.fixInvalidCategoryDailyStats()]);
    console.log('Data migrations completed');
  } catch (e) { console.error('Data migrations failed:', e); }

  try { await serverSync.init(); console.log('Server Sync initialized'); }
  catch (e) { console.error('Server Sync init failed:', e); }

  try { await serverSync.downloadDomainCache(); console.log('Domain cache downloaded'); }
  catch (e) { console.error('Domain cache download failed:', e); }

  try { await remoteDeviceTracker.init(); console.log('Remote Device Tracker initialized'); }
  catch (e) { console.error('Remote Device Tracker init failed:', e); }

  try { await categoryScheduler.init(); console.log('Category Scheduler initialized'); }
  catch (e) { console.error('Category Scheduler init failed:', e); }

  console.log('deTime fully initialized');

  try { await checkAndRunHistoryAnalysis(); }
  catch (e) { console.error('History analysis check failed:', e); }
})();

/**
 * Check if history analysis should run automatically
 */
async function checkAndRunHistoryAnalysis() {
  try {
    // Check settings
    const settings = await dbManager.getSettings();

    // Skip if onboarding not complete (will run during onboarding)
    if (!settings?.onboardingComplete) {
      console.log('Onboarding not complete, skipping automatic history analysis');
      return;
    }

    // Check if user wants approximated data
    if (settings?.historyAnalysis?.showApproximatedData === false) {
      return; // User disabled approximated data
    }

    // Check if we have any data from the last 7 days
    const today = new Date();
    let hasData = false;

    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = getDateFromTimestamp(date.getTime());
      const stats = await dbManager.getDailyStats(dateStr);
      if (stats && stats.totalTime > 0) {
        hasData = true;
        break;
      }
    }

    // If no data, run history analysis
    if (!hasData) {
      console.log('No existing data found. Running automatic history analysis...');
      const result = await historyAnalyzer.analyzeHistory(30);
      console.log('Automatic history analysis completed:', result);
    }
  } catch (error) {
    console.error('Error in automatic history analysis:');
    console.error('  Type:', typeof error);
    console.error('  Name:', error?.name);
    console.error('  Message:', error?.message);
    console.error('  Stack:', error?.stack);
    console.error('  String:', String(error));
    console.error('  Full error:', error);
  }
}

// Handle messages from popup/dashboard
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true; // Keep channel open for async response
});

// ============================================
// External API (for OpenClaw/태식 monitoring)
// ============================================
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  handleExternalMessage(request, sender, sendResponse);
  return true;
});

async function handleExternalMessage(request, sender, sendResponse) {
  try {
    await dbManager.ensureReady();

    switch (request.action) {
      case 'getActivity': {
        const minutes = request.minutes || 30;
        const now = Date.now();
        const since = now - (minutes * 60 * 1000);
        const today = getTodayDate();

        // Get today's sessions
        const allSessions = await dbManager.getSessionsByDate(today);

        // Filter to recent sessions — include full URL + title for timeline
        const recentSessions = allSessions
          .filter(s => (s.lastVisitTime || s.endTime || s.startTime) >= since)
          .map(s => {
            const firstVisit = s.visits?.[0];
            let url = firstVisit?.url || '';
            let domain = 'unknown';
            try { domain = new URL(url).hostname.replace('www.', ''); } catch {}
            return {
              url,
              domain,
              title: firstVisit?.title || s.visits?.find(v => v.title)?.title || '',
              category: s.category,
              startTime: s.startTime,
              endTime: s.endTime || s.lastVisitTime,
              duration: s.duration,
              source: s.source || 'tracked',
              deviceSource: s.deviceSource || 'local'
            };
          })
          .sort((a, b) => a.startTime - b.startTime); // chronological for timeline

        // Get current active session
        const currentSession = sessionTracker.getCurrentSession();
        let activeSession = null;
        if (currentSession.session) {
          const curVisit = currentSession.session.visits?.[0];
          let curUrl = curVisit?.url || '';
          let curDomain = 'unknown';
          try { curDomain = new URL(curUrl).hostname.replace('www.', ''); } catch {}
          activeSession = {
            url: curUrl,
            domain: curDomain,
            title: curVisit?.title || '',
            category: currentSession.session.category,
            startTime: currentSession.session.startTime,
            duration: now - currentSession.session.startTime
          };
        }

        // Last activity = most recent session end or current session
        const lastActivity = activeSession
          ? now
          : (recentSessions.length > 0 ? recentSessions[0].endTime : null);

        // Today's category summary
        const todayStats = await getTodayStats();
        const categorySummary = {};
        if (todayStats.categories) {
          for (const [cat, data] of Object.entries(todayStats.categories)) {
            categorySummary[cat] = Math.round((data.time || 0) / 60000); // minutes
          }
        }

        sendResponse({
          success: true,
          data: {
            lastActivity,
            activeSession,
            recentSessions: recentSessions.slice(0, 20),
            todayTotal: Math.round((todayStats.totalTime || 0) / 60000),
            categorySummary,
            timestamp: now
          }
        });
        break;
      }

      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    console.error('[ExternalAPI] Error:', error);
    sendResponse({ success: false, error: error?.message || String(error) });
  }
}

/**
 * Handle incoming messages
 */
async function handleMessage(message, sender, sendResponse) {
  try {
    // Ensure database is ready before processing any message
    await dbManager.ensureReady();

    switch (message.type) {
      case 'GET_TODAY_STATS':
        const todayStats = await getTodayStats();
        sendResponse({ success: true, data: todayStats });
        break;

      case 'GET_WEEKLY_STATS':
        const weeklyStats = await getWeeklyStats();
        sendResponse({ success: true, data: weeklyStats });
        break;

      case 'GET_DATE_STATS':
        const dateStats = await getDateStats(message.date);
        sendResponse({ success: true, data: dateStats });
        break;

      case 'GET_CURRENT_SESSION':
        const currentSession = sessionTracker.getCurrentSession();
        sendResponse({ success: true, data: currentSession });
        break;

      case 'GET_LIMITS':
        const limits = await dbManager.getAllLimits();
        sendResponse({ success: true, data: limits });
        break;

      case 'SET_LIMIT':
        await dbManager.saveLimit(message.category, message.limit);
        sendResponse({ success: true });
        break;

      case 'DELETE_LIMIT':
        // Support both old (category) and new (id) format
        await dbManager.deleteLimit(message.id || message.category);
        sendResponse({ success: true });
        break;

      case 'GET_SETTINGS':
        const settings = await dbManager.getSettings();
        sendResponse({ success: true, data: settings });
        break;

      case 'SAVE_SETTINGS':
        await dbManager.saveSettings(message.settings);
        sendResponse({ success: true });
        break;

      case 'GET_CATEGORIES':
        const categories = categoryDetector.getAllCategories();
        sendResponse({ success: true, data: categories });
        break;

      case 'DELETE_ADULT_SESSIONS':
        await dbManager.deleteAdultSessions(message.date);
        sendResponse({ success: true });
        break;

      case 'FORCE_SYNC_NOW':
        await serverSync.forceSyncNow();
        sendResponse({ success: true });
        break;

      case 'GET_SYNC_STATUS':
        const syncStatus = serverSync.getSyncStatus();
        const lastSync = await serverSync.getLastSyncTime();
        sendResponse({
          success: true,
          data: { ...syncStatus, lastSyncTime: lastSync }
        });
        break;

      case 'UPLOAD_PENDING_STATS':
        await serverSync.uploadPendingStats();
        sendResponse({ success: true });
        break;

      case 'DOWNLOAD_DOMAIN_CACHE':
        console.log('[ServiceWorker] Downloading domain cache...');
        const cacheSuccess = await serverSync.downloadDomainCache();
        sendResponse({ success: cacheSuccess });
        break;

      case 'GET_DOMAIN_CATEGORY': {
        const domainCat = await dbManager.getDomainCategory(message.domain);
        sendResponse({ success: true, data: domainCat });
        break;
      }

      case 'ANALYZE_UNCLASSIFIED':
        console.log('[ServiceWorker] Analyzing unclassified domains...');
        try {
          const analyzeResult = await serverSync.analyzeUnclassified();
          sendResponse({ success: true, data: analyzeResult });
        } catch (error) {
          console.error('[ServiceWorker] Analyze unclassified failed:', error);
          sendResponse({ success: false, error: error.message });
        }
        break;

      // Batch processing removed - using real-time uploads instead
      case 'PROCESS_BATCH_NOW':
        console.log('[ServiceWorker] Processing batch immediately...');
        await categoryScheduler.processBatch();
        sendResponse({ success: true });
        break;

      case 'PROCESS_ALL_BATCHES':
        console.log('[ServiceWorker] Processing all batches until complete...');
        await categoryScheduler.processUntilComplete((progress) => {
          // Broadcast progress to onboarding UI
          chrome.runtime.sendMessage({
            type: 'CLASSIFY_PROGRESS',
            progress
          }).catch(() => {}); // Ignore if no listener
        });
        sendResponse({ success: true });
        break;

      case 'PROCESS_RECENT_THEN_BACKGROUND':
        console.log('[ServiceWorker] Processing recent sessions first, then background...');
        try {
          const recentResult = await categoryScheduler.processRecentThenBackground((progress) => {
            chrome.runtime.sendMessage({
              type: 'CLASSIFY_PROGRESS',
              progress
            }).catch(() => {});
          });
          sendResponse({ success: true, data: recentResult });
        } catch (error) {
          console.error('[ServiceWorker] Recent-then-background failed:', error);
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'ANALYZE_HISTORY':
        const analysisResult = await historyAnalyzer.analyzeHistory(
          message.days || 30,
          (progress) => {
            // Send progress updates
            chrome.runtime.sendMessage({
              type: 'HISTORY_ANALYSIS_PROGRESS',
              progress
            }).catch(() => {
              // Ignore errors (popup might be closed)
            });
          }
        );

        // Upload history data as batch 0 after analysis completes
        if (analysisResult.sessionsCreated > 0) {
          console.log('[ServiceWorker] Uploading history data as batch 0...');
          serverSync.uploadHistoryData().catch(err => {
            console.error('[ServiceWorker] Failed to upload history data:', err);
          });
        }

        sendResponse({ success: true, data: analysisResult });
        break;

      case 'GET_ANALYSIS_PROGRESS':
        const progress = historyAnalyzer.getProgress();
        sendResponse({ success: true, data: progress });
        break;

      case 'CLEAR_APPROXIMATED_DATA':
        await historyAnalyzer.clearApproximatedData();
        sendResponse({ success: true });
        break;

      case 'GET_CONNECTED_DEVICES': {
        const devices = await remoteDeviceTracker.getConnectedDevices();
        const deviceList = devices.map(d => ({
          deviceName: d.deviceName,
          sessions: d.sessions?.length || 0
        }));
        sendResponse({ success: true, data: deviceList });
        break;
      }

      case 'GET_DATE_STATS_BY_DEVICE': {
        const deviceDateStats = await getDateStatsByDevice(message.date, message.deviceFilter);
        sendResponse({ success: true, data: deviceDateStats });
        break;
      }

      case 'GET_DEBUG_DATA': {
        const debugData = sessionTracker.getDebugData();
        debugData.serviceWorker = {
          startTime: new Date(SW_START_TIME).toISOString(),
          uptime: Date.now() - SW_START_TIME,
          uptimeMin: Math.round((Date.now() - SW_START_TIME) / 60000)
        };
        // Also get today's sessions from DB for comparison
        const todayDate = getTodayDate();
        const todaySessions = await dbManager.getSessionsByDate(todayDate);
        const todayDbStats = await dbManager.getDailyStats(todayDate);
        debugData.db = {
          todaySessionCount: todaySessions.length,
          todayTotalTimeFromSessions: todaySessions.reduce((sum, s) => sum + (s.duration || 0), 0),
          todayStatsTotal: todayDbStats?.totalTime || 0,
          sessions: todaySessions.map(s => ({
            id: s.id,
            category: s.category,
            confidence: s.confidence,
            method: s.method,
            startTime: new Date(s.startTime).toISOString(),
            endTime: s.endTime ? new Date(s.endTime).toISOString() : null,
            duration: s.duration,
            durationMin: Math.round((s.duration || 0) / 60000 * 10) / 10,
            visitCount: s.visits?.length || 0,
            visits: (s.visits || []).map(v => ({
              url: v.url,
              title: v.title,
              category: v.category,
              time: new Date(v.timestamp).toISOString()
            })),
            isActive: s.isActive,
            endReason: s._endReason,
            source: s.source,
            deviceSource: s.deviceSource
          }))
        };
        try {
          debugData.categoryScheduler = await categoryScheduler.getStatus();
        } catch (e) {
          debugData.categoryScheduler = { error: e.message };
        }
        sendResponse({ success: true, data: debugData });
        break;
      }

      case 'CLEAR_ALL_DATA':
        await dbManager.clearAllData(false);
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  } catch (error) {
    console.error('Error handling message:');
    console.error('  Type:', typeof error);
    console.error('  Name:', error?.name);
    console.error('  Message:', error?.message);
    console.error('  Stack:', error?.stack);
    console.error('  String:', String(error));
    console.error('  Full error:', error);
    sendResponse({ success: false, error: error?.message || String(error) });
  }
}

/**
 * Get today's statistics
 */
async function getTodayStats() {
  const today = getTodayDate();

  // Get saved stats (from history analyzer or previous calculation)
  const savedStats = await dbManager.getDailyStats(today);

  // Calculate stats from ALL sessions (both approximated and tracked)
  const calculatedStats = await dbManager.calculateDailyStats(today, false);

  // Use whichever has more total time (handles edge cases where sessions might be missing)
  let stats;
  if (savedStats && savedStats.totalTime > calculatedStats.totalTime) {
    // Merge: use saved stats but update with any new session data
    stats = { ...savedStats };
    // Add calculated domains if not present
    if (!stats.domains && calculatedStats.domains) {
      stats.domains = calculatedStats.domains;
    }
    // Merge subcategories from calculatedStats
    if (calculatedStats.categories) {
      Object.keys(calculatedStats.categories).forEach(cat => {
        if (stats.categories && stats.categories[cat] && calculatedStats.categories[cat].subcategories) {
          stats.categories[cat].subcategories = calculatedStats.categories[cat].subcategories;
        }
      });
    }
  } else {
    stats = calculatedStats;
  }
  stats.source = 'merged';

  // Add current session to stats if exists (apply well-known domain fallback for unclassified)
  const currentSession = sessionTracker.getCurrentSession();
  if (currentSession.session) {
    let category = currentSession.session.category;
    if (category === 'needs_server_classification' || category === 'uncategorized') {
      const visitUrl = currentSession.session.visits?.[0]?.url;
      if (visitUrl) {
        try {
          const domain = new URL(visitUrl).hostname.replace(/^www\./, '').toLowerCase();
          const wellKnown = getWellKnownDomain(domain);
          category = wellKnown?.category || 'other';
        } catch (e) { category = 'other'; }
      } else {
        category = 'other';
      }
    }
    const subcategory = currentSession.session.subcategory || 'general';
    const duration = Date.now() - currentSession.session.startTime;

    if (!stats.categories) stats.categories = {};
    if (!stats.categories[category]) {
      stats.categories[category] = {
        time: 0,
        sessionCount: 0,
        topSites: [],
        subcategories: {}
      };
    }

    // Ensure subcategories object exists
    if (!stats.categories[category].subcategories) {
      stats.categories[category].subcategories = {};
    }

    // Update category time
    stats.categories[category].time += duration;

    // Update subcategory time
    if (!stats.categories[category].subcategories[subcategory]) {
      stats.categories[category].subcategories[subcategory] = {
        time: 0,
        sessionCount: 0
      };
    }
    stats.categories[category].subcategories[subcategory].time += duration;

    stats.totalTime = (stats.totalTime || 0) + duration;
  }

  return stats;
}

/**
 * Get weekly statistics
 */
async function getWeeklyStats() {
  const today = new Date();
  const dates = [];

  // Get last 7 days
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    dates.push(getDateFromTimestamp(date.getTime()));
  }

  // Get stats for each day (include domains from calculateDailyStats)
  const dailyStats = await Promise.all(
    dates.map(async date => {
      // Get saved stats
      let stats = await dbManager.getDailyStats(date);

      // Also calculate to get domains
      const calculatedStats = await dbManager.calculateDailyStats(date, false);

      if (!stats || stats.totalTime < calculatedStats.totalTime) {
        stats = calculatedStats;
      } else {
        // Merge domains from calculated stats
        if (!stats.domains && calculatedStats.domains) {
          stats.domains = calculatedStats.domains;
        }
      }

      if (!stats) {
        stats = { date, categories: {}, totalTime: 0, pickups: 0, mostUsed: null, domains: {} };
      }

      return { date, ...stats };
    })
  );

  // Calculate weekly aggregates
  const weeklyCategories = {};
  let weeklyTotal = 0;
  let weeklyPickups = 0;

  dailyStats.forEach(day => {
    weeklyTotal += day.totalTime || 0;
    weeklyPickups += day.pickups || 0;

    Object.entries(day.categories || {}).forEach(([category, data]) => {
      if (!weeklyCategories[category]) {
        weeklyCategories[category] = {
          time: 0,
          sessionCount: 0,
          topSites: []
        };
      }
      weeklyCategories[category].time += data.time || 0;
      weeklyCategories[category].sessionCount += data.sessionCount || 0;
    });
  });

  // Find most used category
  const mostUsedCategory = Object.entries(weeklyCategories)
    .sort((a, b) => b[1].time - a[1].time)[0]?.[0] || null;

  // Find highest and lowest days
  const sortedDays = [...dailyStats].sort((a, b) => b.totalTime - a.totalTime);
  const highest = sortedDays[0];
  const lowest = sortedDays[sortedDays.length - 1];

  return {
    dailyStats,
    weeklyTotal,
    weeklyPickups,
    weeklyCategories,
    mostUsedCategory,
    dailyAverage: weeklyTotal / 7,
    highest,
    lowest
  };
}

/**
 * Get statistics for a specific date
 */
async function getDateStats(date) {
  // Get saved stats
  const savedStats = await dbManager.getDailyStats(date);

  // Calculate stats from ALL sessions (merges approximated + tracked)
  const calculatedStats = await dbManager.calculateDailyStats(date, false);

  // Use whichever has more total time
  let stats;
  if (savedStats && savedStats.totalTime > calculatedStats.totalTime) {
    stats = { ...savedStats };
    if (!stats.domains && calculatedStats.domains) {
      stats.domains = calculatedStats.domains;
    }
    // Merge subcategories from calculatedStats
    if (calculatedStats.categories) {
      Object.keys(calculatedStats.categories).forEach(cat => {
        if (stats.categories && stats.categories[cat] && calculatedStats.categories[cat].subcategories) {
          stats.categories[cat].subcategories = calculatedStats.categories[cat].subcategories;
        }
      });
    }
  } else {
    stats = calculatedStats;
  }

  // Get ALL sessions for timeline (both approximated and tracked)
  let sessions = await dbManager.getSessionsByDate(date);

  // If requesting today's data, include current active session
  const today = getTodayDate();
  if (date === today) {
    const currentSession = sessionTracker.getCurrentSession();
    if (currentSession.session) {
      const now = Date.now();
      const currentDuration = now - currentSession.session.startTime;

      // Create a live session object
      const liveSession = {
        ...currentSession.session,
        endTime: now,
        duration: currentDuration,
        isLive: true
      };

      // Add to sessions (or replace if already saved as snapshot)
      const existingIndex = sessions.findIndex(s => s.id === liveSession.id);
      if (existingIndex !== -1) {
        sessions[existingIndex] = liveSession;
      } else {
        sessions.push(liveSession);
      }

      // Update stats with current session (apply well-known domain fallback for unclassified)
      let category = currentSession.session.category;
      if (category === 'needs_server_classification' || category === 'uncategorized') {
        const visitUrl = currentSession.session.visits?.[0]?.url;
        if (visitUrl) {
          try {
            const domain = new URL(visitUrl).hostname.replace(/^www\./, '').toLowerCase();
            const wellKnown = getWellKnownDomain(domain);
            category = wellKnown?.category || 'other';
          } catch (e) { category = 'other'; }
        } else {
          category = 'other';
        }
      }
      const subcategory = currentSession.session.subcategory || 'general';
      if (!stats.categories) stats.categories = {};
      if (!stats.categories[category]) {
        stats.categories[category] = { time: 0, sessionCount: 0, topSites: [], subcategories: {} };
      }

      // Ensure subcategories object exists
      if (!stats.categories[category].subcategories) {
        stats.categories[category].subcategories = {};
      }

      // Update category time
      stats.categories[category].time += currentDuration;

      // Update subcategory time
      if (!stats.categories[category].subcategories[subcategory]) {
        stats.categories[category].subcategories[subcategory] = {
          time: 0,
          sessionCount: 0
        };
      }
      stats.categories[category].subcategories[subcategory].time += currentDuration;

      stats.totalTime = (stats.totalTime || 0) + currentDuration;
    }
  }

  return {
    stats,
    sessions
  };
}

/**
 * Get statistics for a specific date filtered by device
 */
async function getDateStatsByDevice(date, deviceFilter) {
  // Calculate stats with device filter
  const stats = await dbManager.calculateDailyStats(date, false, deviceFilter);

  // Get filtered sessions
  const sessions = await dbManager.getSessionsByDate(date, deviceFilter);

  // If requesting today's data and filtering local, include current active session
  const today = getTodayDate();
  if (date === today && (!deviceFilter || deviceFilter === 'local')) {
    const currentSession = sessionTracker.getCurrentSession();
    if (currentSession.session) {
      const now = Date.now();
      const currentDuration = now - currentSession.session.startTime;

      const liveSession = {
        ...currentSession.session,
        endTime: now,
        duration: currentDuration,
        isLive: true
      };

      const existingIndex = sessions.findIndex(s => s.id === liveSession.id);
      if (existingIndex !== -1) {
        sessions[existingIndex] = liveSession;
      } else {
        sessions.push(liveSession);
      }

      const category = currentSession.session.category;
      if (!stats.categories) stats.categories = {};
      if (!stats.categories[category]) {
        stats.categories[category] = { time: 0, sessionCount: 0, topSites: [] };
      }
      stats.categories[category].time += currentDuration;
      stats.totalTime = (stats.totalTime || 0) + currentDuration;
    }
  }

  return { stats, sessions };
}

// Handle extension installation
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log('deTime installed');
    // Open onboarding page for new installations
    setTimeout(() => {
      chrome.tabs.create({ url: 'onboarding/onboarding.html' });
    }, 1000);
  } else if (details.reason === 'update') {
    console.log('deTime updated');
  }
});

// ============================================
// Limit Checking & Enforcement
// ============================================

// Track which limits have been warned/blocked to avoid duplicate notifications
const limitNotificationState = {
  warned: new Set(),   // Categories that have shown 5-min warning
  blocked: new Set()   // Categories that are blocked
};

// Reset notification state at midnight
function resetLimitNotificationState() {
  limitNotificationState.warned.clear();
  limitNotificationState.blocked.clear();
}

// Schedule midnight reset
function scheduleMidnightReset() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const msUntilMidnight = midnight.getTime() - now.getTime();

  setTimeout(() => {
    resetLimitNotificationState();
    scheduleMidnightReset(); // Schedule next reset
  }, msUntilMidnight);
}
scheduleMidnightReset();

/**
 * Check limits and show notifications/block if needed
 */
async function checkLimits() {
  try {
    const limits = await dbManager.getAllLimits();
    if (!limits || limits.length === 0) return;

    const settings = await dbManager.getSettings();
    const notificationsEnabled = settings?.notifications?.enabled !== false;

    const todayStats = await getTodayStats();
    const categories = todayStats.categories || {};

    for (const limit of limits) {
      if (!limit.enabled) continue;

      const category = limit.category;
      const categoryData = categories[category];
      const dailyLimit = limit.dailyLimit;
      const alertMinutes = limit.alertMinutesBefore || 5;
      const alertThreshold = dailyLimit - (alertMinutes * 60 * 1000);
      const targetType = limit.targetType || 'category';
      const targetValue = limit.targetValue;

      // Calculate applicable time based on target type
      let applicableTime = 0;
      if (targetType === 'group' && targetValue) {
        // Sum time for all categories in this productivity group
        const groupDef = PRODUCTIVITY_GROUPS[targetValue];
        if (groupDef) {
          groupDef.categories.forEach(cat => {
            applicableTime += categories[cat]?.time || 0;
          });
        }
      } else if (targetType === 'subcategory' && targetValue) {
        applicableTime = categoryData?.subcategories?.[targetValue]?.time || 0;
      } else if (targetType === 'domain' && targetValue) {
        const domains = todayStats.domains || {};
        Object.entries(domains).forEach(([domain, data]) => {
          if (domain.toLowerCase().includes(targetValue.toLowerCase())) {
            applicableTime += data.time || 0;
          }
        });
      } else {
        applicableTime = categoryData?.time || 0;
      }

      const limitKey = limit.id || category;

      // Build display name for notifications
      let targetName;
      if (targetType === 'group' && targetValue) {
        const groupDef = PRODUCTIVITY_GROUPS[targetValue];
        targetName = `All ${groupDef?.name || targetValue}`;
      } else {
        const catInfo = categoryDetector.getAllCategories()[category];
        targetName = catInfo?.name || category;
        if (targetType === 'subcategory') {
          targetName = `${targetValue} (${targetName})`;
        } else if (targetType === 'domain') {
          targetName = targetValue;
        }
      }

      // Check if limit is reached
      if (applicableTime >= dailyLimit) {
        if (!limitNotificationState.blocked.has(limitKey)) {
          limitNotificationState.blocked.add(limitKey);

          if (notificationsEnabled) {
            chrome.notifications.create(`limit-reached-${limitKey}`, {
              type: 'basic',
              iconUrl: 'icons/icon128.png',
              title: '⛔ Time Limit Reached',
              message: `You've reached your daily limit for ${targetName}. Access will be blocked.`,
              priority: 2
            });
          }
        }
      }
      // Check if approaching limit (5 min warning)
      else if (applicableTime >= alertThreshold && applicableTime < dailyLimit) {
        if (!limitNotificationState.warned.has(limitKey)) {
          limitNotificationState.warned.add(limitKey);

          if (notificationsEnabled) {
            const remainingMs = dailyLimit - applicableTime;
            const remainingMin = Math.ceil(remainingMs / 60000);

            chrome.notifications.create(`limit-warning-${limitKey}`, {
              type: 'basic',
              iconUrl: 'icons/icon128.png',
              title: '⚠️ Time Limit Warning',
              message: `${remainingMin} minutes remaining for ${targetName}`,
              priority: 1
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('Error checking limits:', error);
  }
}

/**
 * Check if current site should be blocked
 */
async function shouldBlockSite(url) {
  try {
    if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
      return { blocked: false };
    }

    const limits = await dbManager.getAllLimits();
    if (!limits || limits.length === 0) return { blocked: false };

    const hostname = new URL(url).hostname.replace('www.', '');
    const todayStats = await getTodayStats();
    const domains = todayStats.domains || {};
    const categories = todayStats.categories || {};

    // Detect category and subcategory for this URL
    const detection = await categoryDetector.detectCategory(url, '');
    const category = detection.category;
    const subcategory = detection.subcategory || 'general';

    // Check all limits
    for (const limit of limits) {
      if (!limit.enabled) continue;
      if (!limit.blockWhenLimitReached) continue;

      const targetType = limit.targetType || 'category';
      const targetValue = limit.targetValue;
      const dailyLimit = limit.dailyLimit;
      let applicableTime = 0;
      let applies = false;

      if (targetType === 'group' && targetValue) {
        // Check if current category belongs to this group
        const groupDef = PRODUCTIVITY_GROUPS[targetValue];
        if (!groupDef || !groupDef.categories.includes(category)) continue;
        groupDef.categories.forEach(cat => {
          applicableTime += categories[cat]?.time || 0;
        });
        applies = true;
      } else if (limit.category !== category) {
        continue;
      } else if (targetType === 'subcategory' && targetValue) {
        if (subcategory !== targetValue) continue;
        applicableTime = categories[category]?.subcategories?.[targetValue]?.time || 0;
        applies = true;
      } else if (targetType === 'domain' && targetValue) {
        if (!hostname.toLowerCase().includes(targetValue.toLowerCase())) continue;
        Object.entries(domains).forEach(([domain, data]) => {
          if (domain.toLowerCase().includes(targetValue.toLowerCase())) {
            applicableTime += data.time || 0;
          }
        });
        applies = true;
      } else {
        applicableTime = categories[category]?.time || 0;
        applies = true;
      }

      if (applies && applicableTime >= dailyLimit) {
        const catInfo = categoryDetector.getAllCategories()[category];
        return {
          blocked: true,
          category: category,
          categoryName: catInfo?.name || category,
          limit: dailyLimit,
          used: applicableTime
        };
      }
    }

    return { blocked: false };
  } catch (error) {
    console.error('Error checking if site should be blocked:', error);
    return { blocked: false };
  }
}

// Check limits every minute
setInterval(checkLimits, 60000);

// Also check when tab is updated
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && tab.url) {
    const blockInfo = await shouldBlockSite(tab.url);
    if (blockInfo.blocked) {
      // Redirect to blocked page
      chrome.tabs.update(tabId, {
        url: chrome.runtime.getURL(`blocked.html?category=${encodeURIComponent(blockInfo.categoryName)}&limit=${blockInfo.limit}&used=${blockInfo.used}`)
      });
    }
  }
});

// Handle message for checking if site is blocked
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHECK_SITE_BLOCKED') {
    shouldBlockSite(message.url).then(result => {
      sendResponse(result);
    });
    return true;
  }
});
