# Data Pipeline

## Overview

Axis Analytics sources all game data from **Presto Sports**, the official statistics provider for NAIA member institutions. There are **two parallel pipelines**:

1. **Legacy pipeline** — Root-level scripts that import team-level aggregates from S3 JSON into the `games` table. Used for 2024-25 and earlier.
2. **Box score pipeline** — `experimental/` scripts that scrape individual box score HTML pages into `exp_*` tables. Primary pipeline for 2025-26+. Provides per-player stats and play-by-play data.

Both pipelines feed into the `team_ratings` table, which the frontend consumes.

---

## Box Score Pipeline (Primary, 2025-26+)

This is the primary data ingestion path. It produces richer data than the legacy pipeline.

### Flow

```
Presto Sports Scoreboard HTML
  ↓ scrape-scoreboard.js    — discover dates + box score XML URLs + game type flags
  ↓ parse-box-score.js      — extract game metadata, player stats, play-by-play
  ↓ import-box-scores.js    — insert into 3 tables:
  │   ├── exp_game_box_scores     (game-level: scores, team stats, period scores)
  │   ├── exp_player_game_stats   (per-player per-game: pts, reb, ast, etc.)
  │   └── exp_play_by_play        (every play event with timestamps + game clock)
  ↓ markNaiaGames()         — sets is_naia_game flag by cross-referencing teams table
  ↓ refreshTeamStats.js     — aggregates box scores → updates team_ratings
```

### Step-by-step

#### 1. Scrape Scoreboard (`experimental/scrape-scoreboard.js`)

- Fetches the Presto Sports scoreboard page for a sport (mens/womens basketball)
- Extracts all available game dates from the date selector dropdown
- For each date, fetches the scoreboard page and extracts box score XML URLs
- Also extracts game type CSS classes: `conf` (conference), `div` (division), `exh` (exhibition), `post` (postseason)
- Pure scraping module — no database writes

**Key functions:** `getAllGameDates()`, `getBoxScoreUrlsForDate()`, `filterDatesToSeason()`, `fetchBoxScoreHtml()`

#### 2. Parse Box Score (`experimental/parse-box-score.js`)

- Parses a single Presto Sports box score HTML page using regex
- Extracts: team names, team IDs (from `<a>` links), period scores, final scores
- Extracts: per-player stats (minutes, FG, 3PT, FT, rebounds, assists, steals, blocks, TO, fouls, points)
- Extracts: team totals and team stats (points in paint, fastbreak, bench, turnovers)
- Extracts: play-by-play with period, game clock, player name, action type, score
- Returns structured object: `{ game, players[], plays[] }`

**Caveats:**
- All HTML parsing is regex-based (no DOM parser). Fragile against markup changes.
- Team IDs come from `<a href="/teams/{id}">` links in the linescore. Some pages lack these links → null team_id.
- Player stat columns are positional (index 0-12). If Presto adds/removes a column, stats map incorrectly.
- Player names in PBP are ALL-CAPS regex matched. Mixed-case names would break extraction.

#### 3. Import Box Scores (`experimental/import-box-scores.js`)

Main orchestrator. Handles date selection, concurrency, and database writes.

**Usage:**
```bash
node experimental/import-box-scores.js --today --season 2025-26 --league mens --concurrency 5 --delay 300
node experimental/import-box-scores.js --from 2026-02-20 --to 2026-02-25 --season 2025-26 --league mens
node experimental/import-box-scores.js --all --season 2025-26 --league mens --concurrency 5 --delay 300
node experimental/import-box-scores.js --yesterday --season 2025-26 --league womens
node experimental/import-box-scores.js --date 2026-02-17 --dry-run
```

**Key behaviors:**
- `insertBoxScore()` upserts game-level data into `exp_game_box_scores` (ON CONFLICT by box_score_url+season)
- Deletes and re-inserts player stats for that game
- Inserts play-by-play row-by-row (performance issue — ~300+ INSERTs per game)
- **Name-matching fallback:** If the parser returns null team_id, queries the `teams` table by exact name+season+league
- **No transaction wrapping** — a crash mid-insert leaves partial data
- After all games: calls `markNaiaGames()` then `refreshTeamStats()`

**`markNaiaGames(season)`:**
- Resets ALL games in the season to `is_naia_game = false`
- Then marks games where BOTH `home_team_id` and `away_team_id` match non-excluded teams in the `teams` table
- Also cross-references the legacy `games` table to set `is_neutral` for neutral-site games
- **Race condition:** Concurrent runs can clear each other's markings

#### 4. Refresh Team Stats (`utils/refreshTeamStats.js`)

Aggregates raw box score data into the pre-calculated `team_ratings` table.

**What it calculates from box scores:**
- close_wins/losses (margin ≤ 5), blowout_wins/losses (margin ≥ 15)
- half_lead_win_pct, comeback_win_pct (using period scores)
- lead_changes_per_game, ties_per_game (from PBP data)
- avg_largest_lead, avg_opp_largest_lead
- second_chance_per_game, opp_second_chance_per_game
- runs_scored_per_game, runs_allowed_per_game (scoring runs from PBP)

**Filters:**
- Excludes exhibition games (`is_exhibition = false`)
- Excludes games with null scores
- Excludes forfeited games from close/blowout/halftime calculations

**Run manually:**
```bash
node utils/refreshTeamStats.js                    # defaults to mens 2025-26
node utils/refreshTeamStats.js womens 2025-26     # womens
```

### Gap-Fill Path (`experimental/fill-missing-box-scores.js`)

Secondary path to catch games the scoreboard scraper missed.

```
S3 Team JSON files (team-urls-{season}.json)
  ↓ fetch each team's S3 JSON → extract boxScoreLink values
  ↓ cross-reference against exp_game_box_scores → find missing URLs
  ↓ fetch + parse + insert missing box scores via insertBoxScore()
  ↓ markNaiaGames() + refreshTeamStats()
```

**Usage:**
```bash
node experimental/fill-missing-box-scores.js --concurrency 3 --delay 500
node experimental/fill-missing-box-scores.js --lookback 14 --league womens  # deeper lookback  
```

**Caveats:**
- Gap-filled games have ALL type flags set to `false` (is_conference, is_exhibition, is_postseason). They are never properly classified.
- Relies on local `team-urls-{season}.json` being up to date
- Only imports games with status starting with "Final"

### Data Repair Scripts

#### `backfill-team-ids.js`
Fixes null `team_id` values by exact name matching against the `teams` table. Also fixes null `team_id` in `exp_player_game_stats`.

```bash
node experimental/backfill-team-ids.js --season 2025-26 --dry-run
node experimental/backfill-team-ids.js --season 2025-26
```

**Limitation:** Exact match only — "St." vs "Saint", "(Ky.)" vs "(KY)" won't match.

#### `detect-forfeits.js`
Reports games with 2-0 scores (potential forfeits) and shows all currently marked forfeits.

```bash
node experimental/detect-forfeits.js --season 2025-26
```

#### `mark-indiana-southeast-forfeits.js`
One-off script with hardcoded dates for Indiana Southeast's forfeited games. Sets `is_forfeit = true` and `forfeit_team_id`.

---

## Legacy Pipeline (2024-25 and earlier)

### Flow

```
1. scrape-team-urls.js   → Discover team S3 JSON endpoints via Puppeteer
2. import-data.js        → Fetch S3 JSON → parse box scores → insert into games table
3. scrape-conferences.js → Scrape conference assignments + logos
4. calculate-analytics.js → Compute efficiency ratings, RPI, SOS → team_ratings table
5. import-players.js     → Import season-level player stats → players table
```

### Step 1: Scrape Team URLs (`scrape-team-urls.js`)

- Uses Puppeteer to scrape the NAIA website for team schedule page URLs
- Extracts each team's Presto Sports JSON data endpoint
- Saves results to `team-urls-YYYY-YY.json` (cached per season)
- Populates the `teams` table with team_id, name, league, json_url

**Run manually:** `npm run scrape` or `node scrape-team-urls.js --season 2025-26`

### Step 2: Import Game Data (`import-data.js`)

- Reads team URLs from the JSON cache file
- Fetches each team's JSON data from Presto Sports S3 (`prestosports-downloads.s3.us-west-2.amazonaws.com`)
- Parses box scores (made-attempted format like "36-67")
- Classifies each game: exhibition, conference, postseason, national tournament
- Determines game location (home/away/neutral)
- Inserts or updates rows in the `games` table
- Processes 5 teams concurrently for performance

**Run manually:** `npm run import` or `node import-data.js --season 2025-26`

### Step 3: Scrape Conferences (`scrape-conferences.js`)

- Scrapes the NAIA website for conference membership assignments
- Updates the `conference` column in the `teams` table
- Also scrapes team logos and school colors

**Run manually:** `npm run conferences` or `node scrape-conferences.js --season 2025-26`

### Step 4: Calculate Analytics (`calculate-analytics.js`)

This is the core analytics engine. It computes:

- **Efficiency ratings:** Offensive Rating, Defensive Rating, Net Rating (points per 100 possessions)
- **Adjusted ratings:** Efficiency ratings adjusted for strength of opponents (iterative algorithm, 5 iterations)
- **RPI:** Rating Percentage Index (30% Win%, 50% Opponent Win%, 20% Opponent's Opponent Win%)
- **Strength of Schedule:** SOS, OSOS (offensive), DSOS (defensive), NSOS (net)
- **Shooting splits:** FG%, 3P%, FT%, eFG% (team and opponent)
- **Four Factors:** eFG%, Turnover%, OREB%, FT Rate
- **Per-game stats:** Assists, steals, blocks, rebounds, fouls
- **Pace:** Possessions per game

Key parameters (defined in the script):
- `ADJUSTMENT_FACTOR = 0.4` — weight for SOS adjustment
- `HOME_COURT_ADVANTAGE = 3.5` — points added/subtracted for home/away adjustments
- `ITERATIONS = 5` — number of iterative adjustment passes

Results are written to the `team_ratings` table with `date_calculated` set to today.

**Run manually:** `npm run analytics` or `node calculate-analytics.js --season 2025-26`

### Step 5: Import Players (`import-players.js`)

- Fetches player statistics from Presto Sports for each team
- Imports per-game stats: points, rebounds, assists, shooting percentages, etc.
- Populates the `players` table

**Run manually:** `node import-players.js --season 2025-26 --league mens`

---

## Automated Schedule

In production, `scheduler.js` runs these jobs automatically via node-cron:

| Time (ET) | Job | Scripts |
|-----------|-----|---------|
| Midnight | Legacy scrape | `scrape-team-urls.js` + `scrape-conferences.js` |
| 2am, 6am, 10am, 2pm, 6pm, 10pm | Legacy refresh | `import-data.js` + `calculate-analytics.js` |
| 3 AM | Players | `import-players.js` (mens + womens) |
| 4 AM + every 2hrs 4pm-midnight | Box scores | `import-box-scores.js --today` (mens + womens) |
| 5 AM | Gap-fill | `fill-missing-box-scores.js` (3-day lookback) |
| 6 AM Sunday | Deep gap-fill | `fill-missing-box-scores.js` (14-day lookback) |

The scheduler prevents overlapping runs of the same job name. It does NOT prevent cross-job overlap (e.g., legacy refresh + box score import running simultaneously, which is safe since they target different tables).

The scheduler only starts when `NODE_ENV=production`.

**Note:** Manual runs are NOT coordinated with the scheduler. Running `import-box-scores.js` manually while the scheduler's box score job is active could cause race conditions in `markNaiaGames()`.

## Full Refresh

To run the entire legacy pipeline manually:

```bash
npm run refresh          # current season
npm run refresh:2024     # 2024-25 season
```

The `refresh` script chains: `scrape → import → conferences → analytics`

## Adding a New Season

1. Create `team-urls-YYYY-YY.json`:
   ```bash
   node scrape-team-urls.js --season YYYY-YY
   ```
2. Update `DEFAULT_SEASON` in `db/pool.js`
3. Update `SEASON` in `render.yaml`
4. Update default in `client/src/App.jsx` DEFAULTS object
5. Add the season key to `BOXSCORE_AVAILABLE` in:
   - `utils/dataSource.js` (backend)
   - `client/src/App.jsx` (frontend)
6. Run legacy pipeline: `npm run refresh --season YYYY-YY`
7. Run box score import: `node experimental/import-box-scores.js --all --season YYYY-YY --league mens`
8. Run box score import: `node experimental/import-box-scores.js --all --season YYYY-YY --league womens`

## Data Source Routing

`utils/dataSource.js` determines which pipeline's data to serve for API requests:

- **Boxscore seasons** (currently `mens:2025-26`, `womens:2025-26`): Uses `dynamicStatsBoxScore.js` which queries `exp_game_box_scores`
- **Legacy seasons** (everything else): Uses `legacy/dynamicStats.js` which queries `games`
- The `?source=legacy` query param forces legacy even for boxscore seasons

Both sources produce the same response shape for the frontend.

## Excluded Teams

The file `config/excluded-teams.js` lists non-NAIA teams (NCAA D1/D2/D3, junior colleges) that should not count as NAIA opponents. These exclusions affect:
- NAIA win/loss record
- Strength of Schedule calculations
- RPI formula

**Legacy pipeline:** When a team plays an excluded opponent, that game is tagged `is_naia_game = FALSE` in the `games` table.

**Box score pipeline:** `markNaiaGames()` sets `is_naia_game = true` only when BOTH teams have matching non-excluded entries in the `teams` table.

## Data Source Format

Presto Sports exposes team data as JSON files hosted on S3:
```
https://prestosports-downloads.s3.us-west-2.amazonaws.com/teamData/{teamId}.json
```

Each JSON file contains:
- Team schedule with game results
- Box score statistics per game
- Game metadata (date, opponent, location, event type)

Box score HTML pages are hosted at:
```
https://naiastats.prestosports.com/sports/{sport}/2025-26/boxscores/{filename}.xml
```

Each box score page contains:
- Period-by-period scores
- Individual player stat lines
- Play-by-play with timestamps
