/**
 * History Analyzer
 *
 * Analyzes Chrome browsing history to approximate past screen time.
 * This allows users to see their usage patterns from before the extension was installed.
 */

import { dbManager } from './db-manager.js';
import { categoryDetector } from './category-detector.js';
import { normalizeDomain, getDateFromTimestamp, generateId } from '../common/utils.js';
import { SERVER_CONFIG } from '../common/server-config.js';

// Analysis parameters
const CONFIG = {
  MIN_SESSION_TIME: 3 * 60 * 1000,       // 3 minutes - minimum time for a visit
  AVG_PAGE_VIEW: 3 * 60 * 1000,          // 3 minutes - average time for last page of the day
  MAX_SESSION_TIME: 5 * 60 * 1000,        // 5 minutes - cap for gap between visits
  BATCH_SIZE: 1000,                      // Process history in batches
  ANALYSIS_PERIODS: {
    WEEK: 7,
    MONTH: 14,
    QUARTER: 90
  }
};

class HistoryAnalyzer {
  constructor() {
    this.isAnalyzing = false;
    this.progress = {
      current: 0,
      total: 0,
      phase: ''
    };
  }

  /**
   * Analyze browsing history and generate approximated screen time data
   */
  async analyzeHistory(days = CONFIG.ANALYSIS_PERIODS.MONTH, onProgress = null) {
    if (this.isAnalyzing) {
      throw new Error('Analysis already in progress');
    }

    this.isAnalyzing = true;
    this.progress = { current: 0, total: 0, phase: 'Fetching history...' };

    try {
      // Include today — real-time tracking is unreliable due to SW restarts,
      // so history analysis fills the gaps. Dedup handled in saveToDB().
      const endTime = Date.now();
      const startTime = endTime - (days * 24 * 60 * 60 * 1000);

      if (onProgress) onProgress(this.progress);

      const historyItems = await this.fetchHistory(startTime, endTime);

      this.progress.phase = 'Tagging device sources...';
      if (onProgress) onProgress(this.progress);

      // Tag each visit with local/remote device info
      const taggedVisits = await this.tagVisitsWithDevice(historyItems, startTime, endTime);

      this.progress.total = taggedVisits.length;
      this.progress.phase = 'Processing visits...';
      if (onProgress) onProgress(this.progress);

      // Group by date (chronological order)
      const dateGroups = this.groupByDate(taggedVisits);

      this.progress.phase = 'Creating sessions and detecting categories...';
      if (onProgress) onProgress(this.progress);

      // Create sessions with proper duration and category detection
      const sessions = await this.createSessions(dateGroups);

      this.progress.phase = 'Aggregating statistics...';
      if (onProgress) onProgress(this.progress);

      // Aggregate into daily stats
      const dailyStats = await this.aggregateToDailyStats(sessions);

      this.progress.phase = 'Saving to database...';
      if (onProgress) onProgress(this.progress);

      // Save to database (both daily stats and sessions)
      await this.saveToDB(dailyStats, sessions);

      // Send data to server for learning (async, don't wait)
      this.progress.phase = 'Sending to server for learning...';
      if (onProgress) onProgress(this.progress);
      
      this.sendToServer(sessions).catch(err => {
        console.log('Server upload skipped or failed:', err.message);
      });

      this.progress.phase = 'Complete';
      this.progress.current = this.progress.total;
      if (onProgress) onProgress(this.progress);

      return {
        success: true,
        sessionsCreated: sessions.length,
        daysAnalyzed: dailyStats.length,
        periodStart: startTime,
        periodEnd: endTime
      };

    } catch (error) {
      console.error('History analysis failed:');
      console.error('  Type:', typeof error);
      console.error('  Name:', error?.name);
      console.error('  Message:', error?.message);
      console.error('  Stack:', error?.stack);
      console.error('  String:', String(error));
      console.error('  Full error:', error);
      throw error;
    } finally {
      this.isAnalyzing = false;
    }
  }

  /**
   * Fetch browsing history for the specified time range
   */
  async fetchHistory(startTime, endTime) {
    return new Promise((resolve, reject) => {
      chrome.history.search({
        text: '',
        startTime: startTime,
        endTime: endTime,
        maxResults: 0  // 0 means no limit
      }, (results) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          // Filter out chrome:// and extension:// URLs
          const filtered = results.filter(item => {
            try {
              const url = new URL(item.url);
              return url.protocol === 'http:' || url.protocol === 'https:';
            } catch {
              return false;
            }
          });
          resolve(filtered);
        }
      });
    });
  }

  /**
   * Expand URL-level history items into individual visits with device tagging.
   * chrome.history.search() returns 1 entry per URL (lastVisitTime only).
   * This function calls getVisits() per URL and expands into individual visits
   * so that revisits to the same URL at different times are all captured.
   */
  async tagVisitsWithDevice(historyItems, startTime, endTime) {
    const expandedVisits = [];

    for (const item of historyItems) {
      try {
        const visits = await new Promise((resolve, reject) => {
          chrome.history.getVisits({ url: item.url }, (results) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(results || []);
            }
          });
        });

        // Filter to analysis time range
        const rangeVisits = visits.filter(v => v.visitTime >= startTime && v.visitTime <= endTime);

        if (rangeVisits.length > 0) {
          // Expand: one entry per actual visit
          for (const visit of rangeVisits) {
            expandedVisits.push({
              url: item.url,
              title: item.title || '',
              lastVisitTime: visit.visitTime,
              visitCount: 1,
              isLocal: visit.isLocal === undefined ? true : visit.isLocal
            });
          }
        } else {
          // No visits in range — keep original item as fallback
          expandedVisits.push({ ...item, isLocal: true });
        }
      } catch (e) {
        // On error, keep original item
        expandedVisits.push({ ...item, isLocal: true });
      }
    }

    const localCount = expandedVisits.filter(v => v.isLocal).length;
    const remoteCount = expandedVisits.filter(v => !v.isLocal).length;
    console.log(`[HistoryAnalyzer] Expanded ${historyItems.length} URLs → ${expandedVisits.length} visits (${localCount} local, ${remoteCount} remote)`);
    return expandedVisits;
  }

  /**
   * Group history items by date and sort by time
   * Returns visits sorted chronologically for each date
   */
  groupByDate(historyItems) {
    const dateGroups = {};

    for (const item of historyItems) {
      try {
        const url = new URL(item.url);
        const domain = normalizeDomain(url.hostname);
        const date = getDateFromTimestamp(item.lastVisitTime);

        if (!dateGroups[date]) {
          dateGroups[date] = [];
        }

        dateGroups[date].push({
          url: item.url,
          domain,
          time: item.lastVisitTime,
          title: item.title || '',
          visitCount: item.visitCount || 1,
          isLocal: item.isLocal !== false // default true for legacy
        });
      } catch (error) {
        continue;
      }

      this.progress.current++;
    }

    // Sort each day's visits by time
    for (const date of Object.keys(dateGroups)) {
      dateGroups[date].sort((a, b) => a.time - b.time);
    }

    return dateGroups;
  }

  /**
   * Create sessions from chronologically sorted visits
   * Duration = time until next visit (no overlap/double counting)
   * IMPORTANT: Now async to detect categories during creation
   */
  async createSessions(dateGroups) {
    const allSessions = [];
    let categorizedCount = 0;

    for (const [date, visits] of Object.entries(dateGroups)) {
      if (visits.length === 0) continue;

      for (let i = 0; i < visits.length; i++) {
        const visit = visits[i];
        const nextVisit = visits[i + 1];

        let duration;
        if (nextVisit) {
          // Duration = actual time until next visit (no minimum — use real gap)
          duration = nextVisit.time - visit.time;

          // Cap at MAX_SESSION_TIME (user probably left tab open)
          if (duration > CONFIG.MAX_SESSION_TIME) {
            duration = CONFIG.MAX_SESSION_TIME;
          }
        } else {
          // Last visit of the day: use AVG_PAGE_VIEW (3 min estimate)
          duration = CONFIG.AVG_PAGE_VIEW;
        }

        // Local classification (domain + path rules)
        // TODO: 테스트 후 활성화
        let category = 'uncategorized';
        let confidence = 0;
        // try {
        //   const result = await categoryDetector.detectCategory(visit.url, visit.title || '');
        //   if (result.category && result.category !== 'needs_server_classification') {
        //     category = result.category;
        //     confidence = result.confidence;
        //   }
        // } catch (e) {
        //   // Ignore detection errors
        // }

        if (categorizedCount < 5) {
          console.log(`[HistoryAnalyzer] ${visit.domain} → ${category} (confidence: ${confidence})`);
          categorizedCount++;
        }

        allSessions.push({
          domain: visit.domain,
          date: date,
          visits: [visit],
          startTime: visit.time,
          endTime: visit.time + duration,
          duration: duration,
          durationMinutes: Math.round(duration / 60000),
          category: category,
          confidence: confidence,
          deviceSource: visit.isLocal ? 'local' : 'Other Devices'
        });
      }
    }

    console.log(`[HistoryAnalyzer] Created ${allSessions.length} sessions with categories`);
    return allSessions;
  }

  /**
   * Aggregate sessions into daily stats format
   * Sessions already have categories from createSessions()
   */
  async aggregateToDailyStats(sessions) {
    const dailyMap = {};

    for (const session of sessions) {
      // Use pre-detected category from session
      const category = session.category || 'uncategorized';
      const dateKey = session.date;

      if (!dailyMap[dateKey]) {
        dailyMap[dateKey] = {
          date: dateKey,
          categories: {},
          totalTime: 0,
          domains: {},
          source: 'approximated'  // Mark as approximated data
        };
      }

      const dayData = dailyMap[dateKey];

      // Update category stats
      if (!dayData.categories[category]) {
        dayData.categories[category] = {
          time: 0,
          sessionCount: 0,
          topSites: {}
        };
      }

      dayData.categories[category].time += session.duration;
      dayData.categories[category].sessionCount += 1;

      // Track top sites with time
      if (!dayData.categories[category].topSites[session.domain]) {
        dayData.categories[category].topSites[session.domain] = { count: 0, time: 0 };
      }
      dayData.categories[category].topSites[session.domain].count += 1;
      dayData.categories[category].topSites[session.domain].time += session.duration;

      // Update domain stats
      if (!dayData.domains[session.domain]) {
        dayData.domains[session.domain] = {
          time: 0,
          sessions: 0,
          category: category
        };
      }

      dayData.domains[session.domain].time += session.duration;
      dayData.domains[session.domain].sessions += 1;

      // Update total time
      dayData.totalTime += session.duration;
    }

    // Convert to array and format
    return Object.values(dailyMap).map(day => {
      // Convert topSites object to sorted array (top 5) with time
      const formattedCategories = Object.fromEntries(
        Object.entries(day.categories).map(([cat, data]) => [
          cat,
          {
            time: data.time,
            sessionCount: data.sessionCount,
            topSites: Object.entries(data.topSites)
              .sort((a, b) => b[1].time - a[1].time)
              .slice(0, 5)
              .map(([domain, info]) => ({ domain, time: info.time }))
          }
        ])
      );

      return {
        date: day.date,
        categories: formattedCategories,
        totalTime: day.totalTime,
        domains: day.domains,
        source: day.source,
        pickups: 0,  // Approximated data doesn't track pickups
        mostUsed: Object.entries(formattedCategories)
          .sort((a, b) => b[1].time - a[1].time)[0]?.[0] || null
      };
    });
  }

  /**
   * Save approximated data to database
   */
  async saveToDB(dailyStats, sessions) {
    // Ensure database is ready
    await dbManager.ensureReady();

    // Save daily stats
    const statsTransaction = dbManager.db.transaction(['dailyStats'], 'readwrite');
    const statsStore = statsTransaction.objectStore('dailyStats');

    for (const dayStat of dailyStats) {
      // Check if data already exists for this date
      const existing = await new Promise((resolve, reject) => {
        const request = statsStore.get(dayStat.date);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      if (existing) {
        // Merge approximated data with existing tracked data
        const merged = this.mergeStats(existing, dayStat);
        await new Promise((resolve, reject) => {
          const request = statsStore.put(merged);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      } else {
        // New date, just add it
        await new Promise((resolve, reject) => {
          const request = statsStore.put(dayStat);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      }
    }

    // Wait for stats transaction to complete
    await new Promise((resolve, reject) => {
      statsTransaction.oncomplete = () => resolve();
      statsTransaction.onerror = () => reject(statsTransaction.error);
    });

    // Save sessions for hourly breakdown
    if (sessions && sessions.length > 0) {
      // Sessions already have categories from createSessions()
      // Format them for database storage
      console.log(`[HistoryAnalyzer] Formatting ${sessions.length} sessions for storage...`);
      const formattedSessions = [];
      let sessionId = Date.now();

      for (const session of sessions) {
        formattedSessions.push({
          id: `approx_${sessionId++}`,
          category: session.category || 'uncategorized',
          confidence: session.confidence || 0,
          startTime: Math.floor(session.startTime),
          lastVisitTime: Math.floor(session.endTime),
          endTime: Math.floor(session.endTime),
          duration: Math.floor(session.duration),
          visits: session.visits.map(v => ({
            url: v.url,
            title: v.title,
            timestamp: Math.floor(v.time)
          })),
          date: session.date,
          blocked: false,
          source: 'approximated',
          deviceSource: session.deviceSource || 'local'
        });
      }

      console.log(`[HistoryAnalyzer] Saving ${formattedSessions.length} sessions to DB...`);

      // Delete old approximated sessions for the dates being updated (prevent duplicates)
      const datesToUpdate = [...new Set(formattedSessions.map(s => s.date))];
      const oldApproxIds = [];
      for (const date of datesToUpdate) {
        const existing = await dbManager.getSessionsByDate(date);
        for (const session of existing) {
          if (session.source === 'approximated') {
            oldApproxIds.push(session.id);
          }
        }
      }

      if (oldApproxIds.length > 0) {
        console.log(`[HistoryAnalyzer] Removing ${oldApproxIds.length} old approximated sessions`);
      }

      // Start transaction: delete old approximated, then save new
      const sessionsTransaction = dbManager.db.transaction(['sessions'], 'readwrite');
      const sessionsStore = sessionsTransaction.objectStore('sessions');

      for (const id of oldApproxIds) {
        sessionsStore.delete(id);
      }

      for (const formattedSession of formattedSessions) {
        sessionsStore.put(formattedSession);
      }

      // Wait for transaction to complete
      await new Promise((resolve, reject) => {
        sessionsTransaction.oncomplete = () => resolve();
        sessionsTransaction.onerror = () => reject(sessionsTransaction.error);
      });

      console.log(`[HistoryAnalyzer] Sessions saved successfully`);
    }
  }

  /**
   * Merge approximated stats with existing tracked stats
   */
  mergeStats(existing, approximated) {
    // If existing data is already from tracking, don't overwrite
    if (existing.source === 'tracked') {
      return existing;
    }

    // If existing is also approximated, take the one with more data
    if (existing.source === 'approximated') {
      return existing.totalTime > approximated.totalTime ? existing : approximated;
    }

    // Default: keep existing
    return existing;
  }

  /**
   * Clear all approximated data (both dailyStats and sessions)
   */
  async clearApproximatedData() {
    await dbManager.ensureReady();

    // Clear approximated dailyStats
    const statsTransaction = dbManager.db.transaction(['dailyStats'], 'readwrite');
    const statsStore = statsTransaction.objectStore('dailyStats');

    const allStats = await new Promise((resolve, reject) => {
      const request = statsStore.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    let deletedStats = 0;
    for (const stat of allStats) {
      if (stat.source === 'approximated') {
        await new Promise((resolve, reject) => {
          const request = statsStore.delete(stat.date);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
        deletedStats++;
      }
    }

    await new Promise((resolve, reject) => {
      statsTransaction.oncomplete = () => resolve();
      statsTransaction.onerror = () => reject(statsTransaction.error);
    });

    // Clear approximated sessions
    const sessionsTransaction = dbManager.db.transaction(['sessions'], 'readwrite');
    const sessionsStore = sessionsTransaction.objectStore('sessions');

    const allSessions = await new Promise((resolve, reject) => {
      const request = sessionsStore.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    let deletedSessions = 0;
    for (const session of allSessions) {
      if (session.source === 'approximated' || (session.id && session.id.startsWith('approx_'))) {
        await new Promise((resolve, reject) => {
          const request = sessionsStore.delete(session.id);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
        deletedSessions++;
      }
    }

    await new Promise((resolve, reject) => {
      sessionsTransaction.oncomplete = () => resolve();
      sessionsTransaction.onerror = () => reject(sessionsTransaction.error);
    });

    console.log(`[HistoryAnalyzer] Cleared ${deletedStats} dailyStats and ${deletedSessions} sessions`);
  }

  /**
   * Get current analysis progress
   */
  getProgress() {
    return { ...this.progress };
  }

  /**
   * Send analyzed data to server for learning
   */
  async sendToServer(sessions) {
    // Check if user opted in to data sharing
    const settings = await dbManager.getSettings();
    if (!settings.serverSync?.shareUsageData) {
      console.log('Data sharing disabled, skipping server upload');
      return;
    }

    // Get or create anonymous ID
    let anonymousId = settings.anonymousId;
    if (!anonymousId) {
      anonymousId = generateId();
      await dbManager.saveSettings({ ...settings, anonymousId });
    }

    // Only send uncategorized sessions to server (locally classified ones don't need server help)
    const unclassified = sessions.filter(s =>
      !s.category || s.category === 'uncategorized' || s.category === 'needs_server_classification'
    );

    console.log(`[HistoryAnalyzer] ${sessions.length} total sessions, ${sessions.length - unclassified.length} classified locally, ${unclassified.length} need server classification`);

    const reports = [];

    for (const session of unclassified) {
      const visit = session.visits[0];
      if (!visit) continue;

      try {
        const url = new URL(visit.url);
        const domain = normalizeDomain(url.hostname);

        // Extract platform info from URL
        const platformInfo = this.extractPlatformInfo(url, visit.title);

        reports.push({
          domain: domain,
          title: this.anonymizeTitle(visit.title),
          urlPath: this.generalizeUrlPath(url.pathname),
          detectedCategory: 'uncategorized',
          confidence: 0,
          method: 'needs_server',
          platform: platformInfo.platform,
          platformId: platformInfo.platformId,
          ogType: null,  // Not available from history
          timestamp: Math.floor(visit.timestamp || visit.time || Date.now())  // Convert to integer
        });
      } catch (e) {
        // Skip invalid URLs
        console.warn('[HistoryAnalyzer] Failed to process visit:', e);
        continue;
      }
    }

    if (reports.length === 0) {
      console.log('No valid reports to send');
      return;
    }

    // Send in batches
    const BATCH_SIZE = 500;
    for (let i = 0; i < reports.length; i += BATCH_SIZE) {
      const batch = reports.slice(i, i + BATCH_SIZE);
      
      try {
        const response = await fetch(
          `${SERVER_CONFIG.BASE_URL}${SERVER_CONFIG.ENDPOINTS.HISTORY_REPORTS}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reports: batch,
              anonymousId: anonymousId,
              version: chrome.runtime.getManifest().version
            })
          }
        );

        if (response.ok) {
          const result = await response.json();
          console.log(`Sent ${result.received} history reports to server (batch ${Math.floor(i/BATCH_SIZE) + 1})`);
        } else {
          const errorText = await response.text();
          console.warn('Server returned error:', response.status);
          console.warn('Error body:', errorText);

          try {
            const errorJson = JSON.parse(errorText);
            console.warn('Parsed error:', JSON.stringify(errorJson, null, 2));
          } catch (e) {
            // Not JSON
          }
        }
      } catch (e) {
        console.warn('Failed to send to server:', e.message);
        break;  // Stop trying on network error
      }
    }
  }

  /**
   * Extract platform-specific info from URL
   */
  extractPlatformInfo(url, title) {
    const hostname = url.hostname.toLowerCase();
    const pathname = url.pathname;
    
    // YouTube
    if (hostname.includes('youtube.com')) {
      // Try to extract channel from URL patterns
      // /channel/UCxxxx, /@channelname, /c/channelname
      const channelMatch = pathname.match(/\/(channel\/[^\/]+|@[^\/]+|c\/[^\/]+)/);
      if (channelMatch) {
        return { platform: 'youtube', platformId: channelMatch[1] };
      }
      // For watch pages, we can't get channel from URL alone
      return { platform: 'youtube', platformId: null };
    }
    
    // Twitch
    if (hostname.includes('twitch.tv')) {
      // /{channel} for live streams
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length > 0 && !['directory', 'videos', 'clips', 'settings'].includes(parts[0])) {
        return { platform: 'twitch', platformId: parts[0] };
      }
      return { platform: 'twitch', platformId: null };
    }
    
    // Reddit
    if (hostname.includes('reddit.com')) {
      // /r/{subreddit}
      const subredditMatch = pathname.match(/^\/r\/([^\/]+)/);
      if (subredditMatch) {
        return { platform: 'reddit', platformId: subredditMatch[1] };
      }
      return { platform: 'reddit', platformId: null };
    }
    
    return { platform: null, platformId: null };
  }

  /**
   * Generalize URL path for privacy
   */
  generalizeUrlPath(pathname) {
    // Replace specific IDs with placeholders
    return pathname
      .replace(/\/[a-f0-9]{8,}/gi, '/[ID]')
      .replace(/\/\d+/g, '/[NUM]')
      .replace(/\?.*$/, '')
      .substring(0, 50);  // Limit length
  }

  /**
   * Anonymize title by removing personal info
   */
  anonymizeTitle(title) {
    if (!title) return null;
    
    return title
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
      .replace(/\b\d{10,}\b/g, '[NUMBER]')
      .replace(/[\uAC00-\uD7AF]{2,5}(?:님|씨|선생님)/g, '[NAME]')
      .substring(0, 200);
  }
}

export const historyAnalyzer = new HistoryAnalyzer();
