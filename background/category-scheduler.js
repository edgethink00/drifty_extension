/**
 * Category Scheduler
 *
 * 30분마다 미분류 방문을 서버에 전송하여 카테고리 분류
 * 트래픽 분산을 위해 랜덤 오프셋 사용
 * 실패 시 exponential backoff으로 재시도
 */

import { SERVER_CONFIG } from '../common/server-config.js';
import { dbManager } from './db-manager.js';
import { getMultipurposeDomains } from '../common/well-known-domains.js';
import { sessionTracker } from './session-tracker.js';
import { normalizeDomain } from '../common/utils.js';

class CategoryScheduler {
  constructor() {
    this.alarmName = 'categorize-batch';
    this.retryAlarmName = 'categorize-retry';
    this.isProcessing = false;

    // Backoff constants
    this.BASE_BACKOFF_MS = 60_000;      // 1 minute
    this.MAX_BACKOFF_MS = 900_000;      // 15 minutes (cap)
    this.MAX_CONSECUTIVE_FAILURES = 10;
    this.BATCH_RETRY_DELAY_MS = 2000;   // 2 seconds for immediate batch retry
    this._ready = false;
  }

  // ============================================
  // Server Health State Management
  // ============================================

  /**
   * Get server health state from settings
   * @returns {Promise<Object>} Server health state with defaults
   */
  async _getServerHealth() {
    const settings = await dbManager.getSettings();
    const scheduler = settings.categoryScheduler || {};
    return {
      consecutiveFailures: 0,
      lastFailureTime: null,
      lastSuccessTime: null,
      currentBackoffMs: 0,
      nextRetryTime: null,
      ...(scheduler.serverHealth || {})
    };
  }

  /**
   * Save server health state to settings
   * @param {Object} health - Health state to save
   */
  async _saveServerHealth(health) {
    const settings = await dbManager.getSettings();
    if (!settings.categoryScheduler) {
      settings.categoryScheduler = { offsetMinutes: 0, lastRun: null };
    }
    settings.categoryScheduler.serverHealth = health;
    await dbManager.saveSettings(settings);
  }

  /**
   * Update server health after a processing cycle
   * @param {boolean} success - Whether the cycle had any successful batches
   */
  async _updateServerHealth(success) {
    const health = await this._getServerHealth();

    if (success) {
      health.consecutiveFailures = 0;
      health.currentBackoffMs = 0;
      health.nextRetryTime = null;
      health.lastSuccessTime = Date.now();
    } else {
      health.consecutiveFailures++;
      health.lastFailureTime = Date.now();
      health.currentBackoffMs = this._calculateBackoff(health.consecutiveFailures);
      health.nextRetryTime = Date.now() + health.currentBackoffMs;
    }

    await this._saveServerHealth(health);
    return health;
  }

  /**
   * Calculate backoff delay with jitter
   * @param {number} failures - Number of consecutive failures
   * @returns {number} Backoff delay in milliseconds
   */
  _calculateBackoff(failures) {
    if (failures <= 0) return 0;
    const baseDelay = Math.min(
      this.BASE_BACKOFF_MS * Math.pow(2, failures - 1),
      this.MAX_BACKOFF_MS
    );
    // Add random jitter: 0% to 50% of base delay
    const jitter = Math.random() * baseDelay * 0.5;
    return Math.round(baseDelay + jitter);
  }

  // ============================================
  // Retry Scheduling
  // ============================================

  /**
   * Schedule a retry with exponential backoff
   * Reads already-persisted health state (from _updateServerHealth) and creates alarm.
   */
  async _scheduleRetry() {
    const health = await this._getServerHealth();

    if (health.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
      console.log('[CategoryScheduler] Max retry attempts reached, waiting for next periodic cycle');
      return;
    }

    const backoffMs = health.currentBackoffMs || this._calculateBackoff(health.consecutiveFailures);
    const delayMinutes = Math.max(backoffMs / 60000, 0.5); // Chrome minimum ~30s

    // Clear existing retry alarm, then create new one
    await chrome.alarms.clear(this.retryAlarmName);
    chrome.alarms.create(this.retryAlarmName, {
      delayInMinutes: delayMinutes
    });

    console.log(`[CategoryScheduler] Retry scheduled in ${delayMinutes.toFixed(1)} minutes (failure #${health.consecutiveFailures})`);
  }

  /**
   * Schedule a short follow-up to process remaining visits promptly
   * Used after partial success or server recovery
   * @param {number} delayMinutes - Delay before follow-up (default 0.5)
   */
  async _scheduleFollowUp(delayMinutes = 0.5) {
    await chrome.alarms.clear(this.retryAlarmName);
    chrome.alarms.create(this.retryAlarmName, { delayInMinutes: delayMinutes });
    console.log(`[CategoryScheduler] Follow-up scheduled in ${delayMinutes} minutes`);
  }

  /**
   * Recover retry state after service worker restart
   */
  async _recoverRetryState() {
    const health = await this._getServerHealth();

    if (!health.nextRetryTime) return;

    const now = Date.now();

    if (health.nextRetryTime <= now) {
      // Retry was pending when service worker died — run now
      console.log('[CategoryScheduler] Recovering missed retry, processing now');
      // Use setTimeout to avoid blocking init()
      setTimeout(() => this.processBatch(), 1000);
    } else {
      // Retry is still in the future — re-create alarm with remaining time
      const remainingMs = health.nextRetryTime - now;
      const delayMinutes = Math.max(remainingMs / 60000, 0.5);

      await chrome.alarms.clear(this.retryAlarmName);
      chrome.alarms.create(this.retryAlarmName, {
        delayInMinutes: delayMinutes
      });

      console.log(`[CategoryScheduler] Recovered retry alarm, ${delayMinutes.toFixed(1)} minutes remaining`);
    }
  }

  /**
   * Handle alarm events (called from centralized dispatcher in service-worker.js)
   */
  handleAlarm(alarm) {
    if (!this._ready) return;
    if (alarm.name === this.alarmName || alarm.name === this.retryAlarmName) {
      this.processBatch();
    }
  }

  // ============================================
  // Initialization
  // ============================================

  /**
   * Initialize scheduler
   */
  async init() {
    // Get or generate random offset (0-30 minutes)
    const settings = await dbManager.getSettings();

    if (!settings.categoryScheduler) {
      // First time - generate random offset
      const randomOffsetMinutes = Math.floor(Math.random() * 30);

      settings.categoryScheduler = {
        offsetMinutes: randomOffsetMinutes,
        lastRun: null
      };

      await dbManager.saveSettings(settings);

      console.log(`[CategoryScheduler] Initialized with ${randomOffsetMinutes} minute offset`);
    }

    // Create alarm with periodic interval (30 minutes)
    chrome.alarms.create(this.alarmName, {
      delayInMinutes: settings.categoryScheduler.offsetMinutes || 0,
      periodInMinutes: 30
    });

    // Recover retry state after service worker restart
    await this._recoverRetryState();

    // Quick first classification for new installs or stale SW restarts
    const timeSinceLastRun = settings.categoryScheduler.lastRun
      ? Date.now() - settings.categoryScheduler.lastRun
      : Infinity;

    if (timeSinceLastRun > 5 * 60 * 1000) {
      setTimeout(() => this.processBatch(), 10_000); // 10s delay for other inits to finish
    }

    this._ready = true;
    console.log('[CategoryScheduler] Initialized and alarm set');
  }

  // ============================================
  // Batch Processing
  // ============================================

  /**
   * Process batch categorization
   */
  async processBatch() {
    if (this.isProcessing) {
      console.log('[CategoryScheduler] Already processing, skipping');
      return;
    }

    this.isProcessing = true;

    try {
      console.log('[CategoryScheduler] Starting batch categorization...');

      // Read previous health state for recovery detection
      const previousHealth = await this._getServerHealth();
      const previousFailures = previousHealth.consecutiveFailures;

      // 1. Collect uncategorized visits from sessions
      const uncategorizedVisits = await this.collectUncategorizedVisits();

      if (uncategorizedVisits.length === 0) {
        console.log('[CategoryScheduler] No visits needing classification found');

        // Clear retry state if nothing to process
        if (previousFailures > 0) {
          await this._updateServerHealth(true);
          await chrome.alarms.clear(this.retryAlarmName);
        }

        // Log sample of all sessions for debugging
        const allSessions = await dbManager.getAllSessions();
        const sampleSessions = allSessions.slice(0, 5).map(s => ({
          id: s.id,
          category: s.category,
          url: s.visits?.[0]?.url || 'no-url',
          date: s.date
        }));
        console.log('[CategoryScheduler] Sample sessions:', sampleSessions);
        return;
      }

      console.log(`[CategoryScheduler] Found ${uncategorizedVisits.length} visits needing classification`);
      console.log('[CategoryScheduler] Sample visits needing classification:', uncategorizedVisits.slice(0, 3));

      // 2. Process in batches (nginx timeout=300s, LLM ~130ms/URL → 50 URLs ~10s)
      const BATCH_SIZE = 50;
      let totalProcessed = 0;
      let consecutiveFailures = 0;
      let hadAnySuccess = false;
      let hadAnyFailure = false;
      const MAX_FAILURES = 3;

      for (let i = 0; i < uncategorizedVisits.length; i += BATCH_SIZE) {
        const batch = uncategorizedVisits.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(uncategorizedVisits.length / BATCH_SIZE);
        console.log(`[CategoryScheduler] Processing batch ${batchNum}/${totalBatches} (${batch.length} visits)`);

        let results = await this.sendToServer(batch);

        // Immediate retry once on failure
        if (!results) {
          console.log(`[CategoryScheduler] Batch ${batchNum} failed, retrying in ${this.BATCH_RETRY_DELAY_MS}ms...`);
          await new Promise(r => setTimeout(r, this.BATCH_RETRY_DELAY_MS));
          results = await this.sendToServer(batch);
        }

        if (!results) {
          consecutiveFailures++;
          hadAnyFailure = true;
          console.error(`[CategoryScheduler] Batch ${batchNum} failed after retry (${consecutiveFailures}/${MAX_FAILURES})`);
          if (consecutiveFailures >= MAX_FAILURES) {
            console.error('[CategoryScheduler] Too many consecutive failures, stopping');
            break;
          }
          continue; // Skip failed batch — visits remain uncategorized in DB for next cycle
        }

        consecutiveFailures = 0; // Reset on success
        hadAnySuccess = true;
        console.log(`[CategoryScheduler] Received ${results.length} classification results`);

        // 3. Update sessions and cache
        await this.applyResults(results, batch);
        totalProcessed += results.length;
      }

      // 4. Update server health and manage retry scheduling
      if (hadAnySuccess) {
        await this._updateServerHealth(true);
        await chrome.alarms.clear(this.retryAlarmName);
      } else if (uncategorizedVisits.length > 0) {
        // All batches failed
        await this._updateServerHealth(false);
        await this._scheduleRetry();
      }

      // 5. Recalculate daily stats for dates that had changes
      if (totalProcessed > 0) {
        await this.recalculateDailyStats();
      }

      // 6. Check remaining and schedule follow-up if needed
      const remainingUncategorized = await this.collectUncategorizedVisits();
      if (remainingUncategorized.length > 0) {
        console.log(`[CategoryScheduler] ${remainingUncategorized.length} visits still need classification`);

        // Schedule follow-up: quickly after recovery, or let backoff handle if all failed
        if (hadAnySuccess && hadAnyFailure) {
          // Partial success — some batches failed, retry sooner than 30min
          await this._scheduleFollowUp(2);
        } else if (hadAnySuccess && previousFailures > 0) {
          // Server just recovered — process backlog promptly
          await this._scheduleFollowUp(0.5);
        }
      } else {
        console.log('[CategoryScheduler] All sessions categorized!');
      }

      console.log(`[CategoryScheduler] Total processed: ${totalProcessed} visits`);

      // 7. Update last run time
      const settings = await dbManager.getSettings();
      settings.categoryScheduler.lastRun = Date.now();
      await dbManager.saveSettings(settings);

      console.log('[CategoryScheduler] Batch categorization complete');

    } catch (error) {
      console.error('[CategoryScheduler] Error in batch processing:', error);
      // Schedule retry on unexpected errors too
      try {
        await this._updateServerHealth(false);
        await this._scheduleRetry();
      } catch (retryError) {
        console.error('[CategoryScheduler] Failed to schedule retry:', retryError);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Collect uncategorized visits from recent sessions
   * @param {Array<string>|null} filterDates - If provided, only collect visits from these dates (YYYY-MM-DD)
   * @returns {Promise<Array>} Array of visits needing classification
   */
  async collectUncategorizedVisits(filterDates = null) {
    const visits = [];
    const seenUrls = new Set();

    // Get ALL sessions (including history data older than 7 days)
    const sessions = await dbManager.getAllSessions();

    // Categories that need server classification OR sessions without subcategory
    const needsClassification = ['uncategorized', 'needs_server_classification', 'other'];

    // Multipurpose sites that should always be sent to server for per-visit classification
    const multipurposeDomains = getMultipurposeDomains();

    // For multipurpose: key = sessionId:url (each session classified individually by LLM)
    // For regular: key = domain (one classification per domain, applied via cache)

    for (const session of sessions) {
      // Filter by dates if specified
      if (filterDates && !filterDates.includes(session.date)) continue;

      // Skip if already properly classified with subcategory
      const hasCategory = !needsClassification.includes(session.category);
      const hasSubcategory = session.subcategory && session.subcategory !== null;
      if (hasCategory && hasSubcategory) continue;

      // Add visits from this session
      for (const visit of session.visits || []) {
        const visitDomain = this.extractDomain(visit.url);
        if (!visitDomain) continue;

        const isMultipurpose = multipurposeDomains.includes(visitDomain);

        // Multipurpose: per session per URL (each session needs its own LLM classification)
        // Regular: per domain (one classification, applied to all sessions via cache)
        const uniqueKey = isMultipurpose ? `${session.id}:${visit.url}` : visitDomain;

        if (seenUrls.has(uniqueKey)) continue;

        seenUrls.add(uniqueKey);

        // Try to get metadata from content script (only available for real-time tracking)
        const urlMetadata = sessionTracker.getMetadataForUrl(visit.url);
        const visitData = {
          id: `visit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          sessionId: session.id,  // Separate field for reliable session lookup
          url: visit.url,
          title: visit.title || '',
          timestamp: Math.floor(visit.timestamp || Date.now())  // Convert to integer (server requires int)
        };

        // Include metadata if available (for multipurpose sites)
        if (urlMetadata && isMultipurpose) {
          visitData.metadata = {
            ogType: urlMetadata.ogType || null,
            ogSiteName: urlMetadata.ogSiteName || null,
            description: urlMetadata.description || null,
            keywords: urlMetadata.keywords || null,
            schemaType: urlMetadata.schemaType || null,
            youtube: urlMetadata.youtube || null,
            twitch: urlMetadata.twitch || null,
            reddit: urlMetadata.reddit || null
          };
        }

        visits.push(visitData);
      }
    }

    return visits;
  }

  /**
   * Send visits to server for classification
   * @param {Array} visits - Visits to classify
   * @returns {Promise<Array|null>} Classification results or null on failure
   */
  async sendToServer(visits) {
    try {
      const settings = await dbManager.getSettings();
      const anonymousId = settings.anonymousId || 'unknown';

      // Strip sessionId from visits before sending (not in server model)
      const serverVisits = visits.map(({ sessionId, ...rest }) => rest);
      // metadata field is kept - server accepts it optionally
      const requestBody = {
        visits: serverVisits,
        anonymousId: anonymousId
      };

      console.log('[CategoryScheduler] Sending to server:', {
        url: `${SERVER_CONFIG.BASE_URL}/detect-categories-batch`,
        visitsCount: visits.length,
        sampleVisit: visits[0],
        anonymousId: anonymousId
      });

      const response = await fetch(
        `${SERVER_CONFIG.BASE_URL}/detect-categories-batch?detailed=true`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        }
      );

      if (!response.ok) {
        // Log the error response body for debugging
        const errorText = await response.text();
        console.error('[CategoryScheduler] Server error response:');
        console.error('  Status:', response.status, response.statusText);
        console.error('  Body:', errorText);

        // Try to parse as JSON for validation errors
        try {
          const errorJson = JSON.parse(errorText);
          console.error('  Parsed error:', JSON.stringify(errorJson, null, 2));
        } catch (e) {
          // Not JSON, already logged as text
        }

        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('[CategoryScheduler] Server response:', {
        resultsCount: data.results?.length || 0,
        sampleResult: data.results?.[0]
      });
      return data.results;

    } catch (error) {
      console.error('[CategoryScheduler] Server request error:', error);
      return null;
    }
  }

  /**
   * Apply classification results to sessions and cache
   * @param {Array} results - Classification results from server
   * @param {Array} originalVisits - Original visits sent to server (for URL mapping)
   */
  async applyResults(results, originalVisits) {
    // Create a map of id -> original visit for quick lookup
    const visitMap = new Map();
    for (const visit of originalVisits) {
      visitMap.set(visit.id, visit);
    }

    // Multipurpose sites that should NOT be cached (each URL can have different category)
    const multipurposeDomains = getMultipurposeDomains();

    // Group results by domain for cache updates (non-multipurpose only)
    const cacheUpdates = {};
    // Direct session updates for multipurpose sites
    const sessionUpdates = new Map(); // sessionId -> { url -> {category, subcategory} }

    for (const result of results) {
      // Get original visit by ID
      const originalVisit = visitMap.get(result.id);
      if (!originalVisit) {
        console.warn(`[CategoryScheduler] No original visit found for result ID: ${result.id}`);
        continue;
      }

      // Get session ID from original visit's separate field
      const sessionId = originalVisit.sessionId;
      const domain = this.extractDomain(originalVisit.url);

      // Check if this is a multipurpose domain
      const isMultipurpose = domain && multipurposeDomains.includes(domain);

      if (isMultipurpose) {
        // For multipurpose sites: store per-URL classification for session update
        if (!sessionUpdates.has(sessionId)) {
          sessionUpdates.set(sessionId, new Map());
        }
        sessionUpdates.get(sessionId).set(originalVisit.url, {
          category: result.category,
          subcategory: result.subcategory || 'general',
          confidence: result.confidence
        });
      } else {
        // For regular sites: update cache (one category per domain)
        if (domain && !cacheUpdates[domain]) {
          cacheUpdates[domain] = {
            category: result.category,
            subcategory: result.subcategory || 'general',
            confidence: result.confidence,
            lastUpdated: Date.now()
          };
        }
      }
    }

    // Bulk save to cache (non-multipurpose only)
    if (Object.keys(cacheUpdates).length > 0) {
      await dbManager.saveDomainCategories(cacheUpdates);
      console.log(`[CategoryScheduler] Updated cache for ${Object.keys(cacheUpdates).length} domains`);

      // Update ALL sessions with these domains
      await this.reclassifySessionsFromCache(Object.keys(cacheUpdates));
    }

    // Update multipurpose sessions directly (don't use cache)
    if (sessionUpdates.size > 0) {
      await this.updateMultipurposeSessions(sessionUpdates);
      console.log(`[CategoryScheduler] Updated ${sessionUpdates.size} multipurpose sessions`);
    }
  }

  /**
   * Update multipurpose sessions with per-URL classifications
   * @param {Map} sessionUpdates - Map of sessionId -> Map(url -> {category, subcategory})
   */
  async updateMultipurposeSessions(sessionUpdates) {
    console.log(`[CategoryScheduler] updateMultipurposeSessions called with ${sessionUpdates.size} sessions`);

    // Get all sessions once for efficiency
    const allSessions = await dbManager.getAllSessions();
    const sessionMap = new Map();
    for (const session of allSessions) {
      sessionMap.set(session.id, session);
    }

    let updatedCount = 0;
    for (const [sessionId, urlClassifications] of sessionUpdates.entries()) {
      console.log(`[CategoryScheduler] Processing session ${sessionId} with ${urlClassifications.size} URL classifications`);

      // Get the session from map
      const session = sessionMap.get(sessionId);
      if (!session) {
        console.warn(`[CategoryScheduler] Session ${sessionId} not found in sessionMap`);
        continue;
      }

      console.log(`[CategoryScheduler] Session ${sessionId} before update:`, {
        category: session.category,
        subcategory: session.subcategory,
        urls: Array.from(urlClassifications.keys()).slice(0, 3)
      });

      // Count occurrences of each category:subcategory combination
      const categoryCounts = new Map();
      for (const [url, classification] of urlClassifications.entries()) {
        const key = `${classification.category}:${classification.subcategory || 'general'}`;
        categoryCounts.set(key, (categoryCounts.get(key) || 0) + 1);
        console.log(`[CategoryScheduler]   URL: ${url} → ${key}`);
      }

      console.log(`[CategoryScheduler] Category counts:`, Object.fromEntries(categoryCounts));

      // Use the most common category:subcategory
      let maxCount = 0;
      let primaryCategory = null;
      let primarySubcategory = null;

      for (const [key, count] of categoryCounts.entries()) {
        if (count > maxCount) {
          maxCount = count;
          const [cat, subcat] = key.split(':');
          primaryCategory = cat;
          primarySubcategory = subcat;
        }
      }

      // Update session with primary classification
      if (primaryCategory) {
        session.category = primaryCategory;
        session.subcategory = primarySubcategory;
        await dbManager.saveSession(session);
        updatedCount++;
        console.log(`[CategoryScheduler] Updated session ${sessionId}: ${primaryCategory}:${primarySubcategory || 'general'}`);
      } else {
        console.warn(`[CategoryScheduler] No primary category found for session ${sessionId}`);
      }
    }

    console.log(`[CategoryScheduler] updateMultipurposeSessions completed: ${updatedCount}/${sessionUpdates.size} sessions updated`);
  }

  /**
   * Reclassify all sessions needing classification that match cached domains
   * @param {Array<string>} domains - Domains to reclassify
   */
  async reclassifySessionsFromCache(domains) {
    const allSessions = await dbManager.getAllSessions();
    let reclassifiedCount = 0;

    // Categories that need server classification OR sessions without subcategory
    const needsClassification = ['uncategorized', 'needs_server_classification', 'other'];

    for (const session of allSessions) {
      // Skip if already properly categorized with subcategory
      const hasCategory = !needsClassification.includes(session.category);
      const hasSubcategory = session.subcategory && session.subcategory !== null;
      if (hasCategory && hasSubcategory) continue;

      // Check if this session's domain is in the cache
      const sessionUrl = session.visits?.[0]?.url;
      if (!sessionUrl) continue;

      const sessionDomain = this.extractDomain(sessionUrl);
      if (!sessionDomain || !domains.includes(sessionDomain)) continue;

      // Get category from cache
      const cached = await dbManager.getDomainCategory(sessionDomain);
      if (!cached) continue;

      // Update session
      session.category = cached.category;
      session.subcategory = cached.subcategory || 'general';
      session.confidence = cached.confidence;
      await dbManager.saveSession(session);
      reclassifiedCount++;
    }

    if (reclassifiedCount > 0) {
      console.log(`[CategoryScheduler] Reclassified ${reclassifiedCount} sessions from cache`);
    }
  }

  /**
   * Recalculate daily stats for affected dates
   */
  async recalculateDailyStats() {
    // Get unique dates from ALL sessions (including history data)
    const sessions = await dbManager.getAllSessions();
    const dates = new Set();

    for (const session of sessions) {
      if (session.date) {
        dates.add(session.date);
      }
    }

    // Recalculate stats for each date
    for (const date of dates) {
      await dbManager.calculateDailyStats(date, false);
    }

    console.log(`[CategoryScheduler] Recalculated stats for ${dates.size} days`);
  }

  /**
   * Extract and normalize domain from URL
   * @param {string} url - URL
   * @returns {string|null} Normalized domain or null
   */
  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.replace(/^www\./, '').toLowerCase();
      return normalizeDomain(hostname);
    } catch (e) {
      return null;
    }
  }

  /**
   * Get scheduler status (includes server health info)
   * @returns {Promise<Object>} Status object
   */
  async getStatus() {
    const settings = await dbManager.getSettings();
    const scheduler = settings.categoryScheduler || {};
    const health = scheduler.serverHealth || {};

    return {
      offsetMinutes: scheduler.offsetMinutes || 0,
      lastRun: scheduler.lastRun || null,
      isProcessing: this.isProcessing,
      serverHealth: {
        consecutiveFailures: health.consecutiveFailures || 0,
        lastFailureTime: health.lastFailureTime || null,
        lastSuccessTime: health.lastSuccessTime || null,
        currentBackoffMs: health.currentBackoffMs || 0,
        nextRetryTime: health.nextRetryTime || null,
        isHealthy: (health.consecutiveFailures || 0) === 0
      }
    };
  }

  /**
   * Force run batch categorization now
   */
  async forceRun() {
    console.log('[CategoryScheduler] Force run requested');

    if (this.isProcessing) {
      console.log('[CategoryScheduler] Already processing, force run skipped');
      return;
    }

    // Reset backoff state on manual trigger
    await this._updateServerHealth(true);
    await chrome.alarms.clear(this.retryAlarmName);
    await this.processBatch();
  }

  // ============================================
  // Onboarding / Bulk Processing
  // ============================================

  /**
   * Process recent sessions (today + yesterday) first, then continue remaining in background.
   * Returns as soon as recent sessions are done so onboarding can redirect quickly.
   * @param {Function} onProgress - ({processed, total, phase}) => void
   * @returns {Promise<{recentDone: boolean, remainingCount: number}>}
   */
  async processRecentThenBackground(onProgress = null) {
    console.log('[CategoryScheduler] Processing recent sessions first...');

    // Build date string for today only (last 24h)
    const today = new Date();
    const formatDate = (d) => d.toISOString().split('T')[0];
    const recentDates = [formatDate(today)];

    // Phase 1: Collect and process recent visits only
    const recentVisits = await this.collectUncategorizedVisits(recentDates);
    const allVisits = await this.collectUncategorizedVisits();
    const remainingCount = allVisits.length - recentVisits.length;

    console.log(`[CategoryScheduler] Recent: ${recentVisits.length}, Remaining: ${remainingCount}`);

    if (recentVisits.length > 0) {
      if (onProgress) onProgress({ processed: 0, total: recentVisits.length, phase: 'recent' });
      await this._processBatchList(recentVisits, onProgress, 'recent');
      await this.recalculateDailyStats();
    }

    if (onProgress) onProgress({ processed: recentVisits.length, total: recentVisits.length, phase: 'recent_done' });

    // Phase 2: Process remaining visits in background (non-blocking)
    if (remainingCount > 0) {
      console.log(`[CategoryScheduler] Starting background classification of ${remainingCount} remaining visits...`);
      // Fire and forget — runs in service worker background
      this._processRemainingInBackground(recentDates, onProgress);
    }

    return { recentDone: true, remainingCount };
  }

  /**
   * Background processing of non-recent visits
   * @private
   */
  async _processRemainingInBackground(excludeDates, onProgress) {
    try {
      // Re-collect — recent ones are now classified, so only older ones remain
      const remainingVisits = await this.collectUncategorizedVisits();

      if (remainingVisits.length === 0) {
        console.log('[CategoryScheduler] No remaining visits to classify');
        return;
      }

      console.log(`[CategoryScheduler] Background: ${remainingVisits.length} visits to classify`);

      await this._processBatchList(remainingVisits, (progress) => {
        if (onProgress) onProgress({ ...progress, phase: 'background' });
      }, 'background');

      await this.recalculateDailyStats();
      console.log('[CategoryScheduler] Background classification complete');
    } catch (error) {
      console.error('[CategoryScheduler] Background classification error:', error);
    }
  }

  /**
   * Process a list of visits in batches (with per-batch retry)
   * @private
   */
  async _processBatchList(visits, onProgress, phase) {
    const BATCH_SIZE = 50;
    let totalProcessed = 0;

    for (let i = 0; i < visits.length; i += BATCH_SIZE) {
      const batch = visits.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(visits.length / BATCH_SIZE);

      console.log(`[CategoryScheduler] [${phase}] Batch ${batchNum}/${totalBatches} (${batch.length} visits)`);

      let results = await this.sendToServer(batch);

      // Immediate retry once on failure
      if (!results) {
        console.log(`[CategoryScheduler] [${phase}] Batch ${batchNum} failed, retrying in ${this.BATCH_RETRY_DELAY_MS}ms...`);
        await new Promise(r => setTimeout(r, this.BATCH_RETRY_DELAY_MS));
        results = await this.sendToServer(batch);
      }

      if (!results) {
        console.error(`[CategoryScheduler] [${phase}] Batch ${batchNum} failed after retry, skipping`);
        // Don't count as processed — visits remain uncategorized in DB
        if (onProgress) onProgress({ processed: totalProcessed, total: visits.length, phase });
        continue;
      }

      await this.applyResults(results, batch);
      totalProcessed += batch.length;

      if (onProgress) onProgress({ processed: totalProcessed, total: visits.length, phase });
    }
  }

  /**
   * Process all sessions needing classification until complete
   * Used during onboarding to ensure all history is categorized via unified server process
   * @param {Function} onProgress - Optional callback: ({processed, total}) => void
   */
  async processUntilComplete(onProgress = null) {
    console.log('[CategoryScheduler] Processing until all sessions are categorized...');

    const MAX_CYCLES = 3; // Maximum retry cycles for the entire process

    for (let cycle = 0; cycle < MAX_CYCLES; cycle++) {
      // Collect ALL visits needing classification
      const allVisits = await this.collectUncategorizedVisits();

      if (allVisits.length === 0) {
        console.log('[CategoryScheduler] All sessions already categorized!');
        if (onProgress) onProgress({ processed: 0, total: 0 });
        break;
      }

      if (cycle > 0) {
        console.log(`[CategoryScheduler] Retry cycle ${cycle + 1}/${MAX_CYCLES}: ${allVisits.length} visits remaining`);
      }

      const totalVisits = allVisits.length;
      let totalProcessed = 0;
      const BATCH_SIZE = 50;

      console.log(`[CategoryScheduler] Total visits to classify: ${totalVisits}`);
      if (onProgress) onProgress({ processed: 0, total: totalVisits });

      // Process in batches
      for (let i = 0; i < allVisits.length; i += BATCH_SIZE) {
        const batch = allVisits.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(allVisits.length / BATCH_SIZE);

        console.log(`[CategoryScheduler] Batch ${batchNum}/${totalBatches} (${batch.length} visits)`);

        let results = await this.sendToServer(batch);

        // Immediate retry once on failure
        if (!results) {
          console.log(`[CategoryScheduler] Batch ${batchNum} failed, retrying in ${this.BATCH_RETRY_DELAY_MS}ms...`);
          await new Promise(r => setTimeout(r, this.BATCH_RETRY_DELAY_MS));
          results = await this.sendToServer(batch);
        }

        if (!results) {
          console.error(`[CategoryScheduler] Batch ${batchNum} failed after retry, skipping`);
          if (onProgress) onProgress({ processed: totalProcessed, total: totalVisits });
          continue;
        }

        await this.applyResults(results, batch);
        totalProcessed += batch.length;

        if (onProgress) onProgress({ processed: totalProcessed, total: totalVisits });
      }

      // Recalculate stats once at the end of each cycle
      await this.recalculateDailyStats();

      console.log(`[CategoryScheduler] Cycle ${cycle + 1} complete: ${totalProcessed}/${totalVisits} visits processed`);

      // Check if all done
      const remaining = await this.collectUncategorizedVisits();
      if (remaining.length === 0) {
        console.log('[CategoryScheduler] All sessions categorized!');
        break;
      }

      // Wait before retry cycle
      if (cycle < MAX_CYCLES - 1) {
        console.log(`[CategoryScheduler] ${remaining.length} visits still uncategorized, retrying in 5s...`);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }
}

// Export singleton instance
export const categoryScheduler = new CategoryScheduler();
