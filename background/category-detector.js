/**
 * Category Detector v2
 * 
 * 2단계 분류 시스템:
 * 1. 도메인 기반 분류 (well-known domains)
 * 2. 콘텐츠 기반 분류 (키워드, 메타데이터)
 */

import { CATEGORIES } from '../common/constants.js';
import { dbManager } from './db-manager.js';
import { getWellKnownDomain, checkPathRules } from '../common/well-known-domains.js';

class CategoryDetector {
  constructor() {
    this.categories = { ...CATEGORIES };
    this.customCategories = {};
    this.siteOverrides = {};
  }

  /**
   * Load custom categories from database
   */
  async loadCustomCategories() {
    try {
      const customCats = await dbManager.getAllCustomCategories();
      this.customCategories = {};

      customCats.forEach(cat => {
        this.customCategories[cat.id] = {
          name: cat.name,
          icon: cat.icon || '📁',
          color: cat.color || '#A0A0A0',
          domains: cat.domains || [],
          keywords: cat.keywords || [],
          isCustom: true
        };
      });

      // Merge with built-in categories
      this.categories = { ...CATEGORIES, ...this.customCategories };
    } catch (error) {
      console.error('Error loading custom categories:', error);
    }
  }

  /**
   * Load site overrides from database
   */
  async loadSiteOverrides() {
    try {
      const overrides = await dbManager.getAllSiteOverrides();
      this.siteOverrides = {};

      overrides.forEach(override => {
        this.siteOverrides[override.domain.toLowerCase()] = override.category;
      });
    } catch (error) {
      console.error('Error loading site overrides:', error);
    }
  }


  /**
   * Main classification method
   * @param {string} url - Page URL
   * @param {string} title - Page title
   * @param {Object} metadata - Page metadata from content script
   * @returns {Object} Classification result with category, confidence, method
   */
  /**
   * Detect category (Domain-based classification)
   *
   * 새로운 플로우:
   * 1. User override 확인
   * 2. Well-known domain 확인
   *    - Single-purpose → 즉시 반환
   *    - Multipurpose → 서버 분류 필요
   * 3. Unknown domain → 서버 분류 필요
   */
  async detectCategory(url, title = '', metadata = null) {
    if (!url) {
      return { category: 'other', confidence: 0.3, method: 'no_url' };
    }

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.replace(/^www\./, '').toLowerCase();
      const pathname = urlObj.pathname;

      // 1. User site override (highest priority)
      const overrideResult = this.checkSiteOverride(hostname);
      if (overrideResult) {
        return overrideResult;
      }

      // 2. Well-known domain 확인
      const domainInfo = getWellKnownDomain(hostname);

      if (domainInfo) {
        // 2.1. Single-purpose domain → 즉시 분류
        if (domainInfo.type === 'single') {
          return {
            category: domainInfo.category,
            confidence: 1.0,
            method: 'domain_single'
          };
        }

        // 2.2. Multipurpose domain → 메타데이터로 로컬 분류 시도, 안되면 서버
        if (domainInfo.type === 'multipurpose') {
          // Path rule 확인 (간단한 경우)
          const pathResult = checkPathRules(domainInfo.domain, pathname);
          if (pathResult) {
            return pathResult;
          }

          // YouTube: 메타데이터 또는 URL 기반 로컬 분류
          // TODO: 테스트 후 활성화
          // if (domainInfo.domain === 'youtube.com' || domainInfo.domain === 'youtu.be') {
          //   const ytResult = this.classifyYouTubeByMetadata(metadata?.youtube || {}, urlObj);
          //   if (ytResult) {
          //     return ytResult;
          //   }
          // }

          // 서버 분류 필요 (메타데이터 포함)
          return {
            category: 'needs_server_classification',
            confidence: 0,
            method: 'multipurpose',
            multipurpose: true,
            url: url,  // Full URL 필요
            metadata: metadata  // Metadata 필요 (YouTube 채널 등)
          };
        }
      }

      // 3. Unknown domain → 서버 분류 필요
      return {
        category: 'needs_server_classification',
        confidence: 0,
        method: 'unknown_domain',
        needsServerClassification: true,
        url: url
      };


    } catch (error) {
      console.error('Error in detectCategory:', error);
      return { category: 'other', confidence: 0.3, method: 'error' };
    }
  }

  /**
   * Check user site override
   */
  checkSiteOverride(hostname) {
    const domainLower = hostname.toLowerCase();

    // Exact match
    if (this.siteOverrides[domainLower]) {
      return {
        category: this.siteOverrides[domainLower],
        confidence: 1.0,
        method: 'user_override'
      };
    }

    // Parent domain match
    for (const [overrideDomain, category] of Object.entries(this.siteOverrides)) {
      if (domainLower.endsWith('.' + overrideDomain) || domainLower === overrideDomain) {
        return {
          category,
          confidence: 1.0,
          method: 'user_override'
        };
      }
    }

    return null;
  }

  /**
   * Check if domain is multipurpose
   */
  isMultipurposeDomain(domain) {
    const info = getWellKnownDomain(domain);
    return info?.type === 'multipurpose';
  }

  /**
   * Classify YouTube content locally using page metadata
   * @returns {Object|null} Classification result, or null if can't determine
   */
  classifyYouTubeByMetadata(ytData, urlObj) {
    // YouTube Music domain → always music
    if (ytData.isMusic) {
      return { category: 'music', confidence: 1.0, method: 'youtube_music_domain' };
    }

    // Music playlist prefixes (RDMM, RDAMVM, RDCLAK, RDAMPL, OLAK)
    if (ytData.isMusicPlaylist) {
      return { category: 'music', confidence: 0.95, method: 'youtube_music_playlist' };
    }

    // Shorts → entertainment
    if (ytData.isShorts) {
      return { category: 'entertainment', confidence: 0.95, method: 'youtube_shorts' };
    }

    // Genre meta tag (uploader-set category)
    if (ytData.genre) {
      const genreMap = {
        'Music':                'music',
        'Gaming':               'games',
        'Education':            'learning',
        'Science & Technology':  'learning',
        'Howto & Style':        'learning',
        'News & Politics':      'news',
        'Entertainment':        'entertainment',
        'Comedy':               'entertainment',
        'Film & Animation':     'entertainment',
        'Sports':               'entertainment',
        'Autos & Vehicles':     'entertainment',
        'Pets & Animals':       'entertainment',
        'Travel & Events':      'entertainment',
        'People & Blogs':       'social',
        'Nonprofits & Activism': 'news'
      };

      const mapped = genreMap[ytData.genre];
      if (mapped) {
        return { category: mapped, confidence: 0.9, method: 'youtube_genre' };
      }
    }

    // URL parameter check for music playlists (fallback if metadata not yet loaded)
    const listParam = urlObj?.searchParams?.get('list') || '';
    const musicPrefixes = ['RDMM', 'RDAMVM', 'RDCLAK', 'RDAMPL', 'OLAK'];
    if (musicPrefixes.some(prefix => listParam.startsWith(prefix))) {
      return { category: 'music', confidence: 0.95, method: 'youtube_music_playlist_url' };
    }

    return null;
  }

  /**
   * Check if two categories are related
   */
  areRelated(category1, category2) {
    if (category1 === category2) return true;

    const relatedPairs = [
      ['shopping', 'news'],
      ['education', 'news'],
      ['workspace', 'education'],
      ['social', 'entertainment']
    ];

    return relatedPairs.some(pair =>
      (pair[0] === category1 && pair[1] === category2) ||
      (pair[1] === category1 && pair[0] === category2)
    );
  }

  /**
   * Get category info
   */
  getCategoryInfo(key) {
    return this.categories[key] || this.categories.other;
  }

  /**
   * Get all categories
   */
  getAllCategories() {
    return this.categories;
  }

  /**
   * Get custom categories
   */
  getCustomCategories() {
    return this.customCategories;
  }

  /**
   * Check if category is custom
   */
  isCustomCategory(key) {
    return this.customCategories.hasOwnProperty(key);
  }
}

// Export singleton instance
export const categoryDetector = new CategoryDetector();
