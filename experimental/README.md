# Box Score & Play-by-Play Pipeline

## Status: **PRIMARY** for MBB 2025-26

As of Feb 2026, this pipeline is the **default data source** for men's basketball
2025-26. The backend auto-resolves to boxscore data for `mens:2025-26`, falling back
to the legacy pipeline for other seasons/leagues. Users can force legacy via
`?source=legacy` in the URL. The scheduler runs `import-box-scores.js --yesterday`
nightly at 4 AM ET to keep data fresh.

## Overview

A separate data pipeline that scrapes game-by-game box scores
and play-by-play data from the NAIA Presto Sports scoreboard.

## What's Different From the Existing Pipeline

| Aspect | Current Pipeline | This Experimental Pipeline |
|--------|-----------------|---------------------------|
| Data source | Team JSON URLs (S3 bucket) | Scoreboard page → individual box score HTML |
| Player stats | Season aggregates only | Per-game box scores |
| Play-by-play | None | Full PBP with timestamps, actions, running score |
| Score breakdown | 1st/2nd half only | Per-period + PBP-derived momentum data |
| Starter/bench | Not tracked per game | Tracked per game |
| Run detection | Not possible | "Team went on a 10-0 run" analysis |
| Game type flags | From team JSON `eventType` field | From scoreboard CSS classes (`conf`, `division`, `exhibition`, `postseason`) |
| Team comparison | Not available | Points in paint, fastbreak, bench, 2nd chance, turnovers, largest lead, ties, lead changes |

## Data Flow

```
Scoreboard page (by date)
  → Extract box score URLs + game type flags (conf/division/exhibition/postseason)
    → For each box score URL:
      → Parse player stats (starters/bench, full stat line)
      → Parse play-by-play (timestamped events with running score)
      → Parse score by period
      → Parse team comparison stats (paint, fastbreak, bench, 2nd chance, etc.)
      → Store in experimental DB tables
```

## Database Tables (experimental, prefixed with `exp_`)

- `exp_game_box_scores` — Game-level metadata, period scores, team totals, team comparison stats, game type flags
- `exp_player_game_stats` — Per-player per-game full stat line
- `exp_play_by_play` — Individual plays with timestamps and running score

## Scripts

| Script | Purpose |
|--------|---------|
| `migrate-create-tables.js` | Creates the experimental DB tables |
| `scrape-scoreboard.js` | Scrapes scoreboard page to get all game dates and box score URLs |
| `parse-box-score.js` | Parses a single box score HTML into structured data |
| `import-box-scores.js` | Main orchestrator: scrapes dates → fetches box scores → parses → imports |

## Usage

```bash
# 1. Create the experimental tables (safe — only creates new tables)
node experimental/migrate-create-tables.js

# 2. Import box scores for a specific date
node experimental/import-box-scores.js --date 2026-02-17

# 3. Import box scores for a date range
node experimental/import-box-scores.js --from 2025-10-01 --to 2026-02-17

# 4. Import all box scores for the current season
node experimental/import-box-scores.js --all

# Options
#   --season 2025-26    (default: 2025-26)
#   --league mens        (default: mens, also: womens)
#   --concurrency 3      (default: 3 concurrent box score fetches)
#   --delay 500          (default: 500ms between batches)
#   --dry-run            (parse and display, don't write to DB)
```

## Safety

- All boxscore tables use the `exp_` prefix — zero collision risk with existing tables
- The legacy pipeline continues running (needed for `teams`, `team_ratings`, conferences, bracketcast)
- Source auto-resolution is controlled by `BOXSCORE_AVAILABLE` in `utils/dataSource.js`
- To add new season/league backfills, populate exp_ tables then add to `BOXSCORE_AVAILABLE`
- Force legacy fallback anytime with `?source=legacy`
- Drop all boxscore tables with: `node experimental/migrate-create-tables.js --drop`
