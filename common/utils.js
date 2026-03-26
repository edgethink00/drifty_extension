import { TIME_FORMAT } from './constants.js';

/**
 * Format milliseconds to human-readable time
 * @param {number} ms - Time in milliseconds
 * @param {boolean} short - Use short format (e.g., "1h 30m" vs "1 hour 30 minutes")
 * @returns {string} Formatted time string
 */
export function formatTime(ms, short = true) {
  if (!ms || ms < 0) return short ? '0m' : '0 minutes';

  const hours = Math.floor(ms / TIME_FORMAT.HOUR);
  const minutes = Math.floor((ms % TIME_FORMAT.HOUR) / TIME_FORMAT.MINUTE);
  const seconds = Math.floor((ms % TIME_FORMAT.MINUTE) / TIME_FORMAT.SECOND);

  const parts = [];

  if (hours > 0) {
    parts.push(short ? `${hours}h` : `${hours} hour${hours > 1 ? 's' : ''}`);
  }
  if (minutes > 0) {
    parts.push(short ? `${minutes}m` : `${minutes} minute${minutes > 1 ? 's' : ''}`);
  }
  if (seconds > 0 && hours === 0 && !short) {
    parts.push(`${seconds} second${seconds > 1 ? 's' : ''}`);
  }

  return parts.length > 0 ? parts.join(' ') : (short ? '0m' : '0 minutes');
}

/**
 * Format milliseconds to time with seconds (e.g., "1h 30m 45s")
 * @param {number} ms - Time in milliseconds
 * @returns {string} Formatted time string with seconds
 */
export function formatTimeWithSeconds(ms) {
  if (!ms || ms < 0) return '0s';

  const hours = Math.floor(ms / TIME_FORMAT.HOUR);
  const minutes = Math.floor((ms % TIME_FORMAT.HOUR) / TIME_FORMAT.MINUTE);
  const seconds = Math.floor((ms % TIME_FORMAT.MINUTE) / TIME_FORMAT.SECOND);

  const parts = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  parts.push(`${seconds}s`);

  return parts.join(' ');
}

/**
 * Format date as YYYY-MM-DD using local timezone
 * @param {Date} date - Date object
 * @returns {string} Date string in YYYY-MM-DD format
 */
function formatDateToLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get today's date in YYYY-MM-DD format (local timezone)
 * @returns {string} Date string
 */
export function getTodayDate() {
  return formatDateToLocal(new Date());
}

/**
 * Get date string from timestamp (local timezone)
 * @param {number} timestamp - Unix timestamp
 * @returns {string} Date string in YYYY-MM-DD format
 */
export function getDateFromTimestamp(timestamp) {
  return formatDateToLocal(new Date(timestamp));
}

/**
 * Get start of day timestamp
 * @param {Date} date - Date object
 * @returns {number} Timestamp at start of day
 */
export function getStartOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Get end of day timestamp
 * @param {Date} date - Date object
 * @returns {number} Timestamp at end of day
 */
export function getEndOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

// Well-known domain aliases (map to canonical domain)
const DOMAIN_ALIASES = {
  'youtu.be': 'youtube.com',
  'm.youtube.com': 'youtube.com',
  'music.youtube.com': 'youtube.com',
  'm.facebook.com': 'facebook.com',
  'mobile.twitter.com': 'twitter.com',
  'm.twitter.com': 'twitter.com',
  'mobile.reddit.com': 'reddit.com',
  'm.reddit.com': 'reddit.com',
  'old.reddit.com': 'reddit.com',
  'i.reddit.com': 'reddit.com',
  'm.naver.com': 'naver.com',
  'm.daum.net': 'daum.net',
  'm.blog.naver.com': 'blog.naver.com',
  'm.cafe.naver.com': 'cafe.naver.com',
  'en.wikipedia.org': 'wikipedia.org',
  'ko.wikipedia.org': 'wikipedia.org',
  'ja.wikipedia.org': 'wikipedia.org',
  'm.wikipedia.org': 'wikipedia.org'
};

// Prefixes to remove from domains
const MOBILE_PREFIXES = ['m.', 'mobile.', 'amp.', 'touch.'];

/**
 * Normalize domain by removing mobile prefixes and mapping aliases
 * @param {string} domain - Domain name
 * @returns {string} Normalized domain name
 */
export function normalizeDomain(domain) {
  if (!domain) return '';

  let normalized = domain.toLowerCase();

  // Check for exact alias match first
  if (DOMAIN_ALIASES[normalized]) {
    return DOMAIN_ALIASES[normalized];
  }

  // Remove mobile prefixes
  for (const prefix of MOBILE_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.substring(prefix.length);
      break;
    }
  }

  // Check alias again after prefix removal
  if (DOMAIN_ALIASES[normalized]) {
    return DOMAIN_ALIASES[normalized];
  }

  return normalized;
}

/**
 * Extract domain from URL
 * @param {string} url - Full URL
 * @param {boolean} normalize - Whether to normalize the domain (default: true)
 * @returns {string} Domain name
 */
export function extractDomain(url, normalize = true) {
  try {
    const urlObj = new URL(url);
    let domain = urlObj.hostname.replace('www.', '');

    if (normalize) {
      domain = normalizeDomain(domain);
    }

    return domain;
  } catch {
    return '';
  }
}

/**
 * Extract keywords from text
 * @param {string} text - Text to search
 * @param {string[]} keywords - Keywords to find
 * @returns {number} Count of keyword matches
 */
export function countKeywords(text, keywords) {
  if (!text || !keywords) return 0;

  const lowerText = text.toLowerCase();
  return keywords.filter(keyword =>
    lowerText.includes(keyword.toLowerCase())
  ).length;
}

/**
 * Calculate percentage
 * @param {number} value - Current value
 * @param {number} total - Total value
 * @returns {number} Percentage (0-100)
 */
export function calculatePercentage(value, total) {
  if (!total || total === 0) return 0;
  return Math.round((value / total) * 100);
}

/**
 * Get last N days dates
 * @param {number} days - Number of days
 * @returns {string[]} Array of date strings
 */
export function getLastNDays(days = 7) {
  const dates = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    dates.push(formatDateToLocal(date));
  }

  return dates;
}

/**
 * Group array by key
 * @param {Array} array - Array to group
 * @param {string} key - Key to group by
 * @returns {Object} Grouped object
 */
export function groupBy(array, key) {
  return array.reduce((result, item) => {
    const group = item[key];
    if (!result[group]) {
      result[group] = [];
    }
    result[group].push(item);
    return result;
  }, {});
}

/**
 * Debounce function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Generate unique ID
 * @returns {string} Unique ID
 */
export function generateId() {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get time of day greeting
 * @returns {string} Greeting message
 */
export function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Format date to readable string
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 * @returns {string} Formatted date
 */
export function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (dateStr === getTodayDate()) return 'Today';
  if (dateStr === formatDateToLocal(yesterday)) return 'Yesterday';

  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  });
}
