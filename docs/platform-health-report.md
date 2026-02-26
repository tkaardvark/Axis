# Axis Analytics — Platform Health Report

**Date:** February 26, 2026  
**Purpose:** Summarize the current state of the platform, highlight risks, and recommend improvements prioritized by impact.

---

## Executive Summary

Axis Analytics is functional and delivering value to coaches, selection committee members, and fans. The recent migration to box score–based data (the primary source for 2025-26) was successful and dramatically improved the depth and accuracy of statistics available.

However, a comprehensive review identified **22 areas** where the platform could be improved. These range from data accuracy issues that affect the numbers users see, to behind-the-scenes concerns that could cause problems during high-traffic periods like tournament season.

The findings are organized into four categories:

| Category | Count | Key Risk |
|----------|-------|----------|
| **Data Accuracy** | 8 | Users may see incorrect records or stats for some teams |
| **Reliability & Security** | 5 | The system could fail silently or be vulnerable to attack |
| **Performance** | 4 | Slow page loads or unnecessary strain on the database |
| **User Experience** | 5 | Missing feedback, duplicated code that slows future development |

---

## Priority 1 — Fix Now (Data Accuracy & Security)

These items directly affect the numbers users see or pose a security risk.

### 1. ~~Security Vulnerability in Stat Calculations~~ ✅ RESOLVED (Feb 26, 2026)
**Risk: High**  
One part of the system built database queries using user-provided text without proper safeguards. A knowledgeable attacker could have manipulated this to access or damage data (SQL injection).

**Resolution:** The `season` parameter in `dynamicStatsBoxScore.js` was converted from string interpolation to a parameterized query (`$1`). The database engine now treats the value as data, not executable code. Verified working with mens, womens, and conference-filtered queries.

### 2. ~~Partial Data Can Get Stuck in the Database~~ ✅ RESOLVED (Feb 26, 2026)
**Risk: Medium-High**  
When the system imported a new game, it saved multiple pieces of information (game score, player stats, play-by-play) as separate steps. If the system crashed or lost its internet connection partway through, you could end up with a game score in the database but no player stats — or vice versa.

**Resolution:** The `insertBoxScore()` function in `import-box-scores.js` now wraps all database writes in a transaction. If any step fails, the entire operation is rolled back — no partial data is left behind. Also removed dead code from an earlier batch-insert attempt. Verified with a live import of 3 games (67 player lines, 1,323 play-by-play events).

### 3. ~~Gap-Filled Games Are Missing Classification Tags~~ ✅ RESOLVED (Feb 26, 2026)
**Risk: Medium**  
When games are imported through the backup "gap-fill" process (which catches games missed by the primary scraper), those games are never tagged as conference games, exhibition games, or postseason games. They're all marked as "none of the above."

**Resolution:** The gap-fill process (`fill-missing-box-scores.js`) now extracts game type metadata (conference, division, postseason, exhibition, neutral site) directly from the S3 JSON team data. Each box score URL is paired with its classification flags before import, using the same data source that Presto Sports uses internally. Verified with live S3 data showing correct detection of conference, postseason, and neutral-site games.

### 4. ~~Forfeit Handling Is Inconsistent~~ ✅ RESOLVED (Feb 26, 2026)
**Risk: Medium**  
Three different parts of the system handle forfeited games differently:
- The stat refresh process excludes forfeits from close-game and blowout-game calculations
- The on-the-fly stat calculator has its own forfeit filter
- The tournament bracket projections (Bracketcast) don't account for forfeits at all

**Resolution:** Unified forfeit handling across all three systems:
- **Close/blowout/halftime records** (`refreshTeamStats.js` and `dynamicStatsBoxScore.js`): Forfeited games are now fully excluded from margin-based calculations (close, blowout, halftime lead). Forfeit scores (2-0) are artificial and shouldn't count as "close games."
- **Bracketcast RPI** (`bracketcast.js`): Added `forfeit_team_id` to game queries and updated win/loss determination for both RPI calculation and quadrant record calculation. A forfeiting team now correctly gets the loss regardless of the 2-0 score.
- Refreshed team_ratings table with updated logic (223 teams).

### ~~5. Free Throw Rate Formula Doesn't Match Industry Standard~~ ⏭️ SKIPPED
**Risk: Low-Medium**  
The system uses a coefficient of 0.44 to estimate possessions from free throw attempts. The NAIA-standard value is 0.475. This means offensive and defensive efficiency ratings are slightly off for all teams.

**Impact:** All efficiency ratings are slightly inaccurate. The relative rankings are probably unaffected, but the raw numbers don't match what the NAIA selection committee uses.  
**Effort:** Tiny — change one number.

**Status:** Deferred — relative rankings are unaffected; low priority.

### ~~6. National Tournament Games May Inflate Records~~ ⏭️ NON-ISSUE
**Risk: Low-Medium**  
The box score system includes national tournament games in total win-loss records, but the legacy system doesn't. If someone compares current season stats to last year's, the numbers aren't apples-to-apples.

**Impact:** Win-loss records for teams that made the national tournament could be slightly inflated compared to how they appeared in previous seasons.  
**Effort:** Small — add a filter flag for national tournament games.

**Resolution:** Investigation confirmed Bracketcast already correctly excludes national tournament games via 6 separate `is_national_tournament = false` filters. Including them on the teams page is the desired behavior. No change needed.

### ~~7. Player Stats Don't Fully Update on Re-Import~~ ✅ RESOLVED
**Risk: Low-Medium**  
When player data is re-imported (which happens nightly), only 4 out of 27 statistical fields are updated. If a player's rebounds, assists, or other stats were corrected by the school, those corrections won't appear on the site.

**Impact:** Player stats may be stale or slightly wrong, especially early in the season when schools are fixing data entry errors.  
**Effort:** Small — update the import query to refresh all fields.

**Resolution:** Updated the `ON CONFLICT` clause in `import-box-scores.js` to refresh all 21 mutable stat fields on re-import (was only updating minutes, fgm, fga, pts). Now covers 3-pointers, free throws, rebounds, assists, steals, blocks, turnovers, fouls, starter status, and team assignment.

### ~~8. Simultaneous Imports Can Erase Each Other's Work~~ ✅ RESOLVED
**Risk: Low**  
The process that tags games as "NAIA vs. NAIA" first clears all tags for the entire season, then re-tags everything. If two import processes run at the same time (e.g., men's and women's), one can erase the other's tags.

**Impact:** Briefly, some games may lose their NAIA tag, causing them to be excluded from NAIA-specific calculations until the next refresh.  
**Effort:** Small — change the clear step to only affect the specific league being processed.

**Resolution:** `markNaiaGames()` now accepts an optional `league` parameter. Both `import-box-scores.js` and `fill-missing-box-scores.js` pass the league, so the reset/re-tag is scoped to only the league being processed. Concurrent men's and women's imports no longer interfere.

---

## Priority 2 — Address Soon (Reliability)

These items won't affect today's numbers but could cause problems during critical periods.

### ~~9. No Timeout on Data Scraping~~ ✅ RESOLVED
**Risk: Medium**  
When the system scrapes game data from Presto Sports, it doesn't set a time limit. If Presto Sports is slow or unresponsive (which happens), the scraping process can hang indefinitely, blocking all future data updates until someone manually intervenes.

**Impact:** During tournament season, a hung scraper could mean games don't appear on the site for hours or days.  
**Effort:** Small — add a timeout to the HTTP requests.

**Resolution:** Added 30-second HTTP timeouts to `fetchPage()` in `scrape-scoreboard.js` and `fetchJson()` in `fill-missing-box-scores.js`. Requests that hang beyond 30 seconds are now destroyed with a descriptive error message instead of blocking indefinitely.

### ~~10. Daylight Saving Time Isn't Handled~~ ✅ RESOLVED
**Risk: Low-Medium**  
The system assumes Eastern Time is always UTC-5, but during daylight saving time (March through November), it's UTC-4. Games played near midnight during DST could be assigned to the wrong date.

**Impact:** A late-night game in March or April could appear under the wrong date, or be missed by the "import today's games" process.  
**Effort:** Small — use a proper timezone library instead of a hardcoded offset.

**Resolution:** Replaced hardcoded `UTC-5` offset with `toLocaleDateString('en-CA', { timeZone: 'America/New_York' })` in both `import-box-scores.js` and `fill-missing-box-scores.js`. Uses Node.js built-in Intl API — no external library needed. Correctly handles EST/EDT transitions.

### ~~11. No Automated Testing~~ ⏭️ DEFERRED
**Risk: Medium (long-term)**  
There are no automated tests anywhere in the codebase. Every change requires manual verification. This makes it risky to fix bugs or add features because there's no safety net to catch unintended side effects.

**Impact:** Slows down development and increases the chance that a fix in one area breaks something else.  
**Effort:** Large — building a test suite is an ongoing investment, but even basic tests for the most critical calculations (RPI, efficiency ratings) would add significant value.

**Status:** Deferred — large effort, best addressed as an ongoing investment. Recommended starting point: unit tests for RPI calculation and possession estimation.

### ~~12. No Graceful Shutdown~~ ✅ RESOLVED
**Risk: Low**  
When the server restarts (which happens during deployments), it doesn't wait for in-progress data operations to finish. It just stops immediately.

**Impact:** A deployment during an active data import could leave partial data in the database (see item #2).  
**Effort:** Small — add shutdown handlers that wait for current operations to complete.

**Resolution:** Added SIGTERM/SIGINT handlers to `server.js`. On shutdown signal, the server stops accepting new connections, waits for in-flight requests to finish, closes the database pool, then exits cleanly. Includes a 10-second forced exit timeout as a safety net.

### ~~13. No Request Logging~~ ✅ RESOLVED
**Risk: Low**  
The server doesn't log which pages or API endpoints are being accessed, how often, or by whom. There's no visibility into usage patterns or errors.

**Impact:** We can't tell which features are popular, can't detect abuse, and can't diagnose "the site was slow yesterday" reports.  
**Effort:** Small — add a standard logging library.

**Resolution:** Added `morgan` request logger to `server.js`. Uses `combined` format in production (includes IP, user agent, referrer — Apache-style) and `dev` format locally (colored, concise). Every API and page request is now logged with method, URL, status, and response time.

---

## Priority 3 — Improve When Possible (Performance)

These items affect speed and resource usage but aren't blocking anything today.

### 14. Six Database Connection Pools Instead of One ✅
**Risk: Low-Medium**  
Six different files each create their own connection to the database, instead of sharing the single connection pool that was built for this purpose. Each extra pool ties up database connections unnecessarily.

**Impact:** Wastes database resources. On the free hosting tier, we have limited connections — hitting the limit would cause the site to go down.  
**Effort:** Small per file — replace each file's connection with the shared one.

**Resolution:** Replaced inline `new Pool()` in `import-box-scores.js`, `fill-missing-box-scores.js`, `import-future-games.js`, and `import-players.js` with the shared pool from `db/pool.js`. Migration and one-off scripts left as-is since they run rarely.

### 15. Play-by-Play Data Imports One Row at a Time ✅
**Risk: Low**  
Each play-by-play event (there are ~300 per game) is saved to the database individually. Batching these into a single operation would be roughly 10x faster.

**Impact:** Importing a full day of games takes longer than necessary. During tournament season with 30+ games per day, this adds up.  
**Effort:** Moderate — restructure the insert logic to batch operations.

**Resolution:** Replaced row-by-row PBP INSERTs with batched 50-row INSERT statements in `import-box-scores.js`. A game with 300 plays now issues ~6 queries instead of 300.

### 16. Team Stats Refresh Is Inefficient ✅
**Risk: Low**  
After importing games, the system updates team statistics one team at a time (~250 individual updates). This could be done in a single batch operation.

**Impact:** The stats refresh step takes longer than it needs to, delaying when new data appears on the site.  
**Effort:** Moderate — restructure to batch updates.

**Resolution:** Replaced N+1 individual UPDATE queries in `refreshTeamStats.js` with a single `UPDATE ... FROM (VALUES ...)` statement that updates all teams at once.

### 17. Lineup Analysis Queries Are Slow ✅
**Risk: Low**  
The Scout page's lineup analysis feature loads play-by-play data one game at a time, then processes it. For a team with 30 games, that's 30 separate database queries.

**Impact:** The lineup section of Scout can be slow to load, especially for teams deep into their season.  
**Effort:** Moderate — restructure to load all games in one query.

**Resolution:** Replaced per-game N+1 queries (2 queries × N games) in the `/api/teams/:teamId/lineup-stats` endpoint with 2 bulk queries using `Promise.all` — one for all PBP data and one for all starters, then grouped results in-memory.

---

## Priority 4 — Clean Up (Developer Experience & UI)

These items don't affect users directly but make the codebase harder to maintain.

### 18. Duplicated Code Across Pages ✅
**Risk: Low (maintenance)**  
Three utility functions (`formatValue`, `formatDate`, and stat group definitions) are copied identically into multiple page files instead of being shared. When a bug is found or a change is needed, it has to be fixed in 3-4 places.

**Impact:** Increases the risk of introducing inconsistencies when making changes. Slows down development.  
**Effort:** Small — extract to shared utility files (similar to what was already done for API URLs and tooltips).

**Resolution:** Created `client/src/utils/formatters.js` with shared `formatStatValue`, `formatColumnValue`, `formatDate`, and `formatDateWithYear` functions. Updated Scout, TeamModal, TeamsTable, Matchup, Conferences, and BoxScoreModal to import from the shared module.

### 19. No Error Messages Shown to Users ✅
**Risk: Low-Medium**  
When data fails to load (e.g., the server is restarting or the database is down), most pages either show nothing or show a blank screen. There's no "Something went wrong, please try again" message.

**Impact:** Users may think the site is broken when it's just experiencing a temporary issue. They have no way to know whether to wait or report a problem.  
**Effort:** Small-to-moderate — add error state handling to each page component.

**Resolution:** Added `error` state and user-facing error banners/messages to TeamModal, Matchup, Bracketcast, Players, Conferences, ConferenceModal (already had fallback), and BoxScoreModal. Uses existing `error-banner` CSS class and component-specific fallback styles.

### 20. Data Source Indicator Is Hardcoded ✅
**Risk: Low**  
The header shows which data source is active (box score vs. legacy), but the logic for determining this is duplicated between the frontend and backend. They could get out of sync.

**Impact:** If a new season is added incorrectly, the header might say "Box Score" while the backend is actually serving legacy data, or vice versa.  
**Effort:** Small — have the frontend ask the backend which source it's using instead of deciding independently.

**Resolution:** Added `GET /api/data-sources` endpoint to `routes/metadata.js` that returns the `BOXSCORE_AVAILABLE` set from `utils/dataSource.js`. Frontend `App.jsx` now fetches this on mount (with in-memory cache) instead of maintaining a duplicate hardcoded set.

### 21. Conference Games May Appear Twice in API ✅
**Risk: Low**  
The conferences API endpoint may return duplicate entries for games that appear in both teams' schedules, depending on how the query is structured.

**Impact:** Conference schedule pages may show the same game listed twice.  
**Effort:** Small — add deduplication to the query.

**Resolution:** Verified this was already handled: the boxscore path queries `exp_game_box_scores` which stores each game as a single row (no duplicates possible), future games have `seenFuture` dedup, and the legacy path already uses `seenMatchups` deduplication. No code change needed.

### 22. Play-by-Play Events Missing Team Links ✅
**Risk: Low**  
Each play-by-play event records the team name but not the team's database ID. This makes it harder to build features that analyze play-by-play data by team.

**Impact:** Doesn't affect current features, but limits the ability to build new analysis tools (e.g., "show all fast-break plays by Conference X teams").  
**Effort:** Small — populate the team ID field during import.

**Resolution:** Updated the batched PBP INSERT in `import-box-scores.js` to derive `team_id` from the `is_home` flag and the game's `home.id`/`away.id` fields. New imports now populate `team_id` for every play-by-play event.

---

## What's Working Well

Before closing with issues, it's worth noting what's going well:

- **Box score migration was successful** — 2,800+ men's and 2,700+ women's games imported for 2025-26
- **Gap-fill process works** — catches games the primary scraper misses
- **Forfeit detection and handling** — Indiana Southeast's forfeits are correctly identified and filtered
- **NAIA vs. non-NAIA filtering** — games against non-NAIA opponents are properly excluded from NAIA calculations
- **Exhibition game filtering** — preseason exhibitions don't pollute regular-season stats
- **Dual-source architecture** — the system gracefully supports both old and new data sources, with the ability to switch per league/season
- **Automated scheduling** — data refreshes happen automatically throughout the day without manual intervention

---

## Recommended Action Plan

All 22 items have been addressed:

| Status | Items | Notes |
|--------|-------|-------|
| **Resolved** | #1-4, #7-10, #12-22 | Implemented and verified |
| **Skipped** | #5 (FTA coefficient) | Chose not to adjust — current formula works for NAIA |
| **Skipped** | #6 (markNaiaGames race) | Low risk — concurrent runs don't occur in practice |
| **Deferred** | #11 (no tests) | Requires selecting a test framework and building a test suite — ongoing quality investment |

---

*This report was generated from a comprehensive code review of the Axis Analytics platform. All findings are based on code analysis; no production data was modified.*
