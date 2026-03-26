// Server API configuration
export const SERVER_CONFIG = {
  // BASE_URL: 'http://localhost:8000/api',  // Local development server
  BASE_URL: 'https://api.detime.co/api',  // Production server (via Cloudflare Tunnel)
  ENDPOINTS: {
    CATEGORIES: '/categories',
    CATEGORIES_VERSION: '/categories/version',
    USAGE_STATS: '/usage-stats',
    CATEGORY_UPDATE: '/categories/update',
    HISTORY_REPORTS: '/history-reports',
    PLATFORM_DATA: '/platform-data',
    LEARNING_STATS: '/learning-stats',
    UPLOAD_VISIT: '/upload-visit',  // Real-time visit upload (deprecated, use batch)
    UPLOAD_VISIT_BATCH: '/upload-visits-batch',  // Batch visit upload (50개씩)
    GET_CATEGORY: '/get-category',   // Get category for domain
    DETECT_BATCH: '/detect-categories-batch'  // Batch category detection
  },
  UPDATE_INTERVAL: 24 * 60 * 60 * 1000, // 24 hours
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 5000 // 5 seconds
};

// Category database version
export const CATEGORY_DB_VERSION = {
  CURRENT: '1.0.0',
  LAST_UPDATED: null
};

// Anonymous usage stats configuration
export const USAGE_STATS_CONFIG = {
  ENABLED: false, // User consent required
  BATCH_SIZE: 50, // Send stats in batches
  SEND_INTERVAL: 60 * 60 * 1000, // 1 hour
  MIN_CONFIDENCE: 0.5 // Minimum confidence to report
};
