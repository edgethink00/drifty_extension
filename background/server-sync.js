import { SERVER_CONFIG, CATEGORY_DB_VERSION, USAGE_STATS_CONFIG } from '../common/server-config.js';
import { categoryDetector } from './category-detector.js';
import { dbManager } from './db-manager.js';
import { keywordExtractor } from './keyword-extractor.js';
import { visitBuffer } from './visit-buffer.js';
import { getTodayDate } from '../common/utils.js';

class ServerSync {
  constructor() {
    this.isOnline = navigator.onLine;
    this.pendingStats = [];
    this.lastSyncTime = null;
    this.syncInProgress = false;
    this._ready = false;
  }

  /**
   * Handle alarm events (called from centralized dispatcher in service-worker.js)
   */
  handleAlarm(alarm) {
    if (!this._ready) return;
    if (alarm.name === 'serverSync') {
      this.checkForUpdates();
    } else if (alarm.name === 'statsUpload') {
      this.uploadPendingStats();
    } else if (alarm.name === 'categorySync') {
      this.syncCategoriesFromServer();
    }
  }

  /**
   * Initialize server sync
   */
  async init() {
    // Note: Service workers don't have window object, skip event listeners
    // Network status will be checked when needed via navigator.onLine

    // Load settings
    const settings = await dbManager.getSettings();
    if (settings.serverSync?.enabled) {
      await this.checkForUpdates();
    }

    // Setup periodic sync
    chrome.alarms.create('serverSync', {
      periodInMinutes: SERVER_CONFIG.UPDATE_INTERVAL / 60000
    });

    // Setup periodic category sync (every 10 minutes)
    chrome.alarms.create('categorySync', {
      periodInMinutes: 10
    });

    this._ready = true;
    console.log('Server Sync initialized');
  }

  /**
   * Check for category database updates
   */
  async checkForUpdates() {
    if (!this.isOnline || this.syncInProgress) {
      return;
    }

    const settings = await dbManager.getSettings();
    if (!settings.serverSync?.enabled) {
      return;
    }

    this.syncInProgress = true;

    try {
      // Check version
      const versionData = await this.fetchWithRetry(
        `${SERVER_CONFIG.BASE_URL}${SERVER_CONFIG.ENDPOINTS.CATEGORIES_VERSION}`
      );

      if (!versionData) {
        // Server unavailable, skip silently
        return;
      }

      const currentVersion = await this.getCurrentVersion();

      if (this.shouldUpdate(currentVersion, versionData.version)) {
        console.log(`New version available: ${versionData.version}`);
        await this.downloadCategoryUpdate();
      } else {
        console.log('Categories are up to date');
      }

      this.lastSyncTime = Date.now();
      await this.saveLastSyncTime();

    } catch (error) {
      // Silently ignore - server may not be available
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Download category database update
   */
  async downloadCategoryUpdate() {
    try {
      console.log('Downloading category updates...');

      const categoriesData = await this.fetchWithRetry(
        `${SERVER_CONFIG.BASE_URL}${SERVER_CONFIG.ENDPOINTS.CATEGORIES}`
      );

      if (!categoriesData || !categoriesData.categories) {
        throw new Error('Invalid category data received');
      }

      // Merge with existing categories
      await this.mergeCategoryData(categoriesData);

      // Save new version
      await this.saveCurrentVersion(categoriesData.version);

      console.log('Category update completed successfully');

      // Notify user
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Categories Updated',
        message: `Category database updated to version ${categoriesData.version}`,
        priority: 1
      });

    } catch (error) {
      console.error('Error downloading categories:', error);
      throw error;
    }
  }

  /**
   * Merge downloaded category data with local data
   */
  async mergeCategoryData(serverData) {
    const { categories, domains, keywords } = serverData;

    // Update each category
    for (const [categoryKey, categoryData] of Object.entries(categories)) {
      const existingCategory = categoryDetector.getCategoryInfo(categoryKey);

      if (existingCategory) {
        // Merge domains (keep unique)
        const mergedDomains = [
          ...new Set([
            ...(existingCategory.domains || []),
            ...(categoryData.domains || [])
          ])
        ];

        // Merge keywords (keep unique)
        const mergedKeywords = [
          ...new Set([
            ...(existingCategory.keywords || []),
            ...(categoryData.keywords || [])
          ])
        ];

        // Update category
        categoryDetector.addCustomCategory(categoryKey, {
          ...existingCategory,
          domains: mergedDomains,
          keywords: mergedKeywords,
          serverUpdated: true,
          lastServerUpdate: Date.now()
        });
      }
    }

    // Save merged categories to settings
    const settings = await dbManager.getSettings();
    settings.serverCategories = categories;
    settings.lastCategoryUpdate = Date.now();
    await dbManager.saveSettings(settings);
  }

  /**
   * Get or create a persistent device ID for this machine
   * @returns {Promise<string>} Device UUID
   */
  async getDeviceId() {
    try {
      const stored = await chrome.storage.local.get('deviceId');
      if (stored.deviceId) {
        return stored.deviceId;
      }

      // Generate new UUID
      const randomBytes = new Uint8Array(16);
      crypto.getRandomValues(randomBytes);
      const deviceId = Array.from(randomBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      await chrome.storage.local.set({ deviceId });
      console.log('[ServerSync] Generated new deviceId:', deviceId);
      return deviceId;
    } catch (e) {
      console.error('[ServerSync] Error getting deviceId:', e);
      return 'unknown';
    }
  }

  /**
   * Record usage pattern for server upload
   * Extracts anonymized keywords from URL and title for better category detection
   */
  async recordUsagePattern(url, title, detectedCategory, userCategory = null, confidence = 1.0) {
    const settings = await dbManager.getSettings();

    if (!settings.serverSync?.shareUsageData) {
      return; // User hasn't consented
    }

    if (confidence < USAGE_STATS_CONFIG.MIN_CONFIDENCE) {
      return; // Confidence too low
    }

    // Extract domain for exclusion check
    let domain;
    try {
      const urlObj = new URL(url);
      domain = urlObj.hostname;
    } catch (e) {
      console.error('Invalid URL for stats recording:', url);
      return;
    }

    // Check if domain is excluded
    if (settings.privacy?.excludedDomains) {
      const excludedDomains = settings.privacy.excludedDomains;
      const isExcluded = excludedDomains.some(excluded => {
        // Support wildcard matching
        if (excluded.includes('*')) {
          const pattern = excluded.replace(/\*/g, '.*');
          const regex = new RegExp(`^${pattern}$`, 'i');
          return regex.test(domain);
        }
        // Exact match
        return domain.toLowerCase() === excluded.toLowerCase();
      });

      if (isExcluded) {
        console.log(`Domain ${domain} is excluded from stats collection`);
        return;
      }
    }

    // Extract anonymized keywords and URL pattern
    const extracted = keywordExtractor.extractKeywords(url, title);

    // Calculate keyword confidence
    const keywordConfidence = keywordExtractor.calculateConfidence(extracted.keywords);

    // Create anonymous hash
    const anonymousId = await this.getAnonymousId();

    const deviceId = await this.getDeviceId();

    const statEntry = {
      domain: extracted.domain,
      urlPattern: extracted.urlPattern,        // Generalized URL pattern (e.g., "/watch")
      keywords: extracted.keywords,            // Anonymized keywords (e.g., ["tutorial", "calculus"])
      detectedCategory: detectedCategory,
      userCategory: userCategory,
      confidence: confidence,
      keywordConfidence: keywordConfidence,    // How useful the keywords are
      timestamp: Date.now(),
      anonymousId: anonymousId,
      url: url,                                 // Full URL (RescueTime-style, for personal use)
      title: title,                             // Page title (RescueTime-style, for personal use)
      deviceSource: 'local',
      deviceId: deviceId
    };

    this.pendingStats.push(statEntry);

    // Upload if batch size reached
    if (this.pendingStats.length >= USAGE_STATS_CONFIG.BATCH_SIZE) {
      await this.uploadPendingStats();
    }
  }

  /**
   * Upload pending usage statistics
   */
  async uploadPendingStats() {
    if (this.pendingStats.length === 0) {
      return;
    }

    if (!this.isOnline) {
      console.log('Cannot upload stats: offline');
      return;
    }

    const settings = await dbManager.getSettings();
    if (!settings.serverSync?.shareUsageData) {
      // User disabled sharing, clear pending stats
      this.pendingStats = [];
      return;
    }

    try {
      console.log(`Uploading ${this.pendingStats.length} usage stats...`);

      const response = await fetch(
        `${SERVER_CONFIG.BASE_URL}${SERVER_CONFIG.ENDPOINTS.USAGE_STATS}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            stats: this.pendingStats,
            version: CATEGORY_DB_VERSION.CURRENT
          })
        }
      );

      if (response.ok) {
        console.log('Usage stats uploaded successfully');
        this.pendingStats = [];
      }
      // Silently ignore upload failures (server may not be available)

    } catch (error) {
      // Silently ignore network errors
    }
  }

  /**
   * Fetch with retry logic
   */
  async fetchWithRetry(url, options = {}, attempts = SERVER_CONFIG.RETRY_ATTEMPTS) {
    for (let i = 0; i < attempts; i++) {
      try {
        console.log(`[ServerSync] Fetching ${url} (attempt ${i + 1}/${attempts})...`);
        const response = await fetch(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`[ServerSync] Fetch successful:`, data);
        return data;

      } catch (error) {
        console.error(`[ServerSync] Fetch attempt ${i + 1} failed:`, error.message);
        if (i < attempts - 1) {
          console.log(`[ServerSync] Retrying in ${SERVER_CONFIG.RETRY_DELAY}ms...`);
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, SERVER_CONFIG.RETRY_DELAY));
        } else {
          // Log final failure
          console.error(`[ServerSync] All ${attempts} fetch attempts failed for ${url}`);
          return null;
        }
      }
    }
  }

  /**
   * Check if update is needed
   */
  shouldUpdate(currentVersion, serverVersion) {
    if (!currentVersion) return true;

    const current = currentVersion.split('.').map(Number);
    const server = serverVersion.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      if (server[i] > current[i]) return true;
      if (server[i] < current[i]) return false;
    }

    return false;
  }

  /**
   * Get current category database version
   */
  async getCurrentVersion() {
    const settings = await dbManager.getSettings();
    return settings.categoryVersion || CATEGORY_DB_VERSION.CURRENT;
  }

  /**
   * Save current category database version
   */
  async saveCurrentVersion(version) {
    const settings = await dbManager.getSettings();
    settings.categoryVersion = version;
    await dbManager.saveSettings(settings);
  }

  /**
   * Get last sync time
   */
  async getLastSyncTime() {
    const settings = await dbManager.getSettings();
    return settings.lastServerSync || null;
  }

  /**
   * Save last sync time
   */
  async saveLastSyncTime() {
    const settings = await dbManager.getSettings();
    settings.lastServerSync = this.lastSyncTime;
    await dbManager.saveSettings(settings);
  }

  /**
   * Get anonymous user ID (persistent hash)
   */
  async getAnonymousId() {
    const settings = await dbManager.getSettings();

    if (settings.anonymousId) {
      return settings.anonymousId;
    }

    // Generate new anonymous ID
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    const anonymousId = Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    settings.anonymousId = anonymousId;
    await dbManager.saveSettings(settings);

    return anonymousId;
  }

  /**
   * Force sync now
   */
  async forceSyncNow() {
    this.syncInProgress = false; // Reset flag
    await this.checkForUpdates();
  }

  /**
   * Get sync status
   */
  getSyncStatus() {
    // Calculate next sync time from lastSyncTime + category sync interval (10 min)
    const CATEGORY_SYNC_INTERVAL = 10 * 60 * 1000; // 10 minutes
    let nextSyncTime = null;
    if (this.lastSyncTime) {
      nextSyncTime = this.lastSyncTime + CATEGORY_SYNC_INTERVAL;
    }
    return {
      isOnline: this.isOnline,
      lastSyncTime: this.lastSyncTime,
      syncInProgress: this.syncInProgress,
      pendingStatsCount: this.pendingStats.length,
      nextSyncTime
    };
  }

  /**
   * Download initial domain categories cache
   * Called on first install and periodically (every 7 days)
   */
  async downloadDomainCache() {
    try {
      console.log('[ServerSync] Downloading domain categories cache...');

      const response = await this.fetchWithRetry(
        `${SERVER_CONFIG.BASE_URL}/categories/domains`
      );

      if (!response || !response.domains) {
        console.error('[ServerSync] Invalid response from domains API:', response);
        return false;
      }

      console.log(`[ServerSync] Received ${response.count} domain categories`);
      console.log('[ServerSync] Sample domains:', Object.keys(response.domains).slice(0, 10));

      // Save to IndexedDB
      await dbManager.saveDomainCategories(response.domains);
      console.log('[ServerSync] Saved domains to IndexedDB');

      // Verify save by checking a sample domain
      const sampleDomain = Object.keys(response.domains)[0];
      if (sampleDomain) {
        const verified = await dbManager.getDomainCategory(sampleDomain);
        console.log(`[ServerSync] Verification - ${sampleDomain}:`, verified);
      }

      // Update settings with version and last download time
      const settings = await dbManager.getSettings();
      settings.domainCacheVersion = response.version;
      settings.lastDomainCacheUpdate = Date.now();
      await dbManager.saveSettings(settings);

      console.log('[ServerSync] Domain cache updated successfully');
      return true;

    } catch (error) {
      console.error('[ServerSync] Error downloading domain cache:', error);
      return false;
    }
  }

  /**
   * Check if domain cache needs update
   * Updates every 7 days
   */
  async checkDomainCacheUpdate() {
    const settings = await dbManager.getSettings();
    const lastUpdate = settings.lastDomainCacheUpdate || 0;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    if (Date.now() - lastUpdate > sevenDays) {
      console.log('[ServerSync] Domain cache is outdated, downloading...');
      await this.downloadDomainCache();
    } else {
      console.log('[ServerSync] Domain cache is up to date');
    }
  }

  /**
   * Upload history analysis data as initial batch 0
   * Called after first-time history analysis completes
   */
  async uploadHistoryData() {
    const settings = await dbManager.getSettings();

    // Check if already uploaded
    if (settings.historyDataUploaded) {
      console.log('[ServerSync] History data already uploaded, skipping');
      return;
    }

    // Check if server sync is enabled
    if (!settings.serverSync?.shareUsageData) {
      console.log('[ServerSync] Usage data sharing disabled, skipping history upload');
      return;
    }

    try {
      console.log('[ServerSync] Uploading history analysis data as batch 0...');

      // Get all sessions from history analysis (approximated sessions)
      const sessions = await dbManager.getAllSessions();
      const approximatedSessions = sessions.filter(s => s.source === 'approximated');

      if (approximatedSessions.length === 0) {
        console.log('[ServerSync] No history data to upload');
        return;
      }

      // Get anonymous ID
      const anonymousId = await this.getAnonymousId();

      // Convert sessions to usage stats format
      const historyStats = [];
      for (const session of approximatedSessions) {
        // Get first visit from session
        const visit = session.visits?.[0];
        if (!visit) continue;

        // Extract keywords from URL and title
        const extracted = keywordExtractor.extractKeywords(visit.url, visit.title || '');

        historyStats.push({
          domain: extracted.domain,
          urlPattern: extracted.urlPattern,
          keywords: extracted.keywords,
          detectedCategory: session.category,
          userCategory: null,
          confidence: 0.5, // Lower confidence for history data
          keywordConfidence: keywordExtractor.calculateConfidence(extracted.keywords),
          timestamp: session.startTime, // Original visit timestamp
          anonymousId: anonymousId,
          url: visit.url,
          title: visit.title || '',
          batchNumber: 0 // Mark as batch 0 (initial history data)
        });
      }

      console.log(`[ServerSync] Uploading ${historyStats.length} history visits for session analysis...`);

      // Upload each visit individually to raw_visits for session processing
      let uploadedCount = 0;
      let failedCount = 0;

      for (let i = 0; i < historyStats.length; i++) {
        const stat = historyStats[i];

        try {
          // Use uploadVisit to send to raw_visits (will be processed by batch processor)
          const response = await fetch(
            `${SERVER_CONFIG.BASE_URL}${SERVER_CONFIG.ENDPOINTS.UPLOAD_VISIT}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                url: stat.url,
                title: stat.title,
                category: stat.detectedCategory,
                confidence: stat.confidence,
                timestamp: stat.timestamp,
                anonymousId: stat.anonymousId
              })
            }
          );

          if (response.ok) {
            uploadedCount++;
            if (uploadedCount % 100 === 0) {
              console.log(`[ServerSync] Uploaded ${uploadedCount}/${historyStats.length} history visits...`);
            }
          } else {
            failedCount++;
          }
        } catch (error) {
          failedCount++;
          console.debug(`[ServerSync] History visit upload error:`, error);
        }

        // Small delay to avoid overwhelming server
        if (i > 0 && i % 100 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log(`[ServerSync] History data upload complete: ${uploadedCount} uploaded, ${failedCount} failed`);

      // Mark as uploaded if at least some data was uploaded
      if (uploadedCount > 0) {
        settings.historyDataUploaded = true;
        settings.historyDataUploadedAt = Date.now();
        await dbManager.saveSettings(settings);
      }

    } catch (error) {
      console.error('[ServerSync] Error uploading history data:', error);
      // Don't throw - this is not critical
    }
  }

  /**
   * Upload a visit to server in real-time
   * Called immediately after category detection
   *
   * @param {Object} visit - Visit object with url, title, category, confidence, timestamp
   */
  async uploadVisit(visit) {
    const settings = await dbManager.getSettings();

    // Check if server sync is enabled
    if (!settings.serverSync?.enabled) {
      return;
    }

    // Check if user consented to share usage data
    if (!settings.serverSync?.shareUsageData) {
      return;
    }

    // Check if online
    if (!this.isOnline && !navigator.onLine) {
      console.log('[ServerSync] Cannot upload visit: offline');
      return;
    }

    try {
      const deviceId = await this.getDeviceId();

      const payload = {
        url: visit.url,
        title: visit.title || '',
        category: visit.category || 'uncategorized',
        confidence: visit.confidence || 0.5,
        timestamp: visit.timestamp || Date.now(),
        anonymousId: settings.anonymousId || 'unknown',
        deviceSource: visit.deviceSource || 'local',
        deviceId: deviceId
      };

      // 버퍼에 추가 (50개씩 모아서 배치 전송)
      visitBuffer.add(payload);
      console.log('[ServerSync] Visit added to buffer:', visit.url);

    } catch (error) {
      // Silently ignore errors
      console.debug('[ServerSync] Error preparing visit upload:', error);
    }
  }

  /**
   * Sync categories from server for recently visited domains
   * Updates local cache with server-determined categories
   */
  async syncCategoriesFromServer() {
    const settings = await dbManager.getSettings();

    // Check if server sync is enabled
    if (!settings.serverSync?.enabled) {
      return;
    }

    // Get uncategorized domains from local cache
    const uncategorizedDomains = await this.getUncategorizedDomains();

    if (uncategorizedDomains.length === 0) {
      return;
    }

    console.log(`[ServerSync] Syncing categories for ${uncategorizedDomains.length} domains...`);

    // Query server for each domain
    for (const domain of uncategorizedDomains) {
      try {
        const response = await fetch(
          `${SERVER_CONFIG.BASE_URL}${SERVER_CONFIG.ENDPOINTS.GET_CATEGORY}/${encodeURIComponent(domain)}`
        );

        if (response.ok) {
          const data = await response.json();

          if (data.category) {
            // Update local cache
            await dbManager.saveDomainCategory(domain, {
              category: data.category,
              confidence: data.confidence,
              lastUpdated: Date.now()
            });

            console.log(`[ServerSync] Updated category for ${domain}: ${data.category}`);
          }
        }

      } catch (error) {
        // Silently ignore errors for individual domains
        console.debug(`[ServerSync] Failed to sync category for ${domain}:`, error);
      }
    }
  }

  /**
   * Analyze unclassified ("other") domains from past 7 days via server batch detection.
   * Excludes domains already classified in the local cache.
   * @returns {Promise<Object>} { total, classified, results }
   */
  async analyzeUnclassified() {
    // 1. Get sessions from past 7 days
    const endDate = getTodayDate();
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const sessions = await dbManager.getSessionsByDateRange(startDate, endDate);

    // 2. Collect "other" or "uncategorized" domains with their URLs/titles
    const domainVisits = new Map(); // domain -> { url, title }
    for (const session of sessions) {
      if (session.category !== 'other' && session.category !== 'uncategorized') continue;
      if (!session.visits) continue;
      for (const visit of session.visits) {
        const domain = visit.domain || this._extractDomain(visit.url);
        if (!domain) continue;
        if (!domainVisits.has(domain)) {
          domainVisits.set(domain, { url: visit.url, title: visit.title || '', domain });
        }
      }
    }

    // 3. Exclude domains already classified (not other/uncategorized) in local cache
    const knownDomains = await dbManager.getAllDomainCategories();
    const knownMap = {};
    for (const entry of knownDomains) {
      if (entry.category && entry.category !== 'other' && entry.category !== 'uncategorized') {
        knownMap[entry.domain] = true;
      }
    }

    const toAnalyze = [];
    for (const [domain, visit] of domainVisits) {
      if (!knownMap[domain]) {
        toAnalyze.push(visit);
      }
    }

    if (toAnalyze.length === 0) {
      return { total: 0, classified: 0, results: [] };
    }

    console.log(`[ServerSync] Analyzing ${toAnalyze.length} unclassified domains...`);

    // 4. Send to server in batches of 50
    const anonymousId = await this.getAnonymousId();
    const allResults = [];
    const BATCH_SIZE = 50;

    for (let i = 0; i < toAnalyze.length; i += BATCH_SIZE) {
      const batch = toAnalyze.slice(i, i + BATCH_SIZE);
      const visits = batch.map((v, idx) => ({
        id: `analyze-${i + idx}`,
        url: v.url,
        title: v.title,
        timestamp: Math.floor(Date.now() / 1000)
      }));

      try {
        const response = await this.fetchWithRetry(
          `${SERVER_CONFIG.BASE_URL}${SERVER_CONFIG.ENDPOINTS.DETECT_BATCH}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ visits, anonymousId })
          }
        );

        if (response?.results) {
          allResults.push(...response.results);
        }
      } catch (e) {
        console.error(`[ServerSync] Batch analyze failed (${i}-${i + batch.length}):`, e);
      }
    }

    // 5. Update local cache with results (skip "other" results - no improvement)
    // Build domain -> newCategory map
    let classified = 0;
    const reclassifiedDomains = new Map(); // domain -> category
    for (const result of allResults) {
      if (result.category && result.category !== 'other' && result.category !== 'uncategorized') {
        const idx = parseInt(result.id.split('-')[1]);
        const visit = toAnalyze[idx];
        if (visit) {
          await dbManager.saveDomainCategory(visit.domain, {
            category: result.category,
            confidence: result.confidence
          });
          reclassifiedDomains.set(visit.domain, result.category);
          classified++;
        }
      }
    }

    // 6. Update actual sessions' category based on reclassified domains
    if (classified > 0) {
      const affectedDates = new Set();
      for (const session of sessions) {
        if (session.category !== 'other' && session.category !== 'uncategorized') continue;
        // Check if any visit domain was reclassified
        let newCategory = null;
        if (session.visits) {
          for (const visit of session.visits) {
            const domain = visit.domain || this._extractDomain(visit.url);
            if (domain && reclassifiedDomains.has(domain)) {
              newCategory = reclassifiedDomains.get(domain);
              break;
            }
          }
        }
        if (newCategory) {
          session.category = newCategory;
          await dbManager.saveSession(session);
          affectedDates.add(session.date);
        }
      }

      // 7. Recalculate daily stats for affected dates
      for (const date of affectedDates) {
        try {
          await dbManager.calculateDailyStats(date);
        } catch (e) {
          console.warn(`[ServerSync] Failed to recalculate stats for ${date}:`, e);
        }
      }
    }

    console.log(`[ServerSync] Analysis complete: ${classified}/${toAnalyze.length} classified`);
    return { total: toAnalyze.length, classified, results: allResults };
  }

  _extractDomain(url) {
    try {
      return new URL(url).hostname.replace('www.', '').toLowerCase();
    } catch {
      return null;
    }
  }

  /**
   * Get list of uncategorized domains from local cache
   * @returns {Promise<Array<string>>} List of domain names
   */
  async getUncategorizedDomains() {
    // Get all domains from cache
    const allDomains = await dbManager.getAllDomainCategories();

    // Filter to uncategorized only
    const uncategorized = [];
    for (const [domain, data] of Object.entries(allDomains)) {
      if (data.category === 'uncategorized' || data.category === 'other') {
        uncategorized.push(domain);
      }
    }

    return uncategorized;
  }
}

// Export singleton instance
export const serverSync = new ServerSync();
