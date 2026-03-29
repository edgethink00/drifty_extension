import { SESSION_STATES, SESSION_TIMEOUTS, PRODUCTIVITY_GROUPS } from '../common/constants.js';
import { generateId, getTodayDate } from '../common/utils.js';
import { categoryDetector } from './category-detector.js';
import { dbManager } from './db-manager.js';
import { serverSync } from './server-sync.js';

// User idle detection threshold (2 minutes in seconds)
const USER_IDLE_THRESHOLD = 120;

// Store recent metadata for URLs (from content script)
const recentMetadata = new Map();

// ========== DEBUG LOGGING (전부 기록, 제한 없음) ==========
let debugSessionLog = [];

function debugLog(event, data = {}) {
  const entry = {
    t: new Date().toISOString(),
    ts: Date.now(),
    event,
    ...data
  };
  debugSessionLog.push(entry);
  console.log(`[DEBUG:Session] ${event}`, JSON.stringify(data));
}

debugLog('MODULE_LOADED', { msg: 'session-tracker.js loaded' });
// ==========================================================

class SessionTracker {
  constructor() {
    this.currentSession = null;
    this.sessionState = SESSION_STATES.IDLE;
    this.lastActivityTime = null;
    this.timeoutId = null;
    this.isUserIdle = false;
    this._sessionEndReasons = {}; // Track why sessions ended
    this._ready = false;
  }

  /**
   * Handle metadata received from content script
   * @param {Object} metadata - Page metadata
   * @param {Object} tab - Chrome tab object
   */
  async handlePageMetadata(metadata, tab) {
    if (!metadata?.url) return;
    debugLog('PAGE_METADATA', {
      url: metadata.url?.substring(0, 100),
      platform: metadata.platform,
      tabId: tab?.id,
      hasCurrentSession: !!this.currentSession
    });

    // Store metadata
    recentMetadata.set(metadata.url, {
      ...metadata,
      receivedAt: Date.now(),
      tabId: tab?.id
    });

    // Clean up old entries (keep last 100)
    if (recentMetadata.size > 100) {
      const oldestKey = recentMetadata.keys().next().value;
      recentMetadata.delete(oldestKey);
    }

    // If this URL matches current session, try to reclassify
    if (this.currentSession &&
        this.currentSession.visits.some(v => v.url === metadata.url)) {
      await this.reclassifyCurrentSession(metadata);
    }

    console.log('[SessionTracker] Received metadata:', {
      url: metadata.url,
      platform: metadata.platform,
      hasYoutube: !!metadata.youtube,
      hasTwitch: !!metadata.twitch,
      hasReddit: !!metadata.reddit
    });
  }

  /**
   * Reclassify current session with new metadata
   */
  async reclassifyCurrentSession(metadata) {
    if (!this.currentSession) return;

    const lastVisit = this.currentSession.visits[this.currentSession.visits.length - 1];
    if (!lastVisit || lastVisit.url !== metadata.url) return;

    // Reclassify with metadata
    const newResult = await categoryDetector.detectCategory(
      lastVisit.url,
      lastVisit.title,
      metadata
    );

    // Only update if different category or higher confidence
    const oldCategory = this.currentSession.category;
    const oldConfidence = this.currentSession.confidence || 0.5;

    if (newResult.category !== oldCategory || newResult.confidence > oldConfidence) {
      debugLog('RECLASSIFY', {
        oldCategory, oldConfidence,
        newCategory: newResult.category, newConfidence: newResult.confidence, method: newResult.method,
        url: metadata.url?.substring(0, 100)
      });
      console.log('[SessionTracker] Reclassifying session:', {
        old: { category: oldCategory, confidence: oldConfidence },
        new: { category: newResult.category, confidence: newResult.confidence, method: newResult.method }
      });

      this.currentSession.category = newResult.category;
      this.currentSession.confidence = newResult.confidence;
      this.currentSession.method = newResult.method;
      
      // Store classification details
      if (newResult.detail) {
        this.currentSession.classificationDetail = newResult.detail;
      }
    }
  }

  /**
   * Get stored metadata for a URL
   */
  getMetadataForUrl(url) {
    return recentMetadata.get(url) || null;
  }

  /**
   * Handle alarm events (called from centralized dispatcher in service-worker.js)
   */
  handleAlarm(alarm) {
    if (!this._ready) return;
    debugLog('ALARM', {
      name: alarm.name,
      hasSession: !!this.currentSession,
      sessionCategory: this.currentSession?.category,
      durationSoFar: this.currentSession ? Math.round((Date.now() - this.currentSession.startTime) / 1000) + 's' : null,
      isUserIdle: this.isUserIdle
    });
    if (alarm.name === 'checkIdle') {
      this.checkIdleTimeout();
    } else if (alarm.name === 'saveSession') {
      this.saveActiveSession();
    }
  }

  /**
   * Initialize session tracker
   */
  async init() {
    debugLog('INIT_START', { idleThreshold: USER_IDLE_THRESHOLD, sessionTimeouts: SESSION_TIMEOUTS });
    await dbManager.init();
    this.setupListeners();
    this._ready = true;
    debugLog('INIT_DONE');
    console.log('Session Tracker initialized');
  }

  /**
   * Setup Chrome API listeners
   */
  setupListeners() {
    // Listen for tab activation
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      debugLog('TAB_ACTIVATED', { tabId: activeInfo.tabId, url: tab?.url?.substring(0, 80) });
      this.handleTabChange(tab);
    });

    // Listen for tab updates (URL changes, title changes)
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.active) {
        debugLog('TAB_UPDATED', { tabId, url: tab?.url?.substring(0, 80) });
        this.handleTabChange(tab);
      }
    });

    // Listen for window focus changes
    chrome.windows.onFocusChanged.addListener(async (windowId) => {
      if (windowId === chrome.windows.WINDOW_ID_NONE) {
        debugLog('WINDOW_FOCUS_LOST', {
          hadSession: !!this.currentSession,
          sessionCategory: this.currentSession?.category,
          sessionDurationSoFar: this.currentSession ? (Date.now() - this.currentSession.startTime) : 0
        });
        // Browser lost focus
        this.handleIdle('window_focus_lost');
      } else {
        debugLog('WINDOW_FOCUS_GAINED', { windowId });
        // Browser gained focus
        const [tab] = await chrome.tabs.query({ active: true, windowId });
        if (tab) {
          this.handleTabChange(tab);
        }
      }
    });

    // Set up Chrome idle detection (2 minutes threshold)
    chrome.idle.setDetectionInterval(USER_IDLE_THRESHOLD);

    // Listen for user idle state changes
    chrome.idle.onStateChanged.addListener((newState) => {
      debugLog('IDLE_STATE_CHANGED', {
        newState,
        hadSession: !!this.currentSession,
        sessionCategory: this.currentSession?.category,
        sessionDurationSoFar: this.currentSession ? (Date.now() - this.currentSession.startTime) : 0
      });
      console.log('User idle state changed:', newState);

      if (newState === 'active') {
        // User became active again
        this.isUserIdle = false;
        this.lastActivityTime = Date.now();
      } else {
        // User is idle or locked
        this.isUserIdle = true;
        if (this.currentSession) {
          console.log('User idle/locked - ending session');
          this.endCurrentSession('idle_api_' + newState);
        }
      }
    });

    // Check for idle state periodically (backup check)
    chrome.alarms.create('checkIdle', { periodInMinutes: 1 });

    // Periodically save active session to prevent data loss
    chrome.alarms.create('saveSession', { periodInMinutes: 1 });

  }

  /**
   * Save active session periodically to prevent data loss
   * Uses Chrome idle API to check actual user activity
   */
  async saveActiveSession() {
    if (!this.currentSession) return;

    // Check actual user idle state using Chrome idle API
    const idleState = await new Promise(resolve => {
      chrome.idle.queryState(USER_IDLE_THRESHOLD, resolve);
    });

    debugLog('SAVE_ACTIVE_CHECK', {
      idleState,
      sessionId: this.currentSession?.id,
      category: this.currentSession?.category,
      durationSoFar: this.currentSession ? (Date.now() - this.currentSession.startTime) : 0,
      visitCount: this.currentSession?.visits?.length
    });

    if (idleState === 'active') {
      // User is actually active (mouse/keyboard input)
      this.lastActivityTime = Date.now();
      this.isUserIdle = false;
    } else {
      // User is idle or locked - end session if still running
      if (!this.isUserIdle) {
        debugLog('SAVE_ACTIVE_ENDING_IDLE', { idleState });
        console.log('User became idle during save check - ending session');
        this.isUserIdle = true;
        await this.endCurrentSession('save_check_idle_' + idleState);
        return;
      }
    }

    // Only save if session still exists (might have been ended above)
    if (!this.currentSession) return;

    // Calculate current duration
    const now = Date.now();
    const currentDuration = now - this.currentSession.startTime;

    // Save session snapshot to database (will be overwritten when session ends)
    const sessionSnapshot = {
      ...this.currentSession,
      endTime: now,
      duration: currentDuration,
      isActive: true  // Mark as active session
    };

    await dbManager.saveSession(sessionSnapshot);

    // Update daily stats with current session included
    await dbManager.calculateDailyStats(this.currentSession.date);

    debugLog('SAVE_ACTIVE_OK', {
      sessionId: this.currentSession.id,
      duration: Math.round(currentDuration / 60000) + 'm',
      durationMs: currentDuration
    });
    console.log('Saved active session:', { duration: Math.round(currentDuration / 60000) + 'm' });
  }

  /**
   * Handle tab change event
   * @param {Object} tab - Chrome tab object
   */
  async handleTabChange(tab) {
    // Check for non-trackable URLs (chrome://, chrome-extension://, new tab, etc.)
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      // End current session when navigating to non-trackable pages
      if (this.currentSession) {
        debugLog('NON_TRACKABLE_URL', {
          url: tab.url?.substring(0, 80),
          sessionCategory: this.currentSession.category,
          sessionDurationSoFar: Date.now() - this.currentSession.startTime
        });
        console.log('Ending session - navigated to non-trackable URL:', tab.url);
        await this.endCurrentSession('non_trackable_url');
      }
      return;
    }

    // Deduplicate rapid calls for the same URL (e.g. onActivated + onUpdated firing together)
    const now = Date.now();
    if (this._lastHandledUrl === tab.url && now - (this._lastHandledTime || 0) < 2000) {
      debugLog('TAB_CHANGE_DEDUP', { url: tab.url?.substring(0, 80), gap: now - (this._lastHandledTime || 0) });
      return;
    }
    this._lastHandledUrl = tab.url;
    this._lastHandledTime = now;

    // Tab change = user activity, reset idle state
    this.isUserIdle = false;

    // Try to get stored metadata for this URL
    const metadata = this.getMetadataForUrl(tab.url);

    // Classify with metadata if available
    const classificationResult = await categoryDetector.detectCategory(tab.url, tab.title, metadata);
    const category = classificationResult.category || classificationResult;

    console.log('Tab change:', { 
      url: tab.url, 
      title: tab.title, 
      category,
      confidence: classificationResult.confidence,
      method: classificationResult.method,
      hasMetadata: !!metadata
    });

    // Record usage pattern for server with title for keyword extraction (async, don't await)
    serverSync.recordUsagePattern(tab.url, tab.title || '', category).catch(err => {
      console.error('Error recording usage pattern:', err);
    });

    // Upload visit to server in real-time (async, don't await)
    serverSync.uploadVisit({
      url: tab.url,
      title: tab.title || '',
      category,
      confidence: classificationResult.confidence,
      timestamp: now
    }).catch(err => {
      console.error('Error uploading visit:', err);
    });

    // Update last activity time
    this.lastActivityTime = now;

    // Check if this visit should start a new session or continue existing
    await this.processVisit({
      url: tab.url,
      title: tab.title,
      timestamp: now,
      category,
      confidence: classificationResult.confidence,
      method: classificationResult.method
    });

    // Reset timeout
    this.resetTimeout();
  }

  /**
   * Process a page visit
   * @param {Object} visit - Visit object with url, title, timestamp, category
   */
  async processVisit(visit) {
    const { category, timestamp } = visit;

    if (this.sessionState === SESSION_STATES.IDLE) {
      debugLog('PROCESS_VISIT_NEW', { category, url: visit.url?.substring(0, 80), reason: 'state_idle' });
      // Start new session
      await this.startNewSession(visit);
    } else if (this.currentSession) {
      // Check if we should continue current session or start new one
      const timeSinceLastVisit = timestamp - (this.currentSession.lastVisitTime || this.currentSession.startTime);

      if (category === this.currentSession.category) {
        // Same category - continue CORE session
        debugLog('PROCESS_VISIT_CONTINUE', { category, timeSinceLastVisit, url: visit.url?.substring(0, 80) });
        this.sessionState = SESSION_STATES.CORE;
        this.addVisitToCurrentSession(visit);
      } else if (categoryDetector.areRelated(category, this.currentSession.category)) {
        // Related category - EXTENDED session
        if (timeSinceLastVisit < SESSION_TIMEOUTS.EXTENDED) {
          debugLog('PROCESS_VISIT_EXTENDED', { newCat: category, oldCat: this.currentSession.category, timeSinceLastVisit });
          this.sessionState = SESSION_STATES.EXTENDED;
          this.addVisitToCurrentSession(visit);
        } else {
          debugLog('PROCESS_VISIT_TIMEOUT_RELATED', { newCat: category, oldCat: this.currentSession.category, timeSinceLastVisit, timeout: SESSION_TIMEOUTS.EXTENDED });
          // Too much time passed - start new session
          await this.endCurrentSession('related_timeout');
          await this.startNewSession(visit);
        }
      } else {
        // Different unrelated category - end current and start new
        debugLog('PROCESS_VISIT_NEW_CATEGORY', {
          oldCat: this.currentSession.category,
          newCat: category,
          oldSessionDuration: timestamp - this.currentSession.startTime,
          url: visit.url?.substring(0, 80)
        });
        await this.endCurrentSession('category_change_' + category);
        await this.startNewSession(visit);
      }
    }
  }

  /**
   * Start a new session
   * @param {Object} visit - Initial visit object
   */
  async startNewSession(visit) {
    // End current session if exists
    if (this.currentSession) {
      await this.endCurrentSession();
    }

    const sessionId = generateId();

    this.currentSession = {
      id: sessionId,
      category: visit.category,
      confidence: visit.confidence || 0.5,
      method: visit.method || 'unknown',
      startTime: visit.timestamp,
      lastVisitTime: visit.timestamp,
      endTime: null,
      duration: 0,
      visits: [visit],
      date: getTodayDate(),
      blocked: false,
      deviceSource: 'local'
    };

    this.sessionState = SESSION_STATES.CORE;

    debugLog('SESSION_STARTED', {
      sessionId: this.currentSession.id,
      category: this.currentSession.category,
      confidence: this.currentSession.confidence,
      method: this.currentSession.method,
      url: visit.url?.substring(0, 80),
      time: new Date(visit.timestamp).toISOString()
    });

    console.log('Started new session:', {
      id: this.currentSession.id,
      category: this.currentSession.category,
      confidence: this.currentSession.confidence,
      method: this.currentSession.method
    });

    // Check if this category has limits
    await this.checkLimits();
  }

  /**
   * Add visit to current session
   * @param {Object} visit - Visit object
   */
  addVisitToCurrentSession(visit) {
    if (!this.currentSession) return;

    // Skip duplicate: same URL as the last visit
    const lastVisit = this.currentSession.visits[this.currentSession.visits.length - 1];
    if (lastVisit && lastVisit.url === visit.url) {
      debugLog('VISIT_DEDUP', { url: visit.url?.substring(0, 80) });
      this.currentSession.lastVisitTime = visit.timestamp;
      if (visit.title) lastVisit.title = visit.title;
      return;
    }

    this.currentSession.visits.push(visit);
    this.currentSession.lastVisitTime = visit.timestamp;

    debugLog('VISIT_ADDED', {
      url: visit.url?.substring(0, 80),
      category: visit.category,
      totalVisits: this.currentSession.visits.length,
      sessionDurationSoFar: visit.timestamp - this.currentSession.startTime
    });
    console.log('Added visit to session:', visit);
  }

  /**
   * End current session and save to database
   */
  async endCurrentSession(reason = 'unknown') {
    if (!this.currentSession) {
      debugLog('END_SESSION_NOOP', { reason });
      return;
    }

    // Save session to local variable to prevent race conditions
    const sessionToSave = this.currentSession;

    // Reset session immediately to prevent double-ending
    this.currentSession = null;
    this.sessionState = SESSION_STATES.IDLE;

    const now = Date.now();
    // Use current time as endTime, not lastVisitTime
    // This ensures time spent on a single page is counted
    sessionToSave.endTime = now;
    sessionToSave.duration = sessionToSave.endTime - sessionToSave.startTime;

    // Mark session as completed (not active)
    sessionToSave.isActive = false;

    // Track end reason
    sessionToSave._endReason = reason;

    debugLog('END_SESSION', {
      reason,
      sessionId: sessionToSave.id,
      category: sessionToSave.category,
      durationMs: sessionToSave.duration,
      durationMin: Math.round(sessionToSave.duration / 60000 * 10) / 10,
      visitCount: sessionToSave.visits?.length,
      startTime: new Date(sessionToSave.startTime).toISOString(),
      endTime: new Date(sessionToSave.endTime).toISOString()
    });

    console.log('Ending session:', sessionToSave);

    // Check privacy mode
    const settings = await dbManager.getSettings();
    const isAdultContent = sessionToSave.category === 'adult';
    const shouldDelete = isAdultContent && settings.privacyMode?.enabled && settings.privacyMode?.autoDelete;

    if (!shouldDelete) {
      // Save completed session to database
      await dbManager.saveSession(sessionToSave);

      // Update daily stats
      await dbManager.calculateDailyStats(sessionToSave.date);
    } else {
      console.log('Adult content detected - session not saved (privacy mode)');
    }
  }

  /**
   * Handle idle state (no activity)
   */
  async handleIdle(reason = 'unknown') {
    debugLog('HANDLE_IDLE', {
      reason,
      hadSession: !!this.currentSession,
      sessionCategory: this.currentSession?.category,
      sessionDurationSoFar: this.currentSession ? (Date.now() - this.currentSession.startTime) : 0
    });
    if (this.currentSession) {
      await this.endCurrentSession('idle_' + reason);
    }
    this.sessionState = SESSION_STATES.IDLE;
  }

  /**
   * Check for idle timeout
   */
  checkIdleTimeout() {
    if (!this.lastActivityTime) return;

    const now = Date.now();
    const timeSinceActivity = now - this.lastActivityTime;

    // Determine timeout based on session state
    let timeout = SESSION_TIMEOUTS.IDLE;
    if (this.sessionState === SESSION_STATES.CORE) {
      timeout = SESSION_TIMEOUTS.CORE;
    } else if (this.sessionState === SESSION_STATES.EXTENDED) {
      timeout = SESSION_TIMEOUTS.EXTENDED;
    }

    if (timeSinceActivity > timeout) {
      debugLog('IDLE_TIMEOUT_REACHED', { timeSinceActivity, timeout, state: this.sessionState });
      console.log('Idle timeout reached');
      this.handleIdle('timeout_check');
    }
  }

  /**
   * Reset timeout timer
   */
  resetTimeout() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    // Set timeout based on current session state
    let timeout = SESSION_TIMEOUTS.IDLE;
    if (this.sessionState === SESSION_STATES.CORE) {
      timeout = SESSION_TIMEOUTS.CORE;
    } else if (this.sessionState === SESSION_STATES.EXTENDED) {
      timeout = SESSION_TIMEOUTS.EXTENDED;
    }

    this.timeoutId = setTimeout(() => {
      debugLog('TIMEOUT_FIRED', { timeout, state: this.sessionState });
      this.handleIdle('timeout_fired');
    }, timeout);
  }

  /**
   * Check if current category has time limits
   */
  async checkLimits() {
    if (!this.currentSession) return;

    const category = this.currentSession.category;
    const subcategory = this.currentSession.subcategory || 'general';
    const allLimits = await dbManager.getAllLimits();
    if (!allLimits || allLimits.length === 0) return;

    // Filter limits relevant to this session's category (including group limits)
    const relevantLimits = allLimits.filter(l => {
      if (!l.enabled) return false;
      if (l.targetType === 'group' && l.targetValue) {
        const groupDef = PRODUCTIVITY_GROUPS[l.targetValue];
        return groupDef && groupDef.categories.includes(category);
      }
      return l.category === category;
    });
    if (relevantLimits.length === 0) return;

    const stats = await dbManager.getDailyStats(getTodayDate());

    for (const limit of relevantLimits) {
      const targetType = limit.targetType || 'category';
      let applicableTime = 0;

      if (targetType === 'group' && limit.targetValue) {
        const groupDef = PRODUCTIVITY_GROUPS[limit.targetValue];
        if (groupDef) {
          groupDef.categories.forEach(cat => {
            applicableTime += stats?.categories?.[cat]?.time || 0;
          });
        }
      } else if (targetType === 'subcategory' && limit.targetValue) {
        if (subcategory !== limit.targetValue) continue;
        applicableTime = stats?.categories?.[category]?.subcategories?.[limit.targetValue]?.time || 0;
      } else if (targetType === 'domain' && limit.targetValue) {
        const domain = this.currentSession.domain || '';
        if (!domain.toLowerCase().includes(limit.targetValue.toLowerCase())) continue;
        const domains = stats?.domains || {};
        Object.entries(domains).forEach(([d, data]) => {
          if (d.toLowerCase().includes(limit.targetValue.toLowerCase())) {
            applicableTime += data.time || 0;
          }
        });
      } else {
        applicableTime = stats?.categories?.[category]?.time || 0;
      }

      if (applicableTime >= limit.dailyLimit) {
        console.log('Time limit reached:', limit.id);
        this.currentSession.blocked = true;
        await this.showLimitReached(category, applicableTime, limit.dailyLimit);
        return;
      } else if (limit.alertAt && applicableTime >= limit.dailyLimit * limit.alertAt) {
        const remaining = limit.dailyLimit - applicableTime;
        await this.showLimitWarning(category, remaining);
      }
    }
  }

  /**
   * Show limit reached notification
   * @param {string} category - Category name
   * @param {number} timeUsed - Time used in ms
   * @param {number} limit - Limit in ms
   */
  async showLimitReached(category, timeUsed, limit) {
    const categoryInfo = categoryDetector.getCategoryInfo(category);

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Time Limit Reached',
      message: `You've reached your daily limit for ${categoryInfo.name}`,
      priority: 2
    });

    // TODO: Show blocking page
  }

  /**
   * Show limit warning notification
   * @param {string} category - Category name
   * @param {number} remaining - Remaining time in ms
   */
  async showLimitWarning(category, remaining) {
    const categoryInfo = categoryDetector.getCategoryInfo(category);
    const minutes = Math.floor(remaining / 60000);

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Time Limit Warning',
      message: `You have ${minutes} minutes left for ${categoryInfo.name}`,
      priority: 1
    });
  }

  /**
   * Get current session info
   * @returns {Object} Current session data
   */
  getCurrentSession() {
    return {
      session: this.currentSession,
      state: this.sessionState,
      lastActivityTime: this.lastActivityTime
    };
  }

  /**
   * Get debug data for diagnostics
   */
  getDebugData() {
    return {
      debugLog: debugSessionLog,
      currentState: {
        sessionState: this.sessionState,
        isUserIdle: this.isUserIdle,
        lastActivityTime: this.lastActivityTime ? new Date(this.lastActivityTime).toISOString() : null,
        hasCurrentSession: !!this.currentSession,
        currentSessionId: this.currentSession?.id,
        currentSessionCategory: this.currentSession?.category,
        currentSessionStartTime: this.currentSession ? new Date(this.currentSession.startTime).toISOString() : null,
        currentSessionDuration: this.currentSession ? (Date.now() - this.currentSession.startTime) : 0,
        currentSessionVisitCount: this.currentSession?.visits?.length || 0
      },
      stats: {
        totalEvents: debugSessionLog.length,
        sessionStarts: debugSessionLog.filter(e => e.event === 'SESSION_STARTED').length,
        sessionEnds: debugSessionLog.filter(e => e.event === 'END_SESSION').length,
        endReasons: debugSessionLog
          .filter(e => e.event === 'END_SESSION')
          .reduce((acc, e) => {
            acc[e.reason] = (acc[e.reason] || 0) + 1;
            return acc;
          }, {}),
        focusLost: debugSessionLog.filter(e => e.event === 'WINDOW_FOCUS_LOST').length,
        idleEvents: debugSessionLog.filter(e => e.event === 'IDLE_STATE_CHANGED').length
      }
    };
  }
}

// Export singleton instance
export const sessionTracker = new SessionTracker();
