// Category definitions with domains, keywords, and styling
export const CATEGORIES = {
  social: {
    name: 'Social Media',
    icon: '📱',
    color: '#FFEAA7',  // Unproductive - Pastel Yellow
    domains: [
      'instagram.com', 'twitter.com', 'x.com', 'facebook.com', 'tiktok.com',
      'linkedin.com', 'reddit.com', 'snapchat.com', 'pinterest.com',
      'tumblr.com', 'discord.com', 'telegram.org', 'whatsapp.com',
      'threads.net', 'mastodon.social', 'bluesky.social', 'wechat.com',
      'kakao.com', 'band.us', 'everytime.kr', 'blind.com'
    ],
    keywords: [
      'feed', 'post', 'story', 'reels', 'shorts', 'tweet', 'status',
      'profile', 'follow', 'follower', 'following', 'like', 'comment', 'share',
      'trending', 'viral', 'thread', 'dm', 'message', 'chat', 'friends',
      'notification', 'timeline', 'explore', 'discover'
    ]
  },
  entertainment: {
    name: 'Entertainment',
    icon: '🎬',
    color: '#81ECEC',  // Unproductive - Tiffany Blue
    domains: [
      'youtube.com', 'youtu.be', 'netflix.com', 'twitch.tv',
      'vimeo.com', 'dailymotion.com', 'hulu.com',
      'disneyplus.com', 'primevideo.com', 'crunchyroll.com', 'funimation.com',
      'wavve.com', 'tving.com', 'watcha.com', 'laftel.net',
      'afreecatv.com', 'chzzk.naver.com', 'vlive.tv', 'viki.com'
    ],
    keywords: [
      'watch', 'video', 'stream', 'streaming', 'episode',
      'series', 'movie', 'film', 'live', 'subscribe', 'channel', 'podcast',
      'player', 'entertainment',
      'anime', 'drama', 'show', 'season', 'trailer', 'clip',
      'vlog', 'reaction', 'funny', 'comedy', 'meme', 'compilation', 'highlights',
      '드라마', '예능', '영화'
    ]
  },
  music: {
    name: 'Music',
    icon: '🎵',
    color: '#DDA0DD',  // Unproductive/Neutral - Pastel Plum (can be work-friendly)
    domains: [
      'spotify.com', 'soundcloud.com', 'music.youtube.com',
      'apple.com/apple-music', 'music.apple.com', 'pandora.com',
      'deezer.com', 'tidal.com', 'last.fm', 'bandcamp.com'
    ],
    keywords: [
      'music', 'song', 'album', 'artist', 'playlist', 'play',
      'audio', 'lyrics', 'track', 'genre',
      'kpop', 'pop', 'rock', 'jazz', 'hiphop', 'hip-hop', 'r&b', 'edm',
      'classical', 'electronic', 'indie', 'metal', 'acoustic',
      '음악', '노래', '뮤직'
    ]
  },
  productivity: {
    name: 'Productivity',
    icon: '💼',
    color: '#74B9FF',  // Productive - Pastel Blue
    domains: [
      'docs.google.com', 'drive.google.com', 'gmail.com', 'outlook.com',
      'slack.com', 'github.com', 'gitlab.com', 'bitbucket.org', 'notion.so',
      'trello.com', 'asana.com', 'monday.com', 'atlassian.net', 'jira.com',
      'office.com', 'office365.com', 'figma.com', 'canva.com', 'zoom.us',
      'teams.microsoft.com', 'meet.google.com', 'webex.com', 'dropbox.com',
      'box.com', 'evernote.com', 'onenote.com', 'airtable.com',
      'clickup.com', 'basecamp.com', 'linear.app', 'height.app',
      'aws.amazon.com', 'console.cloud.google.com', 'azure.microsoft.com',
      'vercel.com', 'netlify.com', 'heroku.com', 'digitalocean.com',
      'codecov.io', 'travis-ci.org', 'circleci.com', 'jenkins.io'
    ],
    keywords: [
      'document', 'doc', 'spreadsheet', 'presentation', 'email', 'inbox',
      'calendar', 'meeting', 'task', 'project', 'workflow', 'code', 'coding',
      'commit', 'pull request', 'pr', 'issue', 'repository', 'repo', 'branch',
      'deploy', 'deployment', 'build', 'ci/cd', 'dashboard', 'analytics',
      'workspace', 'team', 'collaborate', 'collaboration', 'share', 'editor',
      'template', 'folder', 'file', 'upload', 'download', 'sync'
    ]
  },
  shopping: {
    name: 'Shopping',
    icon: '🛒',
    color: '#A29BFE',  // Neutral - Pastel Purple
    domains: [
      'amazon.com', 'amazon.co.jp', 'ebay.com', 'aliexpress.com',
      'coupang.com', 'gmarket.co.kr', '11st.co.kr', 'auction.co.kr',
      'interpark.com', 'wemakeprice.com', 'tmon.co.kr', 'ssg.com',
      'lotte.com', 'hmall.com', 'gsshop.com', 'cjmall.com',
      'shopify.com', 'etsy.com', 'walmart.com', 'target.com', 'bestbuy.com',
      'shein.com', 'taobao.com', 'rakuten.co.jp', 'mercari.com',
      'zigzag.kr', 'musinsa.com', 'kream.co.kr', '번개장터.com'
    ],
    keywords: [
      'product', 'cart', 'checkout', 'order', 'shipping', 'delivery', 'price',
      'buy', 'purchase', 'review', 'rating', 'deal', 'discount', 'coupon', 'sale',
      'shop', 'store', 'brand', 'item', 'add to cart', 'wishlist', 'compare',
      'payment', 'pay', 'refund', 'return', 'exchange', 'track', 'fashion'
    ]
  },
  news: {
    name: 'News & Reading',
    icon: '📰',
    color: '#FDCB6E',  // Neutral - Yellow
    domains: [
      'nytimes.com', 'theguardian.com', 'bbc.com', 'cnn.com', 'reuters.com',
      'medium.com', 'substack.com', 'news.ycombinator.com', 'techcrunch.com',
      'naver.com', 'daum.net', 'nate.com', 'chosun.com', 'donga.com',
      'joins.com', 'hani.co.kr', 'khan.co.kr', 'yna.co.kr', 'newsis.com',
      'news.google.com', 'yahoo.com/news', 'bloomberg.com', 'wsj.com',
      'economist.com', 'wired.com', 'arstechnica.com', 'theatlantic.com',
      'vox.com', 'vice.com', 'buzzfeed.com', 'huffpost.com'
    ],
    keywords: [
      'news', 'article', 'breaking', 'headline', 'report', 'story', 'today',
      'opinion', 'analysis', 'editorial', 'blog', 'post', 'read', 'reading',
      'journalist', 'press', 'media', 'latest', 'update', 'politics',
      'economy', 'business', 'tech', 'sports', 'culture', 'world', 'local'
    ]
  },
  games: {
    name: 'Games',
    icon: '🎮',
    color: '#FAB1A0',  // Unproductive - Pastel Peach
    domains: [
      'steampowered.com', 'store.steampowered.com', 'steamcommunity.com',
      'epicgames.com', 'store.epicgames.com', 'ea.com', 'origin.com',
      'battle.net', 'blizzard.com', 'riotgames.com', 'leagueoflegends.com',
      'valorant.com', 'playvalorant.com', 'minecraft.net', 'mojang.com',
      'roblox.com', 'chess.com', 'lichess.org', 'geoguessr.com',
      'itch.io', 'miniclip.com', 'poki.com', 'crazygames.com', 'y8.com',
      'nexon.com', 'pmang.com', 'hangame.com', 'plaync.com'
    ],
    keywords: [
      'game', 'games', 'gaming', 'play', 'player', 'multiplayer', 'online',
      'level', 'score', 'achievement', 'quest', 'battle', 'match', 'competitive',
      'rank', 'ranked', 'tournament', 'esports', 'steam', 'download', 'install',
      'fps', 'mmo', 'rpg', 'strategy', 'puzzle', 'action', 'adventure',
      'gameplay', 'walkthrough', 'playthrough', 'speedrun', 'lets play', 'letsplay',
      'gamer', 'streamer', 'fortnite', 'minecraft', 'valorant', 'overwatch',
      'league of legends', 'lol', 'dota', 'pubg', 'apex', 'cod', 'gta',
      '롤', '발로란트', '오버워치', '배그', '마인크래프트', '게임'
    ]
  },
  learning: {
    name: 'Learning',
    icon: '📚',
    color: '#A3D8F4',  // Productive - Pastel Sky Blue
    domains: [
      'coursera.org', 'udemy.com', 'edx.org', 'khanacademy.org', 'skillshare.com',
      'stackoverflow.com', 'stackexchange.com', 'wikipedia.org', 'wikimedia.org',
      'mdn.org', 'developer.mozilla.org', 'w3schools.com', 'freecodecamp.org',
      'codecademy.com', 'leetcode.com', 'hackerrank.com', 'codewars.com',
      'brilliant.org', 'duolingo.com', 'memrise.com', 'quizlet.com',
      'scholar.google.com', 'researchgate.net', 'arxiv.org', 'jstor.org',
      'mathway.com', 'wolframalpha.com', 'desmos.com', 'photomath.com',
      'megastudy.net', 'ebs.co.kr', 'classu.co.kr', 'classting.com'
    ],
    keywords: [
      'course', 'courses', 'lesson', 'tutorial', 'learn', 'learning', 'study',
      'education', 'lecture', 'class', 'quiz', 'test', 'exam', 'assignment',
      'documentation', 'docs', 'guide', 'reference', 'api', 'manual',
      'training', 'workshop', 'certificate', 'degree', 'university', 'college',
      'school', 'student', 'teacher', 'professor', 'research', 'academic',
      'how to', 'howto', 'explained', 'introduction', 'beginner', 'basics',
      'coding', 'programming', 'math', 'science', 'physics', 'chemistry', 'biology',
      'history', 'language', 'english', 'korean', 'japanese', 'chinese',
      '강의', '강좌', '수업', '학습', '배우기', '공부', '교육', '수학', '과학', '영어'
    ]
  },
  adult: {
    name: 'Adult',
    icon: '🔞',
    color: '#FFB8B8',  // Unproductive - Pastel Pink
    domains: [
      // Privacy mode - domains will be checked but not displayed
      'pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com',
      'redtube.com', 'youporn.com', 'tube8.com', 'spankbang.com'
    ],
    keywords: [
      // Privacy mode - keywords will be checked but not logged
      'porn', 'xxx', 'adult', 'nsfw', 'sex', 'sexy', 'nude', 'naked'
    ]
  },
  other: {
    name: 'Other',
    icon: '➕',
    color: '#DFE6E9',  // Neutral - Pastel Gray
    domains: [],
    keywords: []
  }
};

// Session timeout settings (in milliseconds)
export const SESSION_TIMEOUTS = {
  CORE: 5 * 60 * 1000,      // 5 minutes for core session
  EXTENDED: 7 * 60 * 1000,  // 7 minutes for extended session
  IDLE: 10 * 60 * 1000      // 10 minutes for idle timeout
};

// Session states
export const SESSION_STATES = {
  IDLE: 'idle',
  CORE: 'core',
  EXTENDED: 'extended'
};

// Database configuration
export const DB_CONFIG = {
  NAME: 'WebActivityTracker',
  VERSION: 4,  // Incremented for domainCategories store
  STORES: {
    SESSIONS: 'sessions',
    DAILY_STATS: 'dailyStats',
    LIMITS: 'limits',
    SETTINGS: 'settings',
    FOCUS_SESSIONS: 'focusSessions',
    CUSTOM_CATEGORIES: 'customCategories',
    SITE_OVERRIDES: 'siteOverrides',
    DOMAIN_CATEGORIES: 'domainCategories'  // 서버 기반 도메인 카테고리 캐시
  }
};

// Default settings
export const DEFAULT_SETTINGS = {
  weekStartDay: 1,  // 0 = Sunday, 1 = Monday (default), 6 = Saturday
  privacyMode: {
    enabled: false,
    autoDelete: true,
    excludeFromStats: true,
    hideFromTimeline: true
  },
  customCategories: [],
  notifications: {
    enabled: true,
    alertAt: 0.8,  // Alert at 80% of limit
    sessionWarning: true,
    sessionWarningMinutes: 90  // Warn after 90 minutes continuous session
  },
  serverSync: {
    enabled: false,              // Auto-update categories from server
    shareUsageData: false,       // Share anonymous usage statistics
    lastServerSync: null,        // Last sync timestamp
    categoryVersion: '1.0.0'     // Current category database version
  },
  historyAnalysis: {
    autoAnalyzeOnInstall: true,  // Automatically analyze history on first install
    analyzedOnInstall: false,    // Whether history was analyzed on install
    lastAnalysisDate: null,      // Last manual analysis timestamp
    analyzedDays: 30,            // Number of days analyzed
    showApproximatedData: true   // Show approximated data in dashboard
  }
};

// Color palette (iOS style)
export const COLORS = {
  primary: '#007AFF',
  background: '#F2F2F7',
  card: '#FFFFFF',
  text: '#000000',
  secondaryText: '#8E8E93',
  border: '#C6C6C8'
};

// Time formatting
export const TIME_FORMAT = {
  HOUR: 3600000,
  MINUTE: 60000,
  SECOND: 1000
};

// Productivity groupings
export const PRODUCTIVITY_GROUPS = {
  productive: {
    name: 'Productive',
    categories: ['productivity', 'learning'],
    color: '#007AFF',  // Blue
    icon: '✓'
  },
  unproductive: {
    name: 'Unproductive',
    categories: ['social', 'entertainment', 'music', 'games', 'adult'],
    color: '#FF9500',  // Orange
    icon: '✗'
  },
  neutral: {
    name: 'Neutral',
    categories: ['shopping', 'news', 'other'],
    color: '#8E8E93',  // Gray
    icon: '−'
  }
};
