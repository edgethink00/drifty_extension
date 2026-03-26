# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

deTime is a Chrome Extension (Manifest V3) that provides iOS Screen Time-like web activity tracking. It uses session-based analysis with automatic categorization and a privacy-first architecture.

## Repository Structure

```
detime-extension/
├── manifest.json
├── background/         # Service worker modules
├── common/             # Shared utilities and constants
├── content/            # Content scripts
├── dashboard/          # Full analytics dashboard
├── popup/              # Extension popup UI
├── settings/           # Settings page
├── onboarding/         # First-run onboarding flow
├── icons/              # Extension icons
└── blocked.html        # Blocked site page
```

## Development

No build system - uses native ES6 modules. Load directly in Chrome:
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this folder
4. Refresh the extension after code changes

## Architecture

### Extension Components
- **Service Worker** (`background/service-worker.js`): Entry point, initializes all modules and handles IPC messages
- **Session Tracker** (`background/session-tracker.js`): State machine tracking browsing sessions (IDLE → CORE → EXTENDED)
- **Category Detector** (`background/category-detector.js`): Scores URLs/titles to classify into categories
- **Category Scheduler** (`background/category-scheduler.js`): Scheduled category DB updates
- **DB Manager** (`background/db-manager.js`): IndexedDB operations for sessions, stats, limits, settings
- **Server Sync** (`background/server-sync.js`): Optional category DB updates and anonymous usage stats
- **History Analyzer** (`background/history-analyzer.js`): Analyzes Chrome history to approximate past screen time
- **Keyword Extractor** (`background/keyword-extractor.js`): Privacy-first keyword extraction from URLs/titles

### UI Components
- **Popup** (`popup/`): Quick view (360x500px) showing today's stats
- **Dashboard** (`dashboard/`): Full analytics with charts (Canvas API)
- **Settings** (`settings/`): Configuration for limits, privacy, sync
- **Onboarding** (`onboarding/`): First-run setup and history analysis

## Key Patterns

### Session State Machine
```
IDLE ──(category detected)──> CORE ──(same category)──> CORE
                                    ──(related category)──> EXTENDED
                                    ──(timeout 5min)──> IDLE
EXTENDED ──(timeout 7min)──> IDLE
```

### Category Detection Scoring
- Domain match: 100 points
- URL keyword: 10 points each
- Title keyword: 5 points each
- Highest scoring category wins, defaults to "other"

### IPC Message Format
UI communicates with background via `chrome.runtime.sendMessage`:
```javascript
// Stats & Data
{ type: 'GET_TODAY_STATS' }
{ type: 'GET_WEEKLY_STATS' }
{ type: 'GET_DATE_STATS', date: 'YYYY-MM-DD' }
{ type: 'GET_CURRENT_SESSION' }

// Limits & Settings
{ type: 'GET_LIMITS' }
{ type: 'SET_LIMIT', category: 'social', limit: {...} }
{ type: 'DELETE_LIMIT', category: 'social' }
{ type: 'GET_SETTINGS' }
{ type: 'SAVE_SETTINGS', settings: {...} }

// Server Sync
{ type: 'FORCE_SYNC_NOW' }
{ type: 'GET_SYNC_STATUS' }
{ type: 'UPLOAD_PENDING_STATS' }

// History Analysis
{ type: 'ANALYZE_HISTORY', days: 30 }

// Other
{ type: 'GET_CATEGORIES' }
{ type: 'DELETE_ADULT_SESSIONS', date: 'YYYY-MM-DD' }

// Response format
{ success: true, data: {...} }
{ success: false, error: 'message' }
```

### IndexedDB Stores
- `sessions`: Individual browsing sessions with visits
- `dailyStats`: Aggregated daily statistics
- `limits`: Time limits per category
- `settings`: User preferences

## Categories
Defined in `common/constants.js`: social, entertainment, workspace, shopping, news, games, education, adult, other. Each has domains, keywords, and color coding.

## Debugging
- Background Script: `chrome://extensions` → click "Service Worker" link
- Popup: Right-click popup → "Inspect"
- Dashboard/Settings: Standard F12 DevTools

## Server
Backend is in a separate repo: [detime-server](https://github.com/jeongjin0/detime-server)
Server URL configured in `common/server-config.js` (default: `https://api.detime.co/api`).
