import { DB_CONFIG, DEFAULT_SETTINGS } from '../common/constants.js';
import { getTodayDate, getDateFromTimestamp, getStartOfDay, getEndOfDay, normalizeDomain } from '../common/utils.js';
import { getWellKnownDomain } from '../common/well-known-domains.js';

class DBManager {
  constructor() {
    this.db = null;
    this.initPromise = null; // Prevent multiple simultaneous initializations
  }

  /**
   * Initialize database
   */
  async init() {
    // If already initialized, return existing db
    if (this.db) {
      return this.db;
    }

    // If initialization is in progress, wait for it
    if (this.initPromise) {
      return this.initPromise;
    }

    // Start initialization
    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_CONFIG.NAME, DB_CONFIG.VERSION);

      request.onerror = () => {
        this.initPromise = null;
        reject(request.error);
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const oldVersion = event.oldVersion;

        // Sessions store
        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.SESSIONS)) {
          const sessionsStore = db.createObjectStore(DB_CONFIG.STORES.SESSIONS, {
            keyPath: 'id'
          });
          sessionsStore.createIndex('date', 'date', { unique: false });
          sessionsStore.createIndex('category', 'category', { unique: false });
          sessionsStore.createIndex('startTime', 'startTime', { unique: false });
        }

        // Daily stats store
        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.DAILY_STATS)) {
          db.createObjectStore(DB_CONFIG.STORES.DAILY_STATS, {
            keyPath: 'date'
          });
        }

        // Limits store - migrate from category keyPath to id keyPath (v5)
        if (oldVersion < 5 && db.objectStoreNames.contains(DB_CONFIG.STORES.LIMITS)) {
          const txn = event.target.transaction;
          const oldStore = txn.objectStore(DB_CONFIG.STORES.LIMITS);
          const getAllReq = oldStore.getAll();
          getAllReq.onsuccess = () => {
            const oldLimits = getAllReq.result || [];
            // deleteObjectStore/createObjectStore are valid within versionchange transaction callbacks
            db.deleteObjectStore(DB_CONFIG.STORES.LIMITS);
            const newStore = db.createObjectStore(DB_CONFIG.STORES.LIMITS, { keyPath: 'id' });
            newStore.createIndex('category', 'category', { unique: false });
            oldLimits.forEach(limit => {
              newStore.put({
                ...limit,
                id: `cat:${limit.category}`,
                targetType: 'category',
                targetValue: null
              });
            });
          };
        } else if (!db.objectStoreNames.contains(DB_CONFIG.STORES.LIMITS)) {
          const limitsStore = db.createObjectStore(DB_CONFIG.STORES.LIMITS, { keyPath: 'id' });
          limitsStore.createIndex('category', 'category', { unique: false });
        }

        // Settings store
        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.SETTINGS)) {
          const settingsStore = db.createObjectStore(DB_CONFIG.STORES.SETTINGS, {
            keyPath: 'key'
          });
          // Initialize default settings
          settingsStore.add({ key: 'general', ...DEFAULT_SETTINGS });
        }

        // Custom categories store
        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.CUSTOM_CATEGORIES)) {
          db.createObjectStore(DB_CONFIG.STORES.CUSTOM_CATEGORIES, {
            keyPath: 'id'
          });
        }

        // Site overrides store (force specific domains to specific categories)
        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.SITE_OVERRIDES)) {
          db.createObjectStore(DB_CONFIG.STORES.SITE_OVERRIDES, {
            keyPath: 'domain'
          });
        }

        // Domain categories cache (서버 기반 도메인 카테고리 캐시)
        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.DOMAIN_CATEGORIES)) {
          const domainCategoriesStore = db.createObjectStore(DB_CONFIG.STORES.DOMAIN_CATEGORIES, {
            keyPath: 'domain'
          });
          domainCategoriesStore.createIndex('category', 'category', { unique: false });
          domainCategoriesStore.createIndex('lastUpdated', 'lastUpdated', { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Ensure database is ready before operations
   */
  async ensureReady() {
    if (!this.db) {
      await this.init();
    }
    return this.db;
  }

  /**
   * Fix sessions with invalid category (object instead of string)
   * This is a migration to fix a bug where detectCategory() result was stored directly
   */
  async fixInvalidCategorySessions() {
    await this.ensureReady();
    const transaction = this.db.transaction([DB_CONFIG.STORES.SESSIONS], 'readwrite');
    const store = transaction.objectStore(DB_CONFIG.STORES.SESSIONS);

    return new Promise((resolve, reject) => {
      const request = store.openCursor();
      let fixedCount = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const session = cursor.value;

          // Check if category is an object instead of string
          if (session.category && typeof session.category === 'object') {
            // Extract the category string from the object
            session.category = session.category.category || 'other';
            cursor.update(session);
            fixedCount++;
          }

          cursor.continue();
        } else {
          // Done iterating
          if (fixedCount > 0) {
            console.log(`[DBManager] Fixed ${fixedCount} sessions with invalid category`);
          }
          resolve(fixedCount);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Fix dailyStats with invalid category keys (object instead of string)
   */
  async fixInvalidCategoryDailyStats() {
    await this.ensureReady();
    const transaction = this.db.transaction([DB_CONFIG.STORES.DAILY_STATS], 'readwrite');
    const store = transaction.objectStore(DB_CONFIG.STORES.DAILY_STATS);

    return new Promise((resolve, reject) => {
      const request = store.openCursor();
      let fixedCount = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const stats = cursor.value;
          let needsUpdate = false;

          // Check categories for invalid keys
          if (stats.categories) {
            const newCategories = {};
            for (const [key, value] of Object.entries(stats.categories)) {
              if (key === '[object Object]') {
                // Merge into 'other' category
                if (!newCategories.other) {
                  newCategories.other = { time: 0, sessionCount: 0, topSites: [] };
                }
                newCategories.other.time += value.time || 0;
                newCategories.other.sessionCount += value.sessionCount || 0;
                needsUpdate = true;
              } else {
                newCategories[key] = value;
              }
            }
            if (needsUpdate) {
              stats.categories = newCategories;
            }
          }

          // Check domains for invalid category
          if (stats.domains) {
            for (const domain of Object.keys(stats.domains)) {
              if (stats.domains[domain].category && typeof stats.domains[domain].category === 'object') {
                stats.domains[domain].category = stats.domains[domain].category.category || 'other';
                needsUpdate = true;
              }
            }
          }

          if (needsUpdate) {
            cursor.update(stats);
            fixedCount++;
          }

          cursor.continue();
        } else {
          if (fixedCount > 0) {
            console.log(`[DBManager] Fixed ${fixedCount} dailyStats entries with invalid category`);
          }
          resolve(fixedCount);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save session to database
   * @param {Object} session - Session object
   */
  async saveSession(session) {
    await this.ensureReady();
    const transaction = this.db.transaction([DB_CONFIG.STORES.SESSIONS], 'readwrite');
    const store = transaction.objectStore(DB_CONFIG.STORES.SESSIONS);

    return new Promise((resolve, reject) => {
      const request = store.put(session);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get sessions for a specific date
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} [deviceFilter] - Optional device filter:
   *   null/undefined = all sessions (backward compatible)
   *   "local" = deviceSource === "local" or deviceSource is undefined (legacy sessions)
   *   "remote" = deviceSource !== "local" and deviceSource is defined
   *   any other string = deviceSource === that string (e.g. device name)
   * @returns {Promise<Array>} Array of sessions
   */
  async getSessionsByDate(date, deviceFilter) {
    await this.ensureReady();
    const transaction = this.db.transaction([DB_CONFIG.STORES.SESSIONS], 'readonly');
    const store = transaction.objectStore(DB_CONFIG.STORES.SESSIONS);
    const index = store.index('date');

    return new Promise((resolve, reject) => {
      const request = index.getAll(date);
      request.onsuccess = () => {
        let sessions = request.result || [];

        // Apply device filter if specified
        if (deviceFilter) {
          if (deviceFilter === 'local') {
            // Local sessions: deviceSource is "local" or undefined (legacy)
            sessions = sessions.filter(s => !s.deviceSource || s.deviceSource === 'local');
          } else if (deviceFilter === 'remote') {
            // Remote sessions: deviceSource is set and not "local"
            sessions = sessions.filter(s => s.deviceSource && s.deviceSource !== 'local');
          } else {
            // Specific device name
            sessions = sessions.filter(s => s.deviceSource === deviceFilter);
          }
        }

        resolve(sessions);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get sessions within date range
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @returns {Promise<Array>} Array of sessions
   */
  async getSessionsByDateRange(startDate, endDate) {
    await this.ensureReady();
    const transaction = this.db.transaction([DB_CONFIG.STORES.SESSIONS], 'readonly');
    const store = transaction.objectStore(DB_CONFIG.STORES.SESSIONS);
    const index = store.index('date');

    return new Promise((resolve, reject) => {
      const range = IDBKeyRange.bound(startDate, endDate);
      const request = index.getAll(range);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Update daily statistics
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {Object} stats - Statistics object
   */
  async updateDailyStats(date, stats) {
    await this.ensureReady();
    const transaction = this.db.transaction([DB_CONFIG.STORES.DAILY_STATS], 'readwrite');
    const store = transaction.objectStore(DB_CONFIG.STORES.DAILY_STATS);

    return new Promise((resolve, reject) => {
      const request = store.put({ date, ...stats });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get daily statistics
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Object>} Statistics object
   */
  async getDailyStats(date) {
    await this.ensureReady();
    const transaction = this.db.transaction([DB_CONFIG.STORES.DAILY_STATS], 'readonly');
    const store = transaction.objectStore(DB_CONFIG.STORES.DAILY_STATS);

    return new Promise((resolve, reject) => {
      const request = store.get(date);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Calculate and save daily statistics from sessions
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {boolean} excludeApproximated - If true, exclude approximated sessions (for today)
   * @param {string} [deviceFilter] - Optional device filter (see getSessionsByDate)
   */
  async calculateDailyStats(date, excludeApproximated = false, deviceFilter) {
    let sessions = await this.getSessionsByDate(date, deviceFilter);

    // Filter out approximated sessions if requested
    if (excludeApproximated) {
      sessions = sessions.filter(s => s.source !== 'approximated');
    }

    // Apply well-known domain fallback for unclassified sessions
    sessions = sessions.map(s => {
      if (s.category === 'needs_server_classification' || s.category === 'uncategorized') {
        const visitUrl = s.visits?.[0]?.url;
        if (visitUrl) {
          try {
            const domain = new URL(visitUrl).hostname.replace(/^www\./, '').toLowerCase();
            const wellKnown = getWellKnownDomain(domain);
            return { ...s, category: wellKnown?.category || 'other' };
          } catch (e) { /* invalid URL */ }
        }
        return { ...s, category: 'other' };
      }
      return s;
    });

    const categories = {};
    const domains = {}; // Track all domains with time
    let totalTime = 0;
    let pickups = sessions.length;

    sessions.forEach(session => {
      const category = session.category;
      const subcategory = session.subcategory || 'general';
      const duration = session.duration || 0;

      if (!categories[category]) {
        categories[category] = {
          time: 0,
          sessionCount: 0,
          topSitesMap: {}, // Track time per site
          subcategories: {} // Track time per subcategory
        };
      }

      categories[category].time += duration;
      categories[category].sessionCount += 1;

      // Track subcategory time
      if (!categories[category].subcategories[subcategory]) {
        categories[category].subcategories[subcategory] = {
          time: 0,
          sessionCount: 0
        };
      }
      categories[category].subcategories[subcategory].time += duration;
      categories[category].subcategories[subcategory].sessionCount += 1;

      totalTime += duration;

      // Track top sites with TIME (not just count)
      if (session.visits && session.visits.length > 0) {
        // Distribute session duration across visited domains
        const timePerVisit = duration / session.visits.length;
        session.visits.forEach(visit => {
          try {
            const rawDomain = new URL(visit.url).hostname.replace('www.', '');
            const domain = normalizeDomain(rawDomain);

            // Track in category
            if (!categories[category].topSitesMap[domain]) {
              categories[category].topSitesMap[domain] = 0;
            }
            categories[category].topSitesMap[domain] += timePerVisit;

            // Track in global domains
            if (!domains[domain]) {
              domains[domain] = { time: 0, sessions: 0, category, subcategory };
            }
            domains[domain].time += timePerVisit;
            domains[domain].sessions += 1;
          } catch (e) {
            // Skip invalid URLs
          }
        });
      }
    });

    // Convert topSitesMap to sorted array with time
    Object.keys(categories).forEach(category => {
      const sitesArray = Object.entries(categories[category].topSitesMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([domain, time]) => ({ domain, time }));
      categories[category].topSites = sitesArray;
      delete categories[category].topSitesMap;
    });

    // Find most used category
    const mostUsed = Object.entries(categories)
      .sort((a, b) => b[1].time - a[1].time)[0]?.[0] || null;

    const stats = {
      categories,
      domains,
      totalTime,
      pickups,
      mostUsed
    };

    await this.updateDailyStats(date, stats);
    return stats;
  }

  /**
   * Get limit by ID
   * @param {string} id - Limit ID (e.g., "cat:social", "sub:social:messaging", "dom:social:reddit.com")
   * @returns {Promise<Object>} Limit object
   */
  async getLimit(id) {
    await this.ensureReady();
    const transaction = this.db.transaction([DB_CONFIG.STORES.LIMITS], 'readonly');
    const store = transaction.objectStore(DB_CONFIG.STORES.LIMITS);

    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all limits
   * @returns {Promise<Array>} Array of limit objects
   */
  async getAllLimits() {
    await this.ensureReady();
    const transaction = this.db.transaction([DB_CONFIG.STORES.LIMITS], 'readonly');
    const store = transaction.objectStore(DB_CONFIG.STORES.LIMITS);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save limit
   * @param {Object} limit - Limit object with id, category, targetType, targetValue, etc.
   */
  async saveLimit(category, limit) {
    await this.ensureReady();
    const transaction = this.db.transaction([DB_CONFIG.STORES.LIMITS], 'readwrite');
    const store = transaction.objectStore(DB_CONFIG.STORES.LIMITS);

    // Build ID from target info
    const id = limit.id || this.buildLimitId(category, limit.targetType, limit.targetValue);

    return new Promise((resolve, reject) => {
      const request = store.put({
        id,
        category,
        targetType: limit.targetType || 'category',
        targetValue: limit.targetValue || null,
        ...limit
      });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Build limit ID from components
   */
  buildLimitId(category, targetType, targetValue) {
    if (targetType === 'group') return `grp:${targetValue}`;
    if (targetType === 'subcategory') return `sub:${category}:${targetValue}`;
    if (targetType === 'domain') return `dom:${category}:${targetValue}`;
    return `cat:${category}`;
  }

  /**
   * Delete limit by ID
   * @param {string} id - Limit ID
   */
  async deleteLimit(id) {
    await this.ensureReady();
    const transaction = this.db.transaction([DB_CONFIG.STORES.LIMITS], 'readwrite');
    const store = transaction.objectStore(DB_CONFIG.STORES.LIMITS);

    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get settings
   * @returns {Promise<Object>} Settings object
   */
  async getSettings() {
    await this.ensureReady();
    const transaction = this.db.transaction([DB_CONFIG.STORES.SETTINGS], 'readonly');
    const store = transaction.objectStore(DB_CONFIG.STORES.SETTINGS);

    return new Promise((resolve, reject) => {
      const request = store.get('general');
      request.onsuccess = () => {
        const result = request.result || { key: 'general', ...DEFAULT_SETTINGS };
        resolve(result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save settings
   * @param {Object} settings - Settings object
   */
  async saveSettings(settings) {
    await this.ensureReady();
    const transaction = this.db.transaction([DB_CONFIG.STORES.SETTINGS], 'readwrite');
    const store = transaction.objectStore(DB_CONFIG.STORES.SETTINGS);

    return new Promise((resolve, reject) => {
      const request = store.put({ key: 'general', ...settings });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete sessions for adult category (privacy mode)
   * @param {string} date - Date in YYYY-MM-DD format
   */
  async deleteAdultSessions(date) {
    await this.ensureReady();
    const sessions = await this.getSessionsByDate(date);
    const adultSessions = sessions.filter(s => s.category === 'adult');

    const transaction = this.db.transaction([DB_CONFIG.STORES.SESSIONS], 'readwrite');
    const store = transaction.objectStore(DB_CONFIG.STORES.SESSIONS);

    const promises = adultSessions.map(session => {
      return new Promise((resolve, reject) => {
        const request = store.delete(session.id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });

    await Promise.all(promises);

    // Recalculate stats
    await this.calculateDailyStats(date);
  }

  /**
   * Get all sessions from database
   * @returns {Promise<Array>} Array of all sessions
   */
  async getAllSessions() {
    await this.ensureReady();
    const transaction = this.db.transaction([DB_CONFIG.STORES.SESSIONS], 'readonly');
    const store = transaction.objectStore(DB_CONFIG.STORES.SESSIONS);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all daily stats from database
   * @returns {Promise<Array>} Array of all daily stats
   */
  async getAllDailyStats() {
    await this.ensureReady();
    const transaction = this.db.transaction([DB_CONFIG.STORES.DAILY_STATS], 'readonly');
    const store = transaction.objectStore(DB_CONFIG.STORES.DAILY_STATS);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all data from a specific store
   * @param {string} storeName - Name of the store to clear
   */
  async clearStore(storeName) {
    await this.ensureReady();
    const transaction = this.db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all data from all stores (except settings optionally)
   * @param {boolean} keepSettings - If true, preserve settings
   */
  async clearAllData(keepSettings = false) {
    await this.ensureReady();

    const storesToClear = [
      DB_CONFIG.STORES.SESSIONS,
      DB_CONFIG.STORES.DAILY_STATS,
      DB_CONFIG.STORES.LIMITS
    ];

    if (!keepSettings) {
      storesToClear.push(DB_CONFIG.STORES.SETTINGS);
    }

    for (const storeName of storesToClear) {
      await this.clearStore(storeName);
    }

    // Reinitialize default settings if cleared
    if (!keepSettings) {
      await this.saveSettings(DEFAULT_SETTINGS);
    }

    return true;
  }

  // ================================
  // Custom Categories Methods
  // ================================

  /**
   * Save a custom category
   * @param {Object} category - Category object { id, name, icon, color, domains, keywords }
   */
  async saveCustomCategory(category) {
    await this.ensureReady();
    const transaction = this.db.transaction([DB_CONFIG.STORES.CUSTOM_CATEGORIES], 'readwrite');
    const store = transaction.objectStore(DB_CONFIG.STORES.CUSTOM_CATEGORIES);

    return new Promise((resolve, reject) => {
      const request = store.put(category);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all custom categories
   * @returns {Promise<Array>} Array of custom categories
   */
  async getAllCustomCategories() {
    await this.ensureReady();
    const transaction = this.db.transaction([DB_CONFIG.STORES.CUSTOM_CATEGORIES], 'readonly');
    const store = transaction.objectStore(DB_CONFIG.STORES.CUSTOM_CATEGORIES);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete a custom category
   * @param {string} id - Category ID
   */
  async deleteCustomCategory(id) {
    await this.ensureReady();
    const transaction = this.db.transaction([DB_CONFIG.STORES.CUSTOM_CATEGORIES], 'readwrite');
    const store = transaction.objectStore(DB_CONFIG.STORES.CUSTOM_CATEGORIES);

    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ================================
  // Site Overrides Methods
  // ================================

  /**
   * Save a site override (force domain to specific category)
   * @param {Object} override - { domain, category }
   */
  async saveSiteOverride(override) {
    await this.ensureReady();
    const transaction = this.db.transaction([DB_CONFIG.STORES.SITE_OVERRIDES], 'readwrite');
    const store = transaction.objectStore(DB_CONFIG.STORES.SITE_OVERRIDES);

    return new Promise((resolve, reject) => {
      const request = store.put(override);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all site overrides
   * @returns {Promise<Array>} Array of site overrides
   */
  async getAllSiteOverrides() {
    await this.ensureReady();
    const transaction = this.db.transaction([DB_CONFIG.STORES.SITE_OVERRIDES], 'readonly');
    const store = transaction.objectStore(DB_CONFIG.STORES.SITE_OVERRIDES);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get site override for specific domain
   * @param {string} domain - Domain to check
   * @returns {Promise<Object|null>} Override object or null
   */
  async getSiteOverride(domain) {
    await this.ensureReady();
    const transaction = this.db.transaction([DB_CONFIG.STORES.SITE_OVERRIDES], 'readonly');
    const store = transaction.objectStore(DB_CONFIG.STORES.SITE_OVERRIDES);

    return new Promise((resolve, reject) => {
      const request = store.get(domain);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete a site override
   * @param {string} domain - Domain to remove override for
   */
  async deleteSiteOverride(domain) {
    await this.ensureReady();
    const transaction = this.db.transaction([DB_CONFIG.STORES.SITE_OVERRIDES], 'readwrite');
    const store = transaction.objectStore(DB_CONFIG.STORES.SITE_OVERRIDES);

    return new Promise((resolve, reject) => {
      const request = store.delete(domain);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Export all data for backup
   * @returns {Promise<Object>} All database contents
   */
  async exportAllData() {
    await this.ensureReady();

    const [sessions, dailyStats, limits, settings, customCategories, siteOverrides] = await Promise.all([
      this.getAllSessions(),
      this.getAllDailyStats(),
      this.getAllLimits(),
      this.getSettings(),
      this.getAllCustomCategories(),
      this.getAllSiteOverrides()
    ]);

    return {
      sessions,
      dailyStats,
      limits,
      settings,
      customCategories,
      siteOverrides
    };
  }

  // ================================
  // Domain Categories Cache Methods
  // ================================

  /**
   * Get domain category from cache
   * @param {string} domain - Domain to lookup
   * @returns {Promise<Object|null>} Category data or null
   */
  async getDomainCategory(domain) {
    await this.ensureReady();
    const transaction = this.db.transaction([DB_CONFIG.STORES.DOMAIN_CATEGORIES], 'readonly');
    const store = transaction.objectStore(DB_CONFIG.STORES.DOMAIN_CATEGORIES);

    return new Promise((resolve, reject) => {
      const request = store.get(domain.toLowerCase());
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save domain category to cache
   * @param {string} domain - Domain name
   * @param {Object} categoryData - { category, confidence, lastUpdated }
   */
  async saveDomainCategory(domain, categoryData) {
    await this.ensureReady();
    const transaction = this.db.transaction([DB_CONFIG.STORES.DOMAIN_CATEGORIES], 'readwrite');
    const store = transaction.objectStore(DB_CONFIG.STORES.DOMAIN_CATEGORIES);

    return new Promise((resolve, reject) => {
      const request = store.put({
        domain: domain.toLowerCase(),
        category: categoryData.category,
        subcategory: categoryData.subcategory || null,
        confidence: categoryData.confidence,
        lastUpdated: categoryData.lastUpdated || Date.now()
      });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save multiple domain categories (bulk insert)
   * @param {Object} domainMap - { 'domain': { category, confidence }, ... }
   */
  async saveDomainCategories(domainMap) {
    await this.ensureReady();
    const transaction = this.db.transaction([DB_CONFIG.STORES.DOMAIN_CATEGORIES], 'readwrite');
    const store = transaction.objectStore(DB_CONFIG.STORES.DOMAIN_CATEGORIES);

    const promises = Object.entries(domainMap).map(([domain, data]) => {
      return new Promise((resolve, reject) => {
        const request = store.put({
          domain: domain.toLowerCase(),
          category: data.category,
          subcategory: data.subcategory || null,
          confidence: data.confidence,
          lastUpdated: Date.now()
        });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });

    return Promise.all(promises);
  }

  /**
   * Get all domain categories from cache
   * @returns {Promise<Array>} Array of all cached domains
   */
  async getAllDomainCategories() {
    await this.ensureReady();
    const transaction = this.db.transaction([DB_CONFIG.STORES.DOMAIN_CATEGORIES], 'readonly');
    const store = transaction.objectStore(DB_CONFIG.STORES.DOMAIN_CATEGORIES);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear old domain categories (older than specified date)
   * @param {number} olderThan - Timestamp threshold
   */
  async clearOldDomainCategories(olderThan) {
    await this.ensureReady();
    const transaction = this.db.transaction([DB_CONFIG.STORES.DOMAIN_CATEGORIES], 'readwrite');
    const store = transaction.objectStore(DB_CONFIG.STORES.DOMAIN_CATEGORIES);
    const index = store.index('lastUpdated');

    return new Promise((resolve, reject) => {
      const range = IDBKeyRange.upperBound(olderThan);
      const request = index.openCursor(range);
      let deletedCount = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        } else {
          console.log(`[DBManager] Cleared ${deletedCount} old domain categories`);
          resolve(deletedCount);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all domain categories cache
   */
  async clearAllDomainCategories() {
    await this.ensureReady();
    return this.clearStore(DB_CONFIG.STORES.DOMAIN_CATEGORIES);
  }
}

// Export singleton instance
export const dbManager = new DBManager();
