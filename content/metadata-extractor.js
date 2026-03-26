/**
 * Metadata Extractor - Content Script
 * Extracts page metadata for better category classification
 */

(function() {
  'use strict';

  // Avoid running multiple times
  if (window.__metadataExtractorLoaded) return;
  window.__metadataExtractorLoaded = true;

  /**
   * Extract all relevant metadata from the page
   */
  function extractMetadata() {
    const metadata = {
      // Basic
      url: window.location.href,
      title: document.title,
      
      // Open Graph
      ogType: getMetaContent('og:type'),
      ogSiteName: getMetaContent('og:site_name'),
      ogTitle: getMetaContent('og:title'),
      ogDescription: getMetaContent('og:description'),
      
      // Twitter Card
      twitterCard: getMetaContent('twitter:card'),
      twitterSite: getMetaContent('twitter:site'),
      
      // Standard Meta
      description: getMetaContent('description'),
      keywords: getMetaContent('keywords'),
      author: getMetaContent('author'),
      
      // Schema.org (JSON-LD)
      schemaType: extractSchemaType(),
      
      // Platform-specific
      platform: detectPlatform()
    };

    // YouTube specific
    if (isYouTube()) {
      metadata.youtube = extractYouTubeData();
    }

    // Twitch specific
    if (isTwitch()) {
      metadata.twitch = extractTwitchData();
    }

    // Reddit specific
    if (isReddit()) {
      metadata.reddit = extractRedditData();
    }

    return metadata;
  }

  /**
   * Get meta tag content by name or property
   */
  function getMetaContent(name) {
    const meta = document.querySelector(
      `meta[property="${name}"], meta[name="${name}"]`
    );
    return meta?.content || null;
  }

  /**
   * Extract Schema.org type from JSON-LD
   */
  function extractSchemaType() {
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        const data = JSON.parse(script.textContent);
        if (data['@type']) {
          return data['@type'];
        }
        if (Array.isArray(data) && data[0]?.['@type']) {
          return data[0]['@type'];
        }
      }
    } catch (e) {
      // Ignore JSON parse errors
    }
    return null;
  }

  /**
   * Detect platform/site type
   */
  function detectPlatform() {
    const hostname = window.location.hostname;
    
    if (hostname.includes('youtube.com')) return 'youtube';
    if (hostname.includes('twitch.tv')) return 'twitch';
    if (hostname.includes('reddit.com')) return 'reddit';
    if (hostname.includes('twitter.com') || hostname.includes('x.com')) return 'twitter';
    if (hostname.includes('facebook.com')) return 'facebook';
    if (hostname.includes('instagram.com')) return 'instagram';
    if (hostname.includes('github.com')) return 'github';
    if (hostname.includes('naver.com')) return 'naver';
    
    return null;
  }

  // Platform checks
  function isYouTube() {
    return window.location.hostname.includes('youtube.com');
  }

  function isTwitch() {
    return window.location.hostname.includes('twitch.tv');
  }

  function isReddit() {
    return window.location.hostname.includes('reddit.com');
  }

  /**
   * Extract YouTube-specific data
   */
  function extractYouTubeData() {
    const data = {
      channelName: null,
      channelUrl: null,
      videoId: null,
      isShorts: false,
      isMusic: false,
      isLive: false,
      category: null
    };

    try {
      // Video ID from URL
      const urlParams = new URLSearchParams(window.location.search);
      data.videoId = urlParams.get('v');

      // Check URL type
      data.isShorts = window.location.pathname.includes('/shorts/');
      data.isMusic = window.location.hostname === 'music.youtube.com';

      // Channel name - try multiple selectors
      const channelSelectors = [
        'ytd-channel-name yt-formatted-string a',
        'ytd-channel-name a',
        '#channel-name a',
        '#owner-name a',
        '.ytd-channel-name a',
        'a.yt-simple-endpoint.style-scope.yt-formatted-string'
      ];

      for (const selector of channelSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          data.channelName = el.textContent?.trim();
          data.channelUrl = el.href;
          break;
        }
      }

      // Check if live
      const liveBadge = document.querySelector('.ytp-live-badge');
      data.isLive = liveBadge?.getAttribute('disabled') === null;

      // Try to get category from meta
      data.category = getMetaContent('og:video:tag');

    } catch (e) {
      console.error('[MetadataExtractor] YouTube extraction error:', e);
    }

    return data;
  }

  /**
   * Extract Twitch-specific data
   */
  function extractTwitchData() {
    const data = {
      channelName: null,
      gameName: null,
      isLive: false
    };

    try {
      // Channel from URL
      const pathParts = window.location.pathname.split('/').filter(Boolean);
      if (pathParts.length > 0 && !['directory', 'videos', 'clips'].includes(pathParts[0])) {
        data.channelName = pathParts[0];
      }

      // Game name
      const gameLink = document.querySelector('a[data-a-target="stream-game-link"]');
      data.gameName = gameLink?.textContent?.trim();

      // Live indicator
      data.isLive = !!document.querySelector('.live-indicator');

    } catch (e) {
      console.error('[MetadataExtractor] Twitch extraction error:', e);
    }

    return data;
  }

  /**
   * Extract Reddit-specific data
   */
  function extractRedditData() {
    const data = {
      subreddit: null,
      postType: null
    };

    try {
      // Subreddit from URL
      const match = window.location.pathname.match(/^\/r\/([^\/]+)/);
      if (match) {
        data.subreddit = match[1];
      }

      // Post type (link, text, image, video)
      const postType = document.querySelector('[data-post-type]');
      data.postType = postType?.getAttribute('data-post-type');

    } catch (e) {
      console.error('[MetadataExtractor] Reddit extraction error:', e);
    }

    return data;
  }

  /**
   * Log metadata to console for debugging
   */
  function logMetadata(metadata) {
    console.group('%c[deTime] Page Metadata', 'color: #8BAF5B; font-weight: bold;');
    
    console.log('%cBasic:', 'font-weight: bold;');
    console.log('  URL:', metadata.url);
    console.log('  Title:', metadata.title);
    
    console.log('%cOpen Graph:', 'font-weight: bold;');
    console.log('  og:type:', metadata.ogType);
    console.log('  og:site_name:', metadata.ogSiteName);
    console.log('  og:title:', metadata.ogTitle);
    console.log('  og:description:', metadata.ogDescription?.substring(0, 100) + '...');
    
    console.log('%cOther Meta:', 'font-weight: bold;');
    console.log('  description:', metadata.description?.substring(0, 100) + '...');
    console.log('  keywords:', metadata.keywords);
    console.log('  author:', metadata.author);
    console.log('  schema.org type:', metadata.schemaType);
    
    console.log('%cPlatform:', 'font-weight: bold;', metadata.platform);
    
    if (metadata.youtube) {
      console.log('%cYouTube:', 'font-weight: bold; color: #FF0000;');
      console.log('  Channel:', metadata.youtube.channelName);
      console.log('  Channel URL:', metadata.youtube.channelUrl);
      console.log('  Video ID:', metadata.youtube.videoId);
      console.log('  Is Shorts:', metadata.youtube.isShorts);
      console.log('  Is Music:', metadata.youtube.isMusic);
      console.log('  Is Live:', metadata.youtube.isLive);
    }
    
    if (metadata.twitch) {
      console.log('%cTwitch:', 'font-weight: bold; color: #9146FF;');
      console.log('  Channel:', metadata.twitch.channelName);
      console.log('  Game:', metadata.twitch.gameName);
      console.log('  Is Live:', metadata.twitch.isLive);
    }
    
    if (metadata.reddit) {
      console.log('%cReddit:', 'font-weight: bold; color: #FF4500;');
      console.log('  Subreddit:', metadata.reddit.subreddit);
      console.log('  Post Type:', metadata.reddit.postType);
    }
    
    console.groupEnd();
  }

  /**
   * Send metadata to background script
   */
  function sendMetadataToBackground(metadata) {
    try {
      chrome.runtime.sendMessage({
        type: 'PAGE_METADATA',
        data: metadata
      }).catch(() => {
        // Extension context might be invalidated
      });
    } catch (e) {
      // Ignore errors
    }
  }

  /**
   * Main execution
   */
  function run() {
    // Wait for page to be more loaded (for dynamic content)
    setTimeout(() => {
      const metadata = extractMetadata();
      
      // Log to console for debugging
      logMetadata(metadata);
      
      // Send to background
      sendMetadataToBackground(metadata);
    }, 1500);  // Wait 1.5s for dynamic content
  }

  // Run on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  // Also run on URL changes (SPA navigation)
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(run, 1500);
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });

})();
