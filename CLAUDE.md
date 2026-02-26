# CLAUDE.md — Axis Analytics

## What This Project Is

NAIA basketball analytics platform. Scrapes game data from Presto Sports, calculates advanced metrics, and presents them via a React frontend. Serves coaches, selection committee members, and fans.

## Tech Stack

- **Backend:** Express 5 + PostgreSQL (CommonJS). Routes decomposed into `routes/` modules.
- **Frontend:** React 19 + Vite 7 + Recharts + React Router 7 (ESM, all in `client/`)
- **Data Pipelines:**
  - **Legacy pipeline:** Root-level scripts using Puppeteer + S3 JSON → `games` table
  - **Box score pipeline:** `experimental/` scripts scraping Presto Sports HTML box scores → `exp_*` tables
- **Deployment:** Render.com (`render.yaml`), requires Node 22+

## Key Architecture Decisions

- **Dual data sources:** The app supports both "legacy" (from `games` table) and "boxscore" (from `exp_game_box_scores` table) data sources. `utils/dataSource.js` routes requests based on league+season. For 2025-26, both mens and womens default to boxscore. The `?source=legacy` query param can override.
- **URL-based state:** All filter state (league, season, conference, opponent, statGroup, view) is stored in URL search params, not React state. See `App.jsx`.
- **CSS variables for theming:** Light/dark mode uses CSS custom properties in `client/src/index.css`. Theme toggle is in `ThemeContext.jsx`.
- **Pre-calculated vs. dynamic stats:** The `team_ratings` table stores pre-computed metrics (from `calculate-analytics.js` for legacy, `refreshTeamStats.js` for boxscore). `dynamicStatsBoxScore.js` does on-the-fly calculation from raw game data when filters are applied but falls back to `team_ratings` for adjusted ratings (SOS, RPI) when unfiltered.
- **No TypeScript:** Plain JavaScript throughout.

## Project Layout

```
server.js              — Express app setup + middleware + route mounting
scheduler.js           — Cron jobs for automated data refresh (both pipelines)
routes/                — API route modules (teams, players, matchup, bracketcast, conferences, metadata)
utils/                 — Shared utilities
  dynamicStatsBoxScore.js — On-the-fly stats from exp_game_box_scores
  refreshTeamStats.js     — Batch aggregation: exp_game_box_scores → team_ratings
  dataSource.js           — Routes requests to boxscore or legacy source
  quadrant.js             — Quadrant win classification
  conferenceChampions.js  — Conference tournament champion detection
  legacy/dynamicStats.js  — On-the-fly stats from games table (legacy source)
experimental/          — Box score data pipeline
  scrape-scoreboard.js    — Discovers game dates + box score URLs from Presto Sports
  parse-box-score.js      — Parses HTML box score pages into structured data
  import-box-scores.js    — Main orchestrator: scrape → parse → DB insert → mark NAIA → refresh stats
  fill-missing-box-scores.js — Gap-fill via S3 JSON cross-reference
  backfill-team-ids.js    — Fixes null team_ids by name matching
  detect-forfeits.js      — Reports potential forfeits (2-0 scores)
  mark-indiana-southeast-forfeits.js — One-off forfeit marking script
config/                — excluded-teams.js, exhibition-overrides.js, team-locations.js
db/pool.js             — Shared PostgreSQL pool (use this, not per-file Pool creation)
client/src/App.jsx     — Routing, state management, data fetching
client/src/components/ — All UI components (JSX + colocated CSS)
client/src/contexts/   — ThemeContext.jsx
client/src/utils/      — Shared frontend utils (api.js, tooltips.js, normalizers.js)
docs/                  — Reference documentation
```

## Common Tasks

### Run locally
```bash
# Requires Node 22 (use nvm use 22)
npm run dev                    # API server on :3001
cd client && npm run dev       # Vite dev server on :5173
```

### Import today's box scores
```bash
node experimental/import-box-scores.js --today --season 2025-26 --league mens --concurrency 5 --delay 300
node experimental/import-box-scores.js --today --season 2025-26 --league womens --concurrency 5 --delay 300
```

### Import box scores for a date range
```bash
node experimental/import-box-scores.js --from 2026-02-20 --to 2026-02-25 --season 2025-26 --league mens
```

### Full box score backfill (entire season)
```bash
node experimental/import-box-scores.js --all --season 2025-26 --league mens --concurrency 5 --delay 300
```

### Gap-fill missing box scores (via S3 cross-reference)
```bash
node experimental/fill-missing-box-scores.js --concurrency 3 --delay 500
```

### Fix null team_ids in box score data
```bash
node experimental/backfill-team-ids.js --season 2025-26          # live run
node experimental/backfill-team-ids.js --season 2025-26 --dry-run # preview only
```

### Refresh legacy pipeline data
```bash
npm run refresh      # scrape → import → conferences → analytics
```

### Refresh team stats from box score data (without re-importing)
```bash
node utils/refreshTeamStats.js    # defaults to mens 2025-26
```

### Add a new season
1. Update `DEFAULT_SEASON` in `db/pool.js`
2. Update `SEASON` in `render.yaml`
3. Update default in `client/src/App.jsx` DEFAULTS object
4. Add the season key to `BOXSCORE_AVAILABLE` in `utils/dataSource.js` (frontend fetches this automatically via `/api/data-sources`)
5. Create `team-urls-YYYY-YY.json` via `node scrape-team-urls.js --season YYYY-YY`
6. Run `npm run refresh` with `--season YYYY-YY` (legacy pipeline)
7. Run `node experimental/import-box-scores.js --all --season YYYY-YY --league mens` (box score pipeline)

### Add a new API endpoint
Routes are in `routes/*.js`. Follow the existing pattern:
```javascript
router.get('/your-endpoint', async (req, res) => {
  try {
    const result = await pool.query('...', [params]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});
```

### Add a new page/route
1. Create component in `client/src/components/YourPage.jsx`
2. Import in `App.jsx` and add a `<Route>` element
3. Add nav button in `Header.jsx` (both desktop nav-right and mobile dropdown)

## Data Flow: Box Score Pipeline

This is the primary data pipeline for 2025-26+:

```
Presto Sports Scoreboard HTML
  ↓ scrape-scoreboard.js (discover dates + box score URLs)
  ↓ parse-box-score.js (extract game data, player stats, play-by-play)
  ↓ import-box-scores.js::insertBoxScore() → 3 tables:
  │   ├── exp_game_box_scores (game-level: scores, team stats, period scores)
  │   ├── exp_player_game_stats (per-player per-game stats)
  │   └── exp_play_by_play (every play event with timestamps)
  ↓ import-box-scores.js::markNaiaGames() → sets is_naia_game flag
  ↓ refreshTeamStats.js → aggregates into team_ratings table
```

**Secondary gap-fill path:**
```
S3 Team JSON → fill-missing-box-scores.js
  → finds games not yet in exp_game_box_scores
  → fetches + parses + inserts via same insertBoxScore()
```

**Scheduler (production):**
| Time (ET) | Job | What |
|-----------|-----|------|
| Midnight | Legacy scrape | scrape-team-urls + scrape-conferences |
| 2am, 6am, ... | Legacy refresh | import-data + calculate-analytics |
| 3 AM | Players | import-players |
| 4 AM + every 2hrs 4pm-midnight | Box scores | import-box-scores --today |
| 5 AM | Gap-fill | fill-missing-box-scores (3-day lookback) |
| 6 AM Sunday | Deep gap-fill | fill-missing-box-scores (14-day lookback) |

## Known Issues / Gotchas

### Critical
- **Name matching is exact only:** The `backfill-team-ids.js` and import fallback use exact `name = name` matching. Discrepancies like "St." vs "Saint" or "(Ky.)" vs "(KY)" silently fail, leaving null team_ids.
- **No tests exist.** There is no test framework configured.
- **Render cold starts** — the free-tier Render service can take 30+ seconds to wake up.

### Previously Fixed (for reference)
- ~~SQL injection in `dynamicStatsBoxScore.js`~~ → converted to parameterized queries
- ~~`insertBoxScore()` has no transaction~~ → wrapped in `BEGIN`/`COMMIT`/`ROLLBACK`
- ~~Gap-filled games missing type flags~~ → now classified as conference/exhibition/postseason during import
- ~~Forfeit handling inconsistent~~ → unified forfeit filtering across `refreshTeamStats.js` and `dynamicStatsBoxScore.js`
- ~~No HTTP timeouts in scrapers~~ → added `AbortSignal.timeout()` to `scrape-scoreboard.js`
- ~~Eastern time approximation ignores DST~~ → now uses `America/New_York` timezone
- ~~Player upsert only updates 4 of 27 fields~~ → now refreshes all mutable stat fields
- ~~`markNaiaGames()` race condition~~ → scoped to update only changed games
- ~~6 files create their own DB Pool~~ → consolidated to shared pool from `db/pool.js`
- ~~PBP inserts are row-by-row~~ → batched 50 rows per INSERT
- ~~`refreshTeamStats.js` N+1 UPDATEs~~ → single `UPDATE...FROM VALUES`
- ~~Lineup-stats N+1 PBP queries~~ → 2 bulk queries with `Promise.all`
- ~~`formatValue()`/`formatDate()` duplicated~~ → extracted to `client/src/utils/formatters.js`
- ~~No user-facing error UI~~ → added error states + banners to all data-fetching components
- ~~Data source config duplicated in frontend~~ → frontend fetches from `GET /api/data-sources`
- ~~PBP `team_id` always null~~ → now populated during import from game's team IDs
- ~~`API_URL` duplicated in 9 files~~ → centralized in `client/src/utils/api.js`
- ~~`TOOLTIPS` duplicated inconsistently~~ → centralized in `client/src/utils/tooltips.js`
- ~~`normalizeYear()`/`normalizePosition()` duplicated~~ → centralized in `client/src/utils/normalizers.js`
- ~~NAIA wins/losses showed as total record~~ → fixed with `is_naia_game` filter in `dynamicStatsBoxScore.js`
- ~~Exhibition games included in stats~~ → fixed with `is_exhibition` filter in `refreshTeamStats.js`
- ~~Null team_ids causing missing games~~ → fixed with `backfill-team-ids.js` + import fallback

## Database

PostgreSQL with 7 main tables across two generations:

**Legacy tables:** `teams`, `games`, `team_ratings`, `players`
**Box score tables:** `exp_game_box_scores`, `exp_player_game_stats`, `exp_play_by_play`

Connection via `DATABASE_URL` env var with SSL. Shared pool in `db/pool.js`.

See `docs/database-schema.md` for full schema.

## Data Pipeline

**Legacy:** Presto Sports → scrape-team-urls.js → import-data.js → scrape-conferences.js → calculate-analytics.js → import-players.js

**Box Score:** Presto Sports Scoreboard → scrape-scoreboard.js → parse-box-score.js → import-box-scores.js → markNaiaGames → refreshTeamStats

Both pipelines are automated via `scheduler.js` in production. See `docs/data-pipeline.md`.
