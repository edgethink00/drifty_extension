/**
 * Remote Device Tracker
 *
 * Polls Chrome History Sync data to track browsing activity from other devices.
 * Uses chrome.history.getVisits() with isLocal field (Chrome 115+) to identify
 * remote visits, and chrome.sessions.getDevices() for device names.
 *
 * Assumes a 2-device setup: all isLocal=false visits are attributed to
 * one "other device".
 */

import { categoryDetector } from './category-detector.js';
import { dbManager } from './db-manager.js';
import { generateId, getDateFromTimestamp } from '../common/utils.js';

const POLL_INTERVAL_MINUTES = 3;
const SESSION_GAP_MS = 5 * 60 * 1000; // 5 minutes gap = new session
const MAX_HISTORY_RESULTS = 500;
const LOOKBACK_MS = 2 * 60 * 60 * 1000; // Always look back 2 hours (sync delay compensation)
const MAX_SESSION_DURATION = 4 * 60 * 60 * 1000; // 4 hour cap per session
const AVG_PAGE_VIEW_MS = 3 * 60 * 1000; // 3 min estimated page view for last visit

class RemoteDeviceTracker {
  constructor() {
    this.isPolling = false;
    this.processedVisitIds = new Set(); // Track already-processed visit IDs to prevent duplicates
    this._ready = false;
  }

  /**
   * Handle alarm events (called from centralized dispatcher in service-worker.js)
   */
  handleAlarm(alarm) {
    if (!this._ready) return;
    if (alarm.name === 'pollRemoteHistory') {
      this.pollRemoteHistory();
    }
  }

  /**
   * Initialize remote device tracker
   */
  async init() {
    // Set up polling alarm
    chrome.alarms.create('pollRemoteHistory', {
      periodInMinutes: POLL_INTERVAL_MINUTES
    });

    // Initial poll after a short delay
    setTimeout(() => this.pollRemoteHistory(), 10000);

    this._ready = true;
    console.log('[RemoteDeviceTracker] Initialized (2h lookback, 3min polling)');
  }

  /**
   * Poll for remote browsing history
   */
  async pollRemoteHistory() {
    if (this.isPolling) {
      console.log('[RemoteDeviceTracker] Already polling, skipping');
      return;
    }

    this.isPolling = true;

    try {
      // 1. Get connected devices
      const deviceName = await this.getDeviceName();
      console.log('[RemoteDeviceTracker] Device name for remote visits:', deviceName);

      // 2. Search recent history (always look back 2 hours to catch sync delays)
      // Remote visits have visitTime from the OTHER device, which is in the past
      // relative to when they actually sync to this device.
      // Duplicate check prevents re-saving already captured sessions.
      const startTime = Date.now() - LOOKBACK_MS;
      const historyItems = await new Promise((resolve, reject) => {
        chrome.history.search({
          text: '',
          startTime: startTime,
          maxResults: MAX_HISTORY_RESULTS
        }, (results) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(results || []);
          }
        });
      });

      if (historyItems.length === 0) {
        console.log('[RemoteDeviceTracker] No new history items');
        this.isPolling = false;
        return;
      }

      console.log(`[RemoteDeviceTracker] Found ${historyItems.length} history items in last 2 hours`);

      // Filter to http/https URLs only
      const validItems = historyItems.filter(item => {
        try {
          const url = new URL(item.url);
          return url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
          return false;
        }
      });

      // 3. For each URL, get visits and filter remote ones
      const remoteVisits = [];

      for (const item of validItems) {
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

          for (const visit of visits) {
            // isLocal === false means remote device
            // isLocal === undefined means Chrome < 115, treat as local
            // Skip already-processed visits
            if (visit.isLocal === false &&
                visit.visitTime >= startTime &&
                !this.processedVisitIds.has(visit.visitId)) {
              remoteVisits.push({
                url: item.url,
                title: item.title || '',
                visitTime: visit.visitTime,
                visitId: visit.visitId
              });
            }
          }
        } catch (e) {
          console.debug('[RemoteDeviceTracker] Error getting visits for:', item.url, e);
        }
      }

      console.log(`[RemoteDeviceTracker] Found ${remoteVisits.length} remote visits`);

      if (remoteVisits.length === 0) {
        this.isPolling = false;
        return;
      }

      // 4. Sort by time
      remoteVisits.sort((a, b) => a.visitTime - b.visitTime);

      // 5. Classify each visit
      for (const visit of remoteVisits) {
        const result = await categoryDetector.detectCategory(visit.url, visit.title);
        visit.category = result.category;
        visit.confidence = result.confidence;
      }

      // 6. Group into sessions (same category + within 5 min gap)
      const sessions = this._groupIntoSessions(remoteVisits, deviceName);
      console.log(`[RemoteDeviceTracker] Created ${sessions.length} remote sessions`);

      // 7. Save sessions (with duplicate check)
      const datesToUpdate = new Set();
      for (const session of sessions) {
        const isDuplicate = await this._checkDuplicate(session);
        if (!isDuplicate) {
          await dbManager.saveSession(session);
          datesToUpdate.add(session.date);
          console.log('[RemoteDeviceTracker] Saved remote session:', {
            category: session.category,
            deviceSource: session.deviceSource,
            duration: Math.round(session.duration / 60000) + 'm',
            visits: session.visits.length,
            date: session.date
          });
        }
      }

      // Mark all remote visits as processed (prevent re-processing next poll)
      for (const visit of remoteVisits) {
        this.processedVisitIds.add(visit.visitId);
      }

      // Prune old processed IDs (keep last 5000 to prevent memory leak)
      if (this.processedVisitIds.size > 5000) {
        const arr = Array.from(this.processedVisitIds);
        this.processedVisitIds = new Set(arr.slice(-3000));
      }

      // Update daily stats for affected dates
      for (const date of datesToUpdate) {
        await dbManager.calculateDailyStats(date);
      }

    } catch (error) {
      console.error('[RemoteDeviceTracker] Error polling remote history:', error);
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Group remote visits into sessions
   * Same category + gap < 5 min = same session
   */
  _groupIntoSessions(visits, deviceName) {
    if (visits.length === 0) return [];

    const sessions = [];
    let currentGroup = [visits[0]];

    for (let i = 1; i < visits.length; i++) {
      const prev = visits[i - 1];
      const curr = visits[i];
      const gap = curr.visitTime - prev.visitTime;

      if (curr.category === prev.category && gap < SESSION_GAP_MS) {
        currentGroup.push(curr);
      } else {
        sessions.push(this._createSession(currentGroup, deviceName));
        currentGroup = [curr];
      }
    }

    // Don't forget the last group
    sessions.push(this._createSession(currentGroup, deviceName));

    return sessions;
  }

  /**
   * Create a session object from a group of visits
   * Duration = sum of (gap between consecutive visits) + estimated last page view
   * Capped at MAX_SESSION_DURATION
   */
  _createSession(visits, deviceName) {
    const firstVisit = visits[0];
    const lastVisit = visits[visits.length - 1];

    // Calculate duration from consecutive visit gaps
    let duration = 0;
    for (let i = 0; i < visits.length - 1; i++) {
      const gap = visits[i + 1].visitTime - visits[i].visitTime;
      // Cap individual gap at SESSION_GAP_MS (5 min) — shouldn't exceed this due to grouping, but safety check
      duration += Math.min(gap, SESSION_GAP_MS);
    }
    // Add estimated page view time for the last visit
    duration += AVG_PAGE_VIEW_MS;

    // Cap total duration
    duration = Math.min(duration, MAX_SESSION_DURATION);

    return {
      id: `remote_${generateId()}`,
      category: firstVisit.category,
      confidence: firstVisit.confidence || 0.5,
      method: 'remote_history',
      startTime: firstVisit.visitTime,
      lastVisitTime: lastVisit.visitTime,
      endTime: firstVisit.visitTime + duration,
      duration: duration,
      visits: visits.map(v => ({
        url: v.url,
        title: v.title,
        timestamp: v.visitTime
      })),
      date: getDateFromTimestamp(firstVisit.visitTime),
      blocked: false,
      source: 'remote',
      deviceSource: deviceName
    };
  }

  /**
   * Check if a session overlaps with existing sessions for the same date/device
   */
  async _checkDuplicate(session) {
    try {
      const existingSessions = await dbManager.getSessionsByDate(session.date);

      for (const existing of existingSessions) {
        // Check for remote sessions with overlapping time
        if (existing.source === 'remote' &&
            existing.deviceSource === session.deviceSource &&
            existing.category === session.category) {
          // Check time overlap
          const overlap = existing.startTime < session.endTime &&
                          session.startTime < existing.endTime;
          if (overlap) {
            return true;
          }
        }
      }
      return false;
    } catch (e) {
      console.error('[RemoteDeviceTracker] Error checking duplicates:', e);
      return false;
    }
  }

  /**
   * Get connected devices via chrome.sessions.getDevices()
   * @returns {Promise<Array>} Array of device objects
   */
  async getConnectedDevices() {
    try {
      const devices = await new Promise((resolve, reject) => {
        chrome.sessions.getDevices({}, (devices) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(devices || []);
          }
        });
      });
      return devices;
    } catch (e) {
      console.error('[RemoteDeviceTracker] Error getting devices:', e);
      return [];
    }
  }

  /**
   * Get the name for the remote device
   * 2-device assumption: if exactly 1 other device, use its name
   * Otherwise, use "Other Device"
   */
  async getDeviceName() {
    try {
      const devices = await this.getConnectedDevices();
      console.log('[RemoteDeviceTracker] Connected devices:', devices.length,
        devices.map(d => d.deviceName));

      if (devices.length === 1) {
        // Exactly 1 other device → use its name
        return devices[0].deviceName || 'Other Devices';
      }

      // 0 or 2+ other devices → can't determine which
      return 'Other Devices';
    } catch (e) {
      return 'Other Devices';
    }
  }

}

// Export singleton instance
export const remoteDeviceTracker = new RemoteDeviceTracker();
