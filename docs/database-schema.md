# Database Schema

## Overview

Axis Analytics uses PostgreSQL with 7 main tables across two generations:

- **Legacy tables:** `teams`, `games`, `team_ratings`, `players` — populated by the root-level legacy pipeline
- **Box score tables:** `exp_game_box_scores`, `exp_player_game_stats`, `exp_play_by_play` — populated by the `experimental/` box score pipeline

The box score tables are the primary data source for the 2025-26 season onwards. The legacy tables are still populated (for `team_ratings`, conference data, and fallback) but `games` table is no longer the authoritative game data for current seasons.

## Tables

### `teams`

Stores team identity and metadata. One row per team per season.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Auto-incrementing primary key |
| team_id | VARCHAR(50) | Presto Sports team identifier |
| name | VARCHAR(255) | Team name |
| league | VARCHAR(10) | `mens` or `womens` |
| conference | VARCHAR(100) | Conference name |
| json_url | TEXT | Presto Sports JSON data URL |
| primary_color | VARCHAR(7) | Hex color code |
| secondary_color | VARCHAR(7) | Hex color code |
| logo_url | TEXT | Team logo image URL |
| city | VARCHAR(100) | School city |
| state | VARCHAR(2) | School state abbreviation |
| latitude | DECIMAL(10,7) | School latitude |
| longitude | DECIMAL(10,7) | School longitude |
| is_excluded | BOOLEAN | TRUE if non-NAIA team (excluded from calculations) |
| season | VARCHAR(10) | Season identifier (e.g., `2025-26`) |
| created_at | TIMESTAMP | Row creation timestamp |
| updated_at | TIMESTAMP | Row update timestamp |

**Unique constraint:** `(team_id, season)`
**Indexes:** `idx_teams_league`, `idx_teams_season`

---

### `games`

Stores individual game results and box score data. One row per team per game (each game appears twice — once for each team).

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Auto-incrementing primary key |
| game_id | VARCHAR(100) | Unique game identifier |
| team_id | VARCHAR(50) | Team this row is for |
| opponent_id | VARCHAR(50) | Opponent team_id (if NAIA) |
| opponent_name | VARCHAR(255) | Opponent display name |
| game_date | DATE | Date of game |
| location | VARCHAR(20) | `home`, `away`, or `neutral` |
| team_score | INTEGER | Team's final score |
| opponent_score | INTEGER | Opponent's final score |
| is_completed | BOOLEAN | Whether game has been played |
| season | VARCHAR(10) | Season identifier |
| **Classification flags** | | |
| is_conference | BOOLEAN | Conference game |
| is_postseason | BOOLEAN | Postseason (conference tournament) game |
| is_national_tournament | BOOLEAN | National tournament game |
| is_naia_game | BOOLEAN | Opponent is an NAIA team |
| event_id | VARCHAR(50) | Presto Sports event ID |
| **Team box score** | | |
| fgm, fga | INTEGER | Field goals made/attempted |
| fg_pct | DECIMAL(5,3) | Field goal percentage |
| fgm3, fga3 | INTEGER | 3-pointers made/attempted |
| fg3_pct | DECIMAL(5,3) | 3-point percentage |
| ftm, fta | INTEGER | Free throws made/attempted |
| ft_pct | DECIMAL(5,3) | Free throw percentage |
| oreb, dreb, treb | INTEGER | Offensive/defensive/total rebounds |
| ast | INTEGER | Assists |
| stl | INTEGER | Steals |
| blk | INTEGER | Blocks |
| turnovers | INTEGER | Turnovers |
| pf | INTEGER | Personal fouls |
| pts_paint | INTEGER | Points in the paint |
| pts_fastbreak | INTEGER | Fastbreak points |
| pts_bench | INTEGER | Bench points |
| pts_turnovers | INTEGER | Points off turnovers |
| possessions | DECIMAL(6,1) | Estimated possessions |
| **Opponent box score** | | |
| opp_fgm, opp_fga, ... | (same types) | Mirror of all team stats for opponent |
| **Halftime scores** | | |
| first_half_score | INTEGER | Team's 1st half score |
| second_half_score | INTEGER | Team's 2nd half score |
| opp_first_half_score | INTEGER | Opponent's 1st half score |
| opp_second_half_score | INTEGER | Opponent's 2nd half score |
| **Timestamps** | | |
| created_at | TIMESTAMP | Row creation |
| updated_at | TIMESTAMP | Row update |

**Unique constraint:** `(game_id, season)`
**Indexes:** `idx_games_team`, `idx_games_date`, `idx_games_season`

---

### `team_ratings`

Stores pre-calculated analytics metrics. Updated daily by `calculate-analytics.js`. One row per team per calculation date per season.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Auto-incrementing primary key |
| team_id | VARCHAR(50) | Team identifier |
| date_calculated | DATE | Date these ratings were computed |
| season | VARCHAR(10) | Season identifier |
| **Record** | | |
| games_played | INTEGER | Total NAIA games |
| wins, losses | INTEGER | Overall wins/losses |
| win_pct | DECIMAL(5,3) | Overall win percentage |
| naia_wins, naia_losses | INTEGER | NAIA-only wins/losses |
| naia_win_pct | DECIMAL(5,3) | NAIA win percentage |
| **Scoring** | | |
| points_per_game | DECIMAL(6,2) | Average points scored |
| points_allowed_per_game | DECIMAL(6,2) | Average points allowed |
| **Efficiency Ratings** | | |
| offensive_rating | DECIMAL(6,2) | Points per 100 possessions |
| defensive_rating | DECIMAL(6,2) | Points allowed per 100 possessions |
| net_rating | DECIMAL(6,2) | ORTG minus DRTG |
| adjusted_offensive_rating | DECIMAL(6,2) | SOS-adjusted ORTG |
| adjusted_defensive_rating | DECIMAL(6,2) | SOS-adjusted DRTG |
| adjusted_net_rating | DECIMAL(6,2) | SOS-adjusted net rating |
| **Shooting** | | |
| fg_pct | DECIMAL(5,2) | Field goal % |
| fg3_pct | DECIMAL(5,2) | 3-point % |
| ft_pct | DECIMAL(5,2) | Free throw % |
| efg_pct | DECIMAL(5,2) | Effective FG % |
| fg_pct_opp | DECIMAL(5,2) | Opponent FG % |
| fg3_pct_opp | DECIMAL(5,2) | Opponent 3P % |
| efg_pct_opp | DECIMAL(5,2) | Opponent eFG % |
| **Four Factors** | | |
| turnover_pct | DECIMAL(5,2) | Turnovers per 100 possessions |
| turnover_pct_opp | DECIMAL(5,2) | Opponent turnover % |
| oreb_pct | DECIMAL(5,2) | Offensive rebound % |
| dreb_pct | DECIMAL(5,2) | Defensive rebound % |
| oreb_pct_opp | DECIMAL(5,2) | Opponent OREB % |
| dreb_pct_opp | DECIMAL(5,2) | Opponent DREB % |
| ft_rate | DECIMAL(5,2) | FTA / FGA |
| three_pt_rate | DECIMAL(5,2) | 3PA / FGA |
| pace | DECIMAL(5,1) | Possessions per game |
| **Per-Game Stats** | | |
| assists_per_game | DECIMAL(5,2) | |
| turnovers_per_game | DECIMAL(5,2) | |
| steals_per_game | DECIMAL(5,2) | |
| blocks_per_game | DECIMAL(5,2) | |
| fouls_per_game | DECIMAL(5,2) | |
| oreb_per_game | DECIMAL(5,2) | |
| dreb_per_game | DECIMAL(5,2) | |
| total_reb_per_game | DECIMAL(5,2) | |
| **Opponent Per-Game Stats** | | |
| assists_per_game_opp | DECIMAL(5,2) | |
| turnovers_per_game_opp | DECIMAL(5,2) | |
| steals_per_game_opp | DECIMAL(5,2) | |
| blocks_per_game_opp | DECIMAL(5,2) | |
| fouls_per_game_opp | DECIMAL(5,2) | |
| oreb_per_game_opp | DECIMAL(5,2) | |
| dreb_per_game_opp | DECIMAL(5,2) | |
| total_reb_per_game_opp | DECIMAL(5,2) | |
| **Strength of Schedule** | | |
| rpi | DECIMAL(8,6) | Rating Percentage Index |
| strength_of_schedule | DECIMAL(8,6) | Overall SOS |
| opponent_win_pct | DECIMAL(8,6) | Average opponent win % |
| opponent_opponent_win_pct | DECIMAL(8,6) | Avg opponent's opponent win % |
| osos | DECIMAL(6,2) | Offensive SOS |
| dsos | DECIMAL(6,2) | Defensive SOS |
| nsos | DECIMAL(6,2) | Net SOS |
| assist_turnover_ratio | DECIMAL(5,2) | AST/TO ratio |
| **Timestamps** | | |
| created_at | TIMESTAMP | Row creation |

**Unique constraint:** `(team_id, date_calculated, season)`
**Indexes:** `idx_ratings_team_date`, `idx_ratings_season`

---

### `players`

Stores individual player season statistics. One row per player per season.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Auto-incrementing primary key |
| player_id | VARCHAR(50) | Presto Sports player ID |
| team_id | VARCHAR(50) | Team identifier |
| season | VARCHAR(10) | Season identifier |
| league | VARCHAR(20) | `mens` or `womens` |
| **Player Info** | | |
| first_name | VARCHAR(100) | |
| last_name | VARCHAR(100) | |
| position | VARCHAR(20) | G, F, C, PG, SG, SF, PF, etc. |
| year | VARCHAR(20) | Fr, So, Jr, Sr, Gr |
| uniform | VARCHAR(10) | Jersey number |
| height | VARCHAR(10) | Player height |
| **Game Stats** | | |
| gp | INTEGER | Games played |
| gs | INTEGER | Games started |
| min | DECIMAL(10,1) | Total minutes |
| min_pg | DECIMAL(5,1) | Minutes per game |
| **Scoring** | | |
| pts | INTEGER | Total points |
| pts_pg | DECIMAL(5,1) | Points per game |
| **Rebounds** | | |
| oreb, dreb, reb | INTEGER | Offensive/defensive/total |
| reb_pg | DECIMAL(5,1) | Rebounds per game |
| **Assists & Turnovers** | | |
| ast | INTEGER | Total assists |
| ast_pg | DECIMAL(5,1) | Assists per game |
| turnovers | INTEGER | Total turnovers |
| to_pg | DECIMAL(5,1) | Turnovers per game |
| ast_to_ratio | DECIMAL(5,2) | Assist-to-turnover ratio |
| **Defense** | | |
| stl, blk | INTEGER | Total steals/blocks |
| stl_pg, blk_pg | DECIMAL(5,1) | Per game |
| pf | INTEGER | Personal fouls |
| **Shooting** | | |
| fgm, fga | INTEGER | Field goals made/attempted |
| fg_pct | DECIMAL(5,1) | FG % |
| fg3m, fg3a | INTEGER | 3-pointers made/attempted |
| fg3_pct | DECIMAL(5,1) | 3P % |
| ftm, fta | INTEGER | Free throws made/attempted |
| ft_pct | DECIMAL(5,1) | FT % |
| **Timestamps** | | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Unique constraint:** `(player_id, season)`
**Indexes:** `idx_players_team_id`, `idx_players_season`, `idx_players_league`, `idx_players_team_season`, `idx_players_pts_pg`, `idx_players_last_name`

---

### `exp_game_box_scores`

Primary game data table for 2025-26+. One row per game (NOT per team — each game appears once with away/home columns). Populated by `experimental/import-box-scores.js`.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Auto-incrementing primary key |
| box_score_url | TEXT | Presto Sports box score file path (e.g., `/sports/mbkb/2025-26/boxscores/20260225_abc1.xml`) |
| season | VARCHAR(10) | Season identifier |
| league | VARCHAR(10) | `mens` or `womens` |
| game_date | DATE | Date of game |
| **Classification flags** | | |
| is_conference | BOOLEAN | Conference game |
| is_division | BOOLEAN | Division game |
| is_exhibition | BOOLEAN | Exhibition game |
| is_postseason | BOOLEAN | Postseason (conference tournament) game |
| is_naia_game | BOOLEAN | Both teams are NAIA (set by `markNaiaGames()`) |
| is_national_tournament | BOOLEAN | National tournament game |
| is_neutral | BOOLEAN | Neutral-site game |
| forfeit_team_id | VARCHAR(50) | Team_id of the forfeiting team (null if not a forfeit) |
| **Away team** | | |
| away_team_name | VARCHAR(255) | Away team display name |
| away_team_id | VARCHAR(50) | Away team Presto Sports ID (null if parser couldn't extract) |
| away_team_record | VARCHAR(20) | Record at time of game (e.g., "15-3") |
| away_score | INTEGER | Final score |
| away_period_scores | JSONB | Period scores as array, e.g., `[32, 29]` or `[32, 29, 10]` for OT |
| **Home team** | | |
| home_team_name | VARCHAR(255) | Home team display name |
| home_team_id | VARCHAR(50) | Home team Presto Sports ID |
| home_team_record | VARCHAR(20) | Record at time of game |
| home_score | INTEGER | Final score |
| home_period_scores | JSONB | Period scores as array |
| **Game metadata** | | |
| status | VARCHAR(50) | Game status text (e.g., "Final", "Final (OT)") |
| num_periods | INTEGER | Number of periods played (2 for regulation, 3+ for OT) |
| location_text | VARCHAR(255) | Venue text from box score |
| attendance | INTEGER | Attendance figure |
| ties | INTEGER | Number of tie scores during the game |
| lead_changes | INTEGER | Number of lead changes |
| **Away team box score** | | |
| away_fgm, away_fga | INTEGER | Field goals made/attempted |
| away_fg_pct | DECIMAL(5,3) | Field goal percentage |
| away_fgm3, away_fga3 | INTEGER | 3-pointers made/attempted |
| away_fg3_pct | DECIMAL(5,3) | 3-point percentage |
| away_ftm, away_fta | INTEGER | Free throws made/attempted |
| away_ft_pct | DECIMAL(5,3) | Free throw percentage |
| away_oreb, away_dreb, away_reb | INTEGER | Rebounds |
| away_ast | INTEGER | Assists |
| away_stl | INTEGER | Steals |
| away_blk | INTEGER | Blocks |
| away_to | INTEGER | Turnovers |
| away_pf | INTEGER | Personal fouls |
| away_pts | INTEGER | Total points |
| away_points_in_paint | INTEGER | |
| away_fastbreak_points | INTEGER | |
| away_bench_points | INTEGER | |
| away_second_chance_points | INTEGER | |
| away_points_off_turnovers | INTEGER | |
| away_largest_lead | INTEGER | |
| away_time_of_largest_lead | VARCHAR(20) | |
| **Home team box score** | | (same columns as away, prefixed `home_`) |
| home_fgm through home_time_of_largest_lead | (same types) | Mirror of away_ columns |
| **Timestamps** | | |
| created_at | TIMESTAMP | Row creation |
| updated_at | TIMESTAMP | Row update |

**Unique constraint:** `(box_score_url, season)`
**Indexes:** `idx_exp_gbs_date`, `idx_exp_gbs_season`, `idx_exp_gbs_away_team`, `idx_exp_gbs_home_team`, `idx_exp_gbs_type` (conference+exhibition+postseason), partial index on `is_naia_game = true`, partial index on `forfeit_team_id IS NOT NULL`

**Key difference from `games` table:** Box scores store ONE row per game (with away/home columns), while `games` stores TWO rows per game (one per team perspective). The `dynamicStatsBoxScore.js` CTE "flattens" each box score row into two per-team rows before aggregation.

---

### `exp_player_game_stats`

Per-player per-game statistics. Populated by `experimental/import-box-scores.js`.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Auto-incrementing primary key |
| game_box_score_id | INTEGER | FK → `exp_game_box_scores(id)` ON DELETE CASCADE |
| box_score_url | TEXT | Box score URL (denormalized for convenience) |
| season | VARCHAR(10) | Season identifier |
| player_name | VARCHAR(255) | Player display name |
| player_url | TEXT | Presto Sports player profile URL |
| player_id | VARCHAR(50) | Extracted from player_url |
| uniform_number | VARCHAR(10) | Jersey number |
| team_name | VARCHAR(255) | Team name |
| team_id | VARCHAR(50) | Team Presto Sports ID |
| is_home | BOOLEAN | Whether player is on the home team |
| is_starter | BOOLEAN | Whether player started the game |
| minutes | INTEGER | Minutes played |
| fgm, fga | INTEGER | Field goals |
| fgm3, fga3 | INTEGER | 3-pointers |
| ftm, fta | INTEGER | Free throws |
| oreb, dreb, reb | INTEGER | Rebounds |
| ast | INTEGER | Assists |
| stl | INTEGER | Steals |
| blk | INTEGER | Blocks |
| turnovers | INTEGER | Turnovers |
| pf | INTEGER | Personal fouls |
| pts | INTEGER | Points |
| created_at | TIMESTAMP | Row creation |

**Unique constraint:** `(box_score_url, player_id, season)` — note: NULL player_ids bypass UNIQUE checks
**Indexes:** `idx_exp_pgs_game`, `idx_exp_pgs_player`, `idx_exp_pgs_team`, `idx_exp_pgs_season`

---

### `exp_play_by_play`

Every play event from box scores. Used for lineup analysis, scoring run detection, clutch stats, and lead/tie counting.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Auto-incrementing primary key |
| game_box_score_id | INTEGER | FK → `exp_game_box_scores(id)` ON DELETE CASCADE |
| box_score_url | TEXT | Box score URL (denormalized) |
| season | VARCHAR(10) | Season identifier |
| period | INTEGER | Period number (1, 2, 3=OT1, etc.) |
| game_clock | VARCHAR(10) | Time remaining (e.g., "15:23", "00:45") |
| sequence_number | INTEGER | Ordering within the game (0-indexed) |
| team_name | VARCHAR(255) | Team performing the action |
| team_id | VARCHAR(50) | Always NULL (known issue — never populated) |
| is_home | BOOLEAN | Whether action is by home team |
| player_name | VARCHAR(255) | Player name (ALL-CAPS from Presto) |
| action_text | TEXT | Raw action description |
| action_type | VARCHAR(50) | Classified type: `'made_2pt'`, `'made_3pt'`, `'made_ft'`, `'missed_2pt'`, `'missed_3pt'`, `'missed_ft'`, `'rebound'`, `'turnover'`, `'foul'`, `'steal'`, `'block'`, `'assist'`, `'substitution'`, `'timeout'`, `'jumpball'`, `'other'` |
| is_scoring_play | BOOLEAN | Whether this play changed the score |
| away_score | INTEGER | Running away score after this play |
| home_score | INTEGER | Running home score after this play |
| created_at | TIMESTAMP | Row creation |

**Indexes:** `idx_exp_pbp_game`, `idx_exp_pbp_period`, `idx_exp_pbp_team`, `idx_exp_pbp_type`, `idx_exp_pbp_season`, `idx_exp_pbp_sequence` (game_box_score_id + sequence_number)

---

## Relationships

```
teams.team_id ←── games.team_id
teams.team_id ←── games.opponent_id
teams.team_id ←── team_ratings.team_id
teams.team_id ←── players.team_id
teams.team_id ←── exp_game_box_scores.away_team_id
teams.team_id ←── exp_game_box_scores.home_team_id
teams.team_id ←── exp_player_game_stats.team_id
exp_game_box_scores.id ←── exp_player_game_stats.game_box_score_id
exp_game_box_scores.id ←── exp_play_by_play.game_box_score_id
```

Note: Foreign key constraints were dropped in `migrate-add-season.js` to simplify multi-season data management. Referential integrity is maintained at the application level.

## Migration History

| # | Script | Changes |
|---|--------|---------|
| 1 | `setup-database.js` | Creates `teams`, `games`, `team_ratings` tables with base columns |
| 2 | `migrations/001_create_players_table.sql` | Creates `players` table |
| 3 | `migrate-add-analytics.js` | Adds 28 analytics columns to `team_ratings` |
| 4 | `migrate-add-game-stats.js` | Adds 47 box score columns to `games` |
| 5 | `migrate-add-naia-game.js` | Adds `is_naia_game` flag to `games` |
| 6 | `migrate-add-location.js` | Adds city/state/lat/lng to `teams` |
| 7 | `migrate-add-excluded.js` | Adds `is_excluded` flag to `teams` |
| 8 | `migrate-add-season.js` | Adds `season` column to all tables, changes unique constraints |
| 9 | `migrate-add-national-tournament.js` | Adds `is_national_tournament` flag to `games` |
| 10 | `migrate-sos-precision.js` | Increases decimal precision on SOS columns |
| 11 | `migrate-copy-locations.js` | Copies location data between seasons |
| 12 | `experimental/migrate-create-tables.js` | Creates `exp_game_box_scores`, `exp_player_game_stats`, `exp_play_by_play` |
| 13 | `migrations/002_add_exp_game_flags.js` | Adds `is_naia_game`, `is_national_tournament`, `is_neutral` to `exp_game_box_scores` |
| 14 | `migrations/002_create_import_log_table.sql` | Creates `box_score_import_log` table for gap-fill auditing |
| 15 | `migrations/003_create_future_games.js` | Creates `future_games` table for projected records |
| 16 | `migrations/backfill-exp-game-flags.js` | Backfills `is_naia_game`/`is_national_tournament` data for existing rows |
| 17 | (unnamed) | Adds `forfeit_team_id`, `is_forfeit` to `exp_game_box_scores` |
| 18 | (unnamed) | Adds game flow columns to `team_ratings`: `close_wins`, `close_losses`, `blowout_wins`, `blowout_losses`, `half_lead_win_pct`, `comeback_win_pct`, `lead_changes_per_game`, `ties_per_game`, `avg_largest_lead`, `avg_opp_largest_lead`, `second_chance_per_game`, `opp_second_chance_per_game`, `runs_scored_per_game`, `runs_allowed_per_game` |

Migrations are ad-hoc Node.js scripts, not managed by a migration framework. They must be run manually and in order.
