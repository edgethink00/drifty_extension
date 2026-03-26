/**
 * Keyword Extractor
 *
 * Extracts anonymized keywords from URLs and titles for category detection improvement.
 * Privacy-first approach: removes personal information, keeps only generic keywords.
 */

import { normalizeDomain } from '../common/utils.js';

// Common stopwords to filter out (English)
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'should', 'could', 'can', 'may', 'might', 'must', 'this',
  'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'my', 'your', 'his', 'her', 'its', 'our', 'their', 'me', 'him', 'us',
  'them', 'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all',
  'each', 'every', 'both', 'few', 'more', 'most', 'some', 'such', 'no',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just'
]);

// Personal information patterns to exclude
const PERSONAL_PATTERNS = [
  /\b\d{10,}\b/g,           // Long numbers (phone, IDs)
  /\b\d{4}-\d{2}-\d{2}\b/g, // Dates (YYYY-MM-DD)
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, // Emails
  /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g, // Names (John Smith)
  /\b(password|pwd|token|key|secret|auth)\b/gi, // Sensitive keywords
];

// URL patterns that should be generalized
const URL_PATTERNS = {
  youtube: {
    '/watch': '/watch',           // Video page
    '/channel/': '/channel',      // Channel page
    '/user/': '/user',            // User page
    '/playlist': '/playlist',     // Playlist
    '/shorts/': '/shorts',        // Shorts
    '/live/': '/live',            // Live stream
    '/@': '/channel',             // New channel format
  },
  reddit: {
    '/r/': '/subreddit',          // Subreddit
    '/u/': '/user',               // User profile
    '/comments/': '/post',        // Post
  },
  twitter: {
    '/status/': '/tweet',         // Tweet
    '/i/': '/page',               // Internal page
  },
  github: {
    '/blob/': '/file',            // File view
    '/issues/': '/issue',         // Issue
    '/pull/': '/pull',            // Pull request
  }
};

class KeywordExtractor {
  /**
   * Extract anonymized keywords from URL and title
   */
  extractKeywords(url, title = '') {
    try {
      const urlObj = new URL(url);
      const domain = normalizeDomain(urlObj.hostname.replace('www.', ''));

      // Extract URL pattern
      const urlPattern = this.extractUrlPattern(urlObj, domain);

      // Extract keywords from title
      const titleKeywords = this.extractFromTitle(title);

      // Extract keywords from URL path (if useful)
      const pathKeywords = this.extractFromPath(urlObj.pathname);

      // Combine and deduplicate
      const allKeywords = [...new Set([...titleKeywords, ...pathKeywords])];

      return {
        domain,
        urlPattern,
        keywords: allKeywords.slice(0, 10) // Limit to top 10 keywords
      };

    } catch (error) {
      console.error('Keyword extraction error:', error);
      return {
        domain: '',
        urlPattern: '',
        keywords: []
      };
    }
  }

  /**
   * Extract generalized URL pattern
   */
  extractUrlPattern(urlObj, domain) {
    const pathname = urlObj.pathname;

    // Check if domain has specific patterns
    const domainKey = Object.keys(URL_PATTERNS).find(key => domain.includes(key));

    if (domainKey) {
      const patterns = URL_PATTERNS[domainKey];

      for (const [pattern, replacement] of Object.entries(patterns)) {
        if (pathname.includes(pattern)) {
          return replacement;
        }
      }
    }

    // Generic pattern extraction
    const parts = pathname.split('/').filter(p => p.length > 0);

    if (parts.length === 0) {
      return '/';
    }

    // If first part looks like content type (non-ID), keep it
    const firstPart = parts[0];
    if (this.isGenericPath(firstPart)) {
      return '/' + firstPart;
    }

    return '/';
  }

  /**
   * Check if path part is generic (not a personal ID)
   */
  isGenericPath(part) {
    // Too long (likely ID)
    if (part.length > 20) return false;

    // All numbers or hex (likely ID)
    if (/^[0-9a-f]+$/i.test(part)) return false;

    // Mixed alphanumeric that's too random (likely ID)
    if (/^[A-Za-z0-9_-]{8,}$/.test(part) && !/^[a-z]+$/.test(part)) return false;

    // Contains common generic words
    const genericWords = ['watch', 'video', 'article', 'post', 'page', 'search',
                          'category', 'product', 'item', 'channel', 'user'];

    return genericWords.some(word => part.toLowerCase().includes(word));
  }

  /**
   * Extract keywords from title
   */
  extractFromTitle(title) {
    if (!title || typeof title !== 'string') {
      return [];
    }

    // Remove personal information patterns
    let cleaned = title;
    PERSONAL_PATTERNS.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });

    // Split into words
    const words = cleaned
      .toLowerCase()
      // Remove special characters but keep spaces and hyphens
      .replace(/[^\w\s-]/g, ' ')
      // Split on whitespace
      .split(/\s+/)
      // Filter out empty, short, and stopwords
      .filter(word => {
        return word.length >= 3 &&
               !STOPWORDS.has(word) &&
               !/^\d+$/.test(word); // No pure numbers
      });

    // Remove duplicates and sort by length (prefer longer, more specific terms)
    return [...new Set(words)]
      .sort((a, b) => b.length - a.length)
      .slice(0, 8); // Top 8 keywords from title
  }

  /**
   * Extract keywords from URL path
   */
  extractFromPath(pathname) {
    if (!pathname || pathname === '/') {
      return [];
    }

    // Split path and decode
    const parts = pathname.split('/')
      .filter(p => p.length > 0)
      .map(p => {
        try {
          return decodeURIComponent(p);
        } catch {
          return p;
        }
      });

    // Extract meaningful words from path parts
    const keywords = [];

    for (const part of parts) {
      // Skip if looks like an ID
      if (/^[0-9a-f]{8,}$/i.test(part)) continue;
      if (part.length > 30) continue; // Too long, likely ID

      // Split on common separators
      const words = part
        .toLowerCase()
        .split(/[-_.]/)
        .filter(w => {
          return w.length >= 3 &&
                 !STOPWORDS.has(w) &&
                 !/^\d+$/.test(w);
        });

      keywords.push(...words);
    }

    return [...new Set(keywords)].slice(0, 5); // Top 5 from path
  }

  /**
   * Calculate keyword confidence score
   * Higher score = more specific/useful keywords
   */
  calculateConfidence(keywords) {
    if (keywords.length === 0) return 0;

    let score = 0;

    // More keywords = higher confidence
    score += Math.min(keywords.length * 0.1, 0.5);

    // Longer keywords = more specific
    const avgLength = keywords.reduce((sum, kw) => sum + kw.length, 0) / keywords.length;
    score += Math.min(avgLength * 0.05, 0.3);

    // Has technical terms
    const technicalTerms = ['tutorial', 'guide', 'course', 'lesson', 'learn',
                            'review', 'news', 'game', 'music', 'video'];
    const hasTechnical = keywords.some(kw =>
      technicalTerms.some(term => kw.includes(term))
    );
    if (hasTechnical) score += 0.2;

    return Math.min(score, 1.0);
  }
}

export const keywordExtractor = new KeywordExtractor();
