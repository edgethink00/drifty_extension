# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

deTime (WST) is a Chrome Extension (Manifest V3) that provides iOS Screen Time-like web activity tracking. It uses session-based analysis with automatic categorization and a privacy-first architecture.

## Repository Structure

```
/home/jjshin/wst/           # Repository root
└── wst/                    # Chrome Extension source (load this folder)
    ├── manifest.json
    ├── background/         # Service worker modules
    ├── popup/              # Extension popup UI
    ├── dashboard/          # Full analytics dashboard
    ├── settings/           # Settings page
    ├── common/             # Shared utilities and constants
    ├── icons/              # Extension icons
    └── blacklist-server/   # Python FastAPI backend
```

Note: Both the extension and backend are in the `wst/` directory.

## Development Commands

### Chrome Extension (Frontend)
No build system - uses native ES6 modules. Load directly in Chrome:
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `wst/` folder
4. Refresh the extension after code changes

### Backend Server (Python FastAPI)
```bash
cd wst/blacklist-server
python3 -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt

# Run manually
python main.py

# Or run as systemd service (recommended)
systemctl --user start wst-server
systemctl --user status wst-server
```
Server runs at `http://localhost:8000`. API docs at `http://localhost:8000/docs`.

Service file: `~/.config/systemd/user/wst-server.service`

## Architecture

### Extension Components
- **Service Worker** (`background/service-worker.js`): Entry point, initializes all modules and handles IPC messages
- **Session Tracker** (`background/session-tracker.js`): State machine tracking browsing sessions (IDLE → CORE → EXTENDED)
- **Category Detector** (`background/category-detector.js`): Scores URLs/titles to classify into categories
- **DB Manager** (`background/db-manager.js`): IndexedDB operations for sessions, stats, limits, settings
- **Server Sync** (`background/server-sync.js`): Optional category DB updates and anonymous usage stats
- **History Analyzer** (`background/history-analyzer.js`): Analyzes Chrome history to approximate past screen time (before extension install)
- **Keyword Extractor** (`background/keyword-extractor.js`): Privacy-first keyword extraction from URLs/titles for category improvement

### UI Components
- **Popup** (`popup/`): Quick view (360x500px) showing today's stats
- **Dashboard** (`dashboard/`): Full analytics with charts (Canvas API)
- **Settings** (`settings/`): Configuration for limits, privacy, sync

### Backend (Python FastAPI)
Located in `wst/blacklist-server/`. Dual-purpose server:
1. **Legacy NSFW Detection**: Blacklist domains/keywords, tier information
2. **deTime**: Category database sync, anonymous usage statistics

Structure:
- `main.py`: FastAPI app with CORS, rate limiting, privacy-focused logging (NO IP logging)
- `database.py`: SQLite database management (aiosqlite)
- `routes/`: API endpoints (categories, usage_stats, blacklist, tiers, stats, dashboard)
- `services/`: Background tasks, tier calculator, keyword extractor
- `middleware/`: Rate limiting
- `models.py`: Pydantic models for requests/responses

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

## History Analysis
On first install, automatically analyzes Chrome history (last 30 days) to provide immediate usage insights. Uses time-based heuristics:
- 5-minute gaps = same session
- 3-minute minimum per single visit
- 4-hour session cap for unrealistic sessions
- Processes in 1000-item batches

Controlled by settings: `historyAnalysis.showApproximatedData` (default: true)

## Privacy Architecture

### Keyword Extraction
When enabled, extracts anonymized keywords from URLs/titles:
- Removes stopwords (common words like "the", "and", etc.)
- Filters personal information (emails, names, dates, phone numbers, passwords)
- Generalizes URL patterns (e.g., `/watch?v=xyz` → `/watch`)
- Only sends: domain + detected category + anonymized keywords
- Never sends: full URLs, page titles, personal data

### Server Privacy Guarantees
- NO IP address logging
- NO user identification or tracking
- NO full URLs stored (domains only)
- Random hash IDs for anonymity
- User opt-in required (default: disabled)

## Debugging
- Background Script: `chrome://extensions` → click "Service Worker" link
- Popup: Right-click popup → "Inspect"
- Dashboard/Settings: Standard F12 DevTools

## Server API Endpoints

### deTime
```
GET  /api/categories/version   - Check category DB version
GET  /api/categories           - Download category database
POST /api/usage-stats          - Upload anonymous usage stats
GET  /api/usage-stats/summary  - Get usage statistics (admin)
```


Server URL configured in `common/server-config.js` (default: `https://api.detime.co/api`).
