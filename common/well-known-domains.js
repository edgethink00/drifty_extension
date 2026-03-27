/**
 * Well-known Domains Database
 * 
 * Types:
 * - single: 단일 목적 도메인, 즉시 분류 확정 (confidence: 1.0)
 * - multipurpose: 다목적 도메인, 콘텐츠 분석 필요
 */

export const WELL_KNOWN_DOMAINS = {
  // ============================================
  // PRODUCTIVITY - 업무 도구
  // ============================================
  
  // 개발/코딩
  "github.com": { category: "productivity", type: "single" },
  "gitlab.com": { category: "productivity", type: "single" },
  "bitbucket.org": { category: "productivity", type: "single" },
  "stackoverflow.com": { category: "productivity", type: "single" },
  "stackexchange.com": { category: "productivity", type: "single" },
  "npmjs.com": { category: "productivity", type: "single" },
  "pypi.org": { category: "productivity", type: "single" },
  "crates.io": { category: "productivity", type: "single" },
  "packagist.org": { category: "productivity", type: "single" },
  "rubygems.org": { category: "productivity", type: "single" },
  "maven.apache.org": { category: "productivity", type: "single" },
  "nuget.org": { category: "productivity", type: "single" },
  "hub.docker.com": { category: "productivity", type: "single" },
  "vercel.com": { category: "productivity", type: "single" },
  "netlify.com": { category: "productivity", type: "single" },
  "heroku.com": { category: "productivity", type: "single" },
  "aws.amazon.com": { category: "productivity", type: "single" },
  "cloud.google.com": { category: "productivity", type: "single" },
  "azure.microsoft.com": { category: "productivity", type: "single" },
  "digitalocean.com": { category: "productivity", type: "single" },
  "codepen.io": { category: "productivity", type: "single" },
  "codesandbox.io": { category: "productivity", type: "single" },
  "jsfiddle.net": { category: "productivity", type: "single" },
  "replit.com": { category: "productivity", type: "single" },
  "glitch.com": { category: "productivity", type: "single" },
  
  // 문서/협업
  "docs.google.com": { category: "productivity", type: "single" },
  "sheets.google.com": { category: "productivity", type: "single" },
  "slides.google.com": { category: "productivity", type: "single" },
  "drive.google.com": { category: "productivity", type: "single" },
  "notion.so": { category: "productivity", type: "single" },
  "notion.site": { category: "productivity", type: "single" },
  "trello.com": { category: "productivity", type: "single" },
  "asana.com": { category: "productivity", type: "single" },
  "monday.com": { category: "productivity", type: "single" },
  "clickup.com": { category: "productivity", type: "single" },
  "jira.atlassian.com": { category: "productivity", type: "single" },
  "confluence.atlassian.com": { category: "productivity", type: "single" },
  "slack.com": { category: "productivity", type: "single" },
  "linear.app": { category: "productivity", type: "single" },
  "figma.com": { category: "productivity", type: "single" },
  "miro.com": { category: "productivity", type: "single" },
  "airtable.com": { category: "productivity", type: "single" },
  "dropbox.com": { category: "productivity", type: "single" },
  "box.com": { category: "productivity", type: "single" },
  "evernote.com": { category: "productivity", type: "single" },
  "onenote.com": { category: "productivity", type: "single" },
  "obsidian.md": { category: "productivity", type: "single" },
  
  // 이메일
  "mail.google.com": { category: "productivity", type: "single" },
  "outlook.live.com": { category: "productivity", type: "single" },
  "outlook.office.com": { category: "productivity", type: "single" },
  "mail.yahoo.com": { category: "productivity", type: "single" },
  "protonmail.com": { category: "productivity", type: "single" },
  "mail.naver.com": { category: "productivity", type: "single" },
  "mail.daum.net": { category: "productivity", type: "single" },
  
  // 캘린더/일정
  "calendar.google.com": { category: "productivity", type: "single" },
  "calendly.com": { category: "productivity", type: "single" },
  
  // ============================================
  // EDUCATION - 교육/학습
  // ============================================
  
  // 온라인 강의
  "coursera.org": { category: "learning", type: "single" },
  "udemy.com": { category: "learning", type: "single" },
  "udacity.com": { category: "learning", type: "single" },
  "edx.org": { category: "learning", type: "single" },
  "skillshare.com": { category: "learning", type: "single" },
  "linkedin.com/learning": { category: "learning", type: "single" },
  "pluralsight.com": { category: "learning", type: "single" },
  "codecademy.com": { category: "learning", type: "single" },
  "freecodecamp.org": { category: "learning", type: "single" },
  "khanacademy.org": { category: "learning", type: "single" },
  "brilliant.org": { category: "learning", type: "single" },
  "masterclass.com": { category: "learning", type: "single" },
  "duolingo.com": { category: "learning", type: "single" },
  "memrise.com": { category: "learning", type: "single" },
  "class101.net": { category: "learning", type: "single" },
  "inflearn.com": { category: "learning", type: "single" },
  "nomadcoders.co": { category: "learning", type: "single" },
  "fastcampus.co.kr": { category: "learning", type: "single" },
  "programmers.co.kr": { category: "learning", type: "single" },
  
  // 코딩 연습
  "leetcode.com": { category: "learning", type: "single" },
  "hackerrank.com": { category: "learning", type: "single" },
  "codewars.com": { category: "learning", type: "single" },
  "exercism.org": { category: "learning", type: "single" },
  "baekjoon.com": { category: "learning", type: "single" },
  "acmicpc.net": { category: "learning", type: "single" },
  "codeforces.com": { category: "learning", type: "single" },
  "topcoder.com": { category: "learning", type: "single" },
  
  // 문서/레퍼런스
  "developer.mozilla.org": { category: "learning", type: "single" },
  "w3schools.com": { category: "learning", type: "single" },
  "devdocs.io": { category: "learning", type: "single" },
  "docs.python.org": { category: "learning", type: "single" },
  "reactjs.org": { category: "learning", type: "single" },
  "vuejs.org": { category: "learning", type: "single" },
  "angular.io": { category: "learning", type: "single" },
  "nextjs.org": { category: "learning", type: "single" },
  "typescriptlang.org": { category: "learning", type: "single" },
  "rust-lang.org": { category: "learning", type: "single" },
  "go.dev": { category: "learning", type: "single" },
  "kotlinlang.org": { category: "learning", type: "single" },
  "swift.org": { category: "learning", type: "single" },
  
  // 학술
  "scholar.google.com": { category: "learning", type: "single" },
  "arxiv.org": { category: "learning", type: "single" },
  "researchgate.net": { category: "learning", type: "single" },
  "academia.edu": { category: "learning", type: "single" },
  "jstor.org": { category: "learning", type: "single" },
  "sciencedirect.com": { category: "learning", type: "single" },
  "ieee.org": { category: "learning", type: "single" },
  "acm.org": { category: "learning", type: "single" },
  "wikipedia.org": { category: "learning", type: "single" },
  "wikimedia.org": { category: "learning", type: "single" },
  "britannica.com": { category: "learning", type: "single" },
  
  // AI/ML
  "chatgpt.com": { category: "learning", type: "single" },
  "chat.openai.com": { category: "learning", type: "single" },
  "claude.ai": { category: "learning", type: "single" },
  "perplexity.ai": { category: "learning", type: "single" },
  "huggingface.co": { category: "learning", type: "single" },
  "kaggle.com": { category: "learning", type: "single" },
  
  // ============================================
  // ENTERTAINMENT - 엔터테인먼트
  // ============================================
  
  // 스트리밍 (영상)
  "netflix.com": { category: "entertainment", type: "single" },
  "disneyplus.com": { category: "entertainment", type: "single" },
  "hulu.com": { category: "entertainment", type: "single" },
  "primevideo.com": { category: "entertainment", type: "single" },
  "hbomax.com": { category: "entertainment", type: "single" },
  "max.com": { category: "entertainment", type: "single" },
  "peacocktv.com": { category: "entertainment", type: "single" },
  "paramountplus.com": { category: "entertainment", type: "single" },
  "crunchyroll.com": { category: "entertainment", type: "single" },
  "funimation.com": { category: "entertainment", type: "single" },
  "viki.com": { category: "entertainment", type: "single" },
  "wavve.com": { category: "entertainment", type: "single" },
  "tving.com": { category: "entertainment", type: "single" },
  "watcha.com": { category: "entertainment", type: "single" },
  "coupangplay.com": { category: "entertainment", type: "single" },
  "laftel.net": { category: "entertainment", type: "single" },
  "serieson.naver.com": { category: "entertainment", type: "single" },
  
  // Music Streaming (now separate category)
  "spotify.com": { category: "music", type: "single" },
  "music.apple.com": { category: "music", type: "single" },
  "music.youtube.com": { category: "music", type: "single" },
  "soundcloud.com": { category: "music", type: "single" },
  "pandora.com": { category: "music", type: "single" },
  "tidal.com": { category: "music", type: "single" },
  "deezer.com": { category: "music", type: "single" },
  "music.bugs.co.kr": { category: "music", type: "single" },
  "melon.com": { category: "music", type: "single" },
  "genie.co.kr": { category: "music", type: "single" },
  "flo.com": { category: "music", type: "single" },
  "vibe.naver.com": { category: "music", type: "single" },
  "last.fm": { category: "music", type: "single" },
  "bandcamp.com": { category: "music", type: "single" },
  
  // 팟캐스트
  "podcasts.apple.com": { category: "entertainment", type: "single" },
  "podcasts.google.com": { category: "entertainment", type: "single" },
  
  // 웹툰/만화
  "webtoons.com": { category: "entertainment", type: "single" },
  "comic.naver.com": { category: "entertainment", type: "single" },
  "webtoon.kakao.com": { category: "entertainment", type: "single" },
  "lezhin.com": { category: "entertainment", type: "single" },
  "toomics.com": { category: "entertainment", type: "single" },
  "bomtoon.com": { category: "entertainment", type: "single" },
  "mangadex.org": { category: "entertainment", type: "single" },
  
  // 영화/TV 정보
  "imdb.com": { category: "entertainment", type: "single" },
  "rottentomatoes.com": { category: "entertainment", type: "single" },
  "letterboxd.com": { category: "entertainment", type: "single" },
  "themoviedb.org": { category: "entertainment", type: "single" },
  "myanimelist.net": { category: "entertainment", type: "single" },
  "anilist.co": { category: "entertainment", type: "single" },
  
  // ============================================
  // SOCIAL - 소셜 미디어
  // ============================================
  
  "facebook.com": { category: "social", type: "single" },
  "instagram.com": { category: "social", type: "single" },
  "twitter.com": { category: "social", type: "single" },
  "x.com": { category: "social", type: "single" },
  "threads.net": { category: "social", type: "single" },
  "tiktok.com": { category: "entertainment", type: "single" },
  "snapchat.com": { category: "social", type: "single" },
  "pinterest.com": { category: "social", type: "single" },
  "tumblr.com": { category: "social", type: "single" },
  "linkedin.com": { category: "social", type: "single" },
  "discord.com": { category: "social", type: "single" },
  "telegram.org": { category: "social", type: "single" },
  "web.telegram.org": { category: "social", type: "single" },
  "web.whatsapp.com": { category: "social", type: "single" },
  "messenger.com": { category: "social", type: "single" },
  "kakaotalk.com": { category: "social", type: "single" },
  "band.us": { category: "social", type: "single" },
  "cafe.naver.com": { category: "social", type: "single" },
  "cafe.daum.net": { category: "social", type: "single" },
  "dcinside.com": { category: "social", type: "single" },
  "fmkorea.com": { category: "social", type: "single" },
  "ruliweb.com": { category: "social", type: "single" },
  "theqoo.net": { category: "social", type: "single" },
  "instiz.net": { category: "social", type: "single" },
  "ppomppu.co.kr": { category: "social", type: "single" },
  "clien.net": { category: "social", type: "single" },
  "mlbpark.donga.com": { category: "social", type: "single" },
  "quora.com": { category: "social", type: "single" },
  
  // ============================================
  // GAMES - 게임
  // ============================================
  
  // 게임 플랫폼
  "store.steampowered.com": { category: "games", type: "single" },
  "steamcommunity.com": { category: "games", type: "single" },
  "epicgames.com": { category: "games", type: "single" },
  "gog.com": { category: "games", type: "single" },
  "origin.com": { category: "games", type: "single" },
  "ubisoft.com": { category: "games", type: "single" },
  "blizzard.com": { category: "games", type: "single" },
  "battle.net": { category: "games", type: "single" },
  "ea.com": { category: "games", type: "single" },
  "riotgames.com": { category: "games", type: "single" },
  "playvalorant.com": { category: "games", type: "single" },
  "leagueoflegends.com": { category: "games", type: "single" },
  "op.gg": { category: "games", type: "single" },
  "u.gg": { category: "games", type: "single" },
  "dotabuff.com": { category: "games", type: "single" },
  "xbox.com": { category: "games", type: "single" },
  "playstation.com": { category: "games", type: "single" },
  "nintendo.com": { category: "games", type: "single" },
  
  // 게임 정보/커뮤니티
  "ign.com": { category: "games", type: "single" },
  "gamespot.com": { category: "games", type: "single" },
  "kotaku.com": { category: "games", type: "single" },
  "polygon.com": { category: "games", type: "single" },
  "pcgamer.com": { category: "games", type: "single" },
  "gamefaqs.gamespot.com": { category: "games", type: "single" },
  "nexusmods.com": { category: "games", type: "single" },
  "curseforge.com": { category: "games", type: "single" },
  "modrinth.com": { category: "games", type: "single" },
  "inven.co.kr": { category: "games", type: "single" },
  "thisisgame.com": { category: "games", type: "single" },
  "gamemeca.com": { category: "games", type: "single" },
  "ruliweb.com": { category: "games", type: "single" },
  
  // 브라우저 게임
  "poki.com": { category: "games", type: "single" },
  "crazygames.com": { category: "games", type: "single" },
  "miniclip.com": { category: "games", type: "single" },
  "kongregate.com": { category: "games", type: "single" },
  "armor games.com": { category: "games", type: "single" },
  "itch.io": { category: "games", type: "single" },
  "games.naver.com": { category: "games", type: "single" },
  
  // ============================================
  // NEWS - 뉴스
  // ============================================
  
  // 글로벌 뉴스
  "news.google.com": { category: "news", type: "single" },
  "cnn.com": { category: "news", type: "single" },
  "bbc.com": { category: "news", type: "single" },
  "bbc.co.uk": { category: "news", type: "single" },
  "nytimes.com": { category: "news", type: "single" },
  "washingtonpost.com": { category: "news", type: "single" },
  "theguardian.com": { category: "news", type: "single" },
  "reuters.com": { category: "news", type: "single" },
  "apnews.com": { category: "news", type: "single" },
  "bloomberg.com": { category: "news", type: "single" },
  "wsj.com": { category: "news", type: "single" },
  "ft.com": { category: "news", type: "single" },
  "economist.com": { category: "news", type: "single" },
  "forbes.com": { category: "news", type: "single" },
  "time.com": { category: "news", type: "single" },
  "aljazeera.com": { category: "news", type: "single" },
  "npr.org": { category: "news", type: "single" },
  
  // 한국 뉴스
  "news.naver.com": { category: "news", type: "single" },
  "news.daum.net": { category: "news", type: "single" },
  "chosun.com": { category: "news", type: "single" },
  "joins.com": { category: "news", type: "single" },
  "donga.com": { category: "news", type: "single" },
  "hani.co.kr": { category: "news", type: "single" },
  "khan.co.kr": { category: "news", type: "single" },
  "yna.co.kr": { category: "news", type: "single" },
  "ytn.co.kr": { category: "news", type: "single" },
  "sbs.co.kr": { category: "news", type: "single" },
  "kbs.co.kr": { category: "news", type: "single" },
  "mbc.co.kr": { category: "news", type: "single" },
  "mk.co.kr": { category: "news", type: "single" },
  "hankyung.com": { category: "news", type: "single" },
  "mt.co.kr": { category: "news", type: "single" },
  "edaily.co.kr": { category: "news", type: "single" },
  
  // 테크 뉴스
  "techcrunch.com": { category: "news", type: "single" },
  "theverge.com": { category: "news", type: "single" },
  "wired.com": { category: "news", type: "single" },
  "arstechnica.com": { category: "news", type: "single" },
  "engadget.com": { category: "news", type: "single" },
  "mashable.com": { category: "news", type: "single" },
  "cnet.com": { category: "news", type: "single" },
  "zdnet.com": { category: "news", type: "single" },
  "venturebeat.com": { category: "news", type: "single" },
  "hacker news.ycombinator.com": { category: "news", type: "single" },
  "news.ycombinator.com": { category: "news", type: "single" },
  "slashdot.org": { category: "news", type: "single" },
  "geekwire.com": { category: "news", type: "single" },
  
  // ============================================
  // SHOPPING - 쇼핑
  // ============================================
  
  // 글로벌
  "amazon.com": { category: "shopping", type: "single" },
  "amazon.co.uk": { category: "shopping", type: "single" },
  "amazon.co.jp": { category: "shopping", type: "single" },
  "ebay.com": { category: "shopping", type: "single" },
  "aliexpress.com": { category: "shopping", type: "single" },
  "alibaba.com": { category: "shopping", type: "single" },
  "wish.com": { category: "shopping", type: "single" },
  "etsy.com": { category: "shopping", type: "single" },
  "walmart.com": { category: "shopping", type: "single" },
  "target.com": { category: "shopping", type: "single" },
  "bestbuy.com": { category: "shopping", type: "single" },
  "newegg.com": { category: "shopping", type: "single" },
  
  // 한국
  "coupang.com": { category: "shopping", type: "single" },
  "gmarket.co.kr": { category: "shopping", type: "single" },
  "11st.co.kr": { category: "shopping", type: "single" },
  "auction.co.kr": { category: "shopping", type: "single" },
  "ssg.com": { category: "shopping", type: "single" },
  "lotteon.com": { category: "shopping", type: "single" },
  "interpark.com": { category: "shopping", type: "single" },
  "shopping.naver.com": { category: "shopping", type: "single" },
  "smartstore.naver.com": { category: "shopping", type: "single" },
  "tmon.co.kr": { category: "shopping", type: "single" },
  "wemakeprice.com": { category: "shopping", type: "single" },
  "ohou.se": { category: "shopping", type: "single" },
  "musinsa.com": { category: "shopping", type: "single" },
  "29cm.co.kr": { category: "shopping", type: "single" },
  "wconcept.co.kr": { category: "shopping", type: "single" },
  "zigzag.kr": { category: "shopping", type: "single" },
  "ably.com": { category: "shopping", type: "single" },
  "brandi.co.kr": { category: "shopping", type: "single" },
  "kurly.com": { category: "shopping", type: "single" },
  "baemin.com": { category: "shopping", type: "single" },
  "yogiyo.co.kr": { category: "shopping", type: "single" },
  "coupangeats.com": { category: "shopping", type: "single" },
  
  // ============================================
  // ADULT - 성인
  // ============================================
  
  // 주요 성인 사이트들 (도메인만 나열)
  "pornhub.com": { category: "adult", type: "single" },
  "xvideos.com": { category: "adult", type: "single" },
  "xnxx.com": { category: "adult", type: "single" },
  "xhamster.com": { category: "adult", type: "single" },
  "redtube.com": { category: "adult", type: "single" },
  "youporn.com": { category: "adult", type: "single" },
  "spankbang.com": { category: "adult", type: "single" },
  "onlyfans.com": { category: "adult", type: "single" },
  
  // ============================================
  // MULTIPURPOSE - 다목적 도메인
  // ============================================
  
  "youtube.com": {
    category: "entertainment",  // 기본값
    type: "multipurpose",
    allowedCategories: ["entertainment", "music", "learning", "games", "news"],
    pathRules: {
      "/shorts/": "entertainment",
      "/gaming": "games",
      "/feed/trending": "entertainment"
    }
  },

  "youtu.be": {
    category: "entertainment",
    type: "multipurpose",
    allowedCategories: ["entertainment", "music", "learning", "games", "news"]
  },

  "twitch.tv": {
    category: "entertainment",
    type: "multipurpose",
    allowedCategories: ["entertainment", "music", "games", "learning"],
    pathRules: {
      "/directory/game": "games"
    }
  },
  
  "reddit.com": {
    category: "social",
    type: "multipurpose",
    allowedCategories: ["social", "entertainment", "news", "games", "learning", "productivity"],
    pathRules: {
      "/r/learnprogramming": "learning",
      "/r/programming": "learning",
      "/r/webdev": "learning",
      "/r/javascript": "learning",
      "/r/python": "learning",
      "/r/machinelearning": "learning",
      "/r/gaming": "games",
      "/r/games": "games",
      "/r/pcgaming": "games",
      "/r/news": "news",
      "/r/worldnews": "news",
      "/r/technology": "news",
      "/r/science": "learning",
      "/r/askscience": "learning",
      "/r/explainlikeimfive": "learning",
      "/r/todayilearned": "learning",
      "/r/funny": "entertainment",
      "/r/videos": "entertainment",
      "/r/movies": "entertainment",
      "/r/music": "music",
      "/r/memes": "entertainment"
    }
  },
  
  "bilibili.com": {
    category: "entertainment",
    type: "multipurpose",
    allowedCategories: ["entertainment", "music", "learning", "games"]
  },
  
  "naver.com": {
    category: "other",
    type: "multipurpose",
    allowedCategories: ["news", "shopping", "entertainment", "social", "productivity"],
    pathRules: {
      "/shopping": "shopping",
      "/news": "news",
      "/sports": "entertainment",
      "/entertain": "entertainment"
    }
  },
  
  "blog.naver.com": {
    category: "other",
    type: "multipurpose",
    allowedCategories: ["learning", "entertainment", "news", "shopping", "social"]
  },
  
  "daum.net": {
    category: "other",
    type: "multipurpose",
    allowedCategories: ["news", "entertainment", "social"],
    pathRules: {
      "/news": "news",
      "/entertainment": "entertainment"
    }
  },
  
  "tistory.com": {
    category: "other",
    type: "multipurpose",
    allowedCategories: ["learning", "entertainment", "news", "productivity"]
  },
  
  "medium.com": {
    category: "other",
    type: "multipurpose",
    allowedCategories: ["learning", "news", "productivity", "entertainment"]
  },
  
  "velog.io": {
    category: "learning",
    type: "multipurpose",
    allowedCategories: ["learning", "productivity"]
  },
  
  "brunch.co.kr": {
    category: "other",
    type: "multipurpose",
    allowedCategories: ["learning", "entertainment", "news"]
  },
  
  "google.com": {
    category: "other",
    type: "multipurpose",
    allowedCategories: ["productivity", "learning", "shopping", "news", "entertainment"],
    pathRules: {
      "/search": "other",
      "/maps": "other",
      "/translate": "productivity"
    }
  },
  
  "bing.com": {
    category: "other",
    type: "multipurpose",
    allowedCategories: ["productivity", "learning", "shopping", "news", "entertainment"]
  },
  
  "namu.wiki": {
    category: "other",
    type: "multipurpose",
    allowedCategories: ["learning", "entertainment", "games"]
  }
};

/**
 * Get domain info from well-known database
 * @param {string} hostname - Domain hostname (e.g., "youtube.com")
 * @returns {Object|null} Domain info or null if not found
 */
export function getWellKnownDomain(hostname) {
  // Remove www. prefix
  const domain = hostname.replace(/^www\./, '').toLowerCase();
  
  // Exact match
  if (WELL_KNOWN_DOMAINS[domain]) {
    return { domain, ...WELL_KNOWN_DOMAINS[domain] };
  }
  
  // Check for subdomain match (e.g., music.youtube.com → youtube.com)
  const parts = domain.split('.');
  for (let i = 1; i < parts.length; i++) {
    const parentDomain = parts.slice(i).join('.');
    if (WELL_KNOWN_DOMAINS[parentDomain]) {
      return { domain: parentDomain, ...WELL_KNOWN_DOMAINS[parentDomain] };
    }
  }
  
  // Check for partial match in keys (e.g., "linkedin.com/learning" in URL)
  for (const [key, value] of Object.entries(WELL_KNOWN_DOMAINS)) {
    if (key.includes('/') && domain.includes(key.split('/')[0])) {
      // This is a path-specific entry, will be handled elsewhere
      continue;
    }
  }
  
  return null;
}

/**
 * Check path rules for multipurpose domain
 * @param {string} domain - Domain name
 * @param {string} pathname - URL pathname
 * @returns {Object|null} Category info if path rule matched
 */
export function checkPathRules(domain, pathname) {
  const domainInfo = WELL_KNOWN_DOMAINS[domain];
  if (!domainInfo?.pathRules) return null;
  
  // Sort by path length (longest first) for specificity
  const sortedPaths = Object.keys(domainInfo.pathRules)
    .sort((a, b) => b.length - a.length);
  
  for (const path of sortedPaths) {
    if (pathname.toLowerCase().startsWith(path.toLowerCase())) {
      return {
        category: domainInfo.pathRules[path],
        confidence: 0.95,
        method: "path_rule"
      };
    }
  }

  return null;
}

/**
 * Get list of all multipurpose domain names
 * @returns {string[]} Array of multipurpose domain names
 */
export function getMultipurposeDomains() {
  return Object.entries(WELL_KNOWN_DOMAINS)
    .filter(([, info]) => info.type === 'multipurpose')
    .map(([domain]) => domain);
}
