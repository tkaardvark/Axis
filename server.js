require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const { startScheduler } = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3001;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/dist')));
}

// Default season constant
const DEFAULT_SEASON = '2025-26';

/**
 * Get conference champions for a given league and season
 * A conference champion is the team that won the latest conference tournament game
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {string} league - 'mens' or 'womens'
 * @param {string} season - Season identifier (e.g., '2025-26')
 * @returns {Promise<Set<string>>} - Set of team_ids that are conference champions
 */
async function getConferenceChampions(pool, league, season) {
  try {
    // Find the conference championship by identifying the main conference tournament.
    // The main tournament is identified by finding the date with the most teams playing,
    // then including all dates within a 10-day window that have continuous activity
    // (gaps of 5+ days indicate a separate tournament like a play-in).
    const result = await pool.query(`
      WITH postseason_games AS (
        SELECT t.team_id, t.name, t.conference, g.game_date, g.game_id,
               g.team_score, g.opponent_score
        FROM games g
        JOIN teams t ON g.team_id = t.team_id AND g.season = t.season
        WHERE t.league = $1 
          AND g.season = $2
          AND g.is_postseason = true 
          AND g.is_national_tournament = false
          AND g.is_completed = true
      ),
      conf_game_dates AS (
        -- Count how many teams from each conference played on each date
        SELECT conference, game_date, COUNT(DISTINCT team_id) as teams_playing
        FROM postseason_games
        GROUP BY conference, game_date
      ),
      tournament_peak AS (
        -- Find the date with the MOST teams playing (start of main tournament bracket)
        SELECT conference, game_date as peak_date, teams_playing,
               ROW_NUMBER() OVER (PARTITION BY conference ORDER BY teams_playing DESC, game_date ASC) as rn
        FROM conf_game_dates
      ),
      main_tournament_dates AS (
        -- Get dates within 10 days of peak
        SELECT cd.conference, cd.game_date, cd.teams_playing,
               LAG(cd.game_date) OVER (PARTITION BY cd.conference ORDER BY cd.game_date) as prev_date
        FROM conf_game_dates cd
        JOIN tournament_peak tp ON cd.conference = tp.conference AND tp.rn = 1
        WHERE cd.game_date >= tp.peak_date - INTERVAL '1 day'
          AND cd.game_date <= tp.peak_date + INTERVAL '10 days'
      ),
      continuous_tournament AS (
        -- Filter to only include dates that are within 4 days of the previous date (continuous tournament)
        SELECT conference, game_date, teams_playing
        FROM main_tournament_dates
        WHERE prev_date IS NULL OR (game_date - prev_date) <= 4
      ),
      championship_dates AS (
        -- Find the last date with 2+ teams within the continuous main tournament
        SELECT conference, MAX(game_date) as champ_date
        FROM continuous_tournament
        WHERE teams_playing >= 2
        GROUP BY conference
      ),
      championship_winners AS (
        -- Find the team that won on the championship date for each conference
        SELECT pg.team_id, pg.conference,
               ROW_NUMBER() OVER (PARTITION BY pg.conference ORDER BY pg.game_id DESC) as rn
        FROM postseason_games pg
        JOIN championship_dates cd ON pg.conference = cd.conference AND pg.game_date = cd.champ_date
        WHERE pg.team_score > pg.opponent_score
      )
      SELECT team_id FROM championship_winners WHERE rn = 1
    `, [league, season]);
    
    return new Set(result.rows.map(r => r.team_id));
  } catch (error) {
    console.error('Error getting conference champions:', error);
    return new Set();
  }
}

/**
 * Calculate team stats dynamically from games table based on filters
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {Object} filters - Filter options
 * @param {string} filters.league - 'mens' or 'womens'
 * @param {string} filters.conference - Conference name or 'All Conferences'
 * @param {string} filters.gameType - 'all' for all NAIA games, 'conference' for conference games only
 * @param {string} filters.seasonType - 'all', 'regular', or 'postseason'
 * @param {string} filters.seasonSegment - 'all', 'last10', 'last5', 'last3', or 'YYYY-MM' for specific month
 * @param {string} filters.season - Season identifier (e.g., '2025-26')
 * @returns {Promise<QueryResult>} - PostgreSQL query result
 */
async function calculateDynamicStats(pool, filters) {
  const {
    league = 'mens',
    conference,
    gameType = 'all',
    seasonType = 'all',
    seasonSegment = 'all',
    season = DEFAULT_SEASON,
  } = filters;

  // Build the WHERE clause for game filtering
  const gameFilters = ['g.is_naia_game = true', 'g.is_completed = true', `g.season = '${season.replace(/'/g, "''")}'`];
  if (gameType === 'conference') {
    gameFilters.push('g.is_conference = true');
  }
  
  // Season type filter (regular season vs postseason variants)
  if (seasonType === 'regular') {
    gameFilters.push('g.is_postseason = false');
  } else if (seasonType === 'postseason') {
    gameFilters.push('g.is_postseason = true');
  } else if (seasonType === 'conftournament') {
    gameFilters.push('g.is_postseason = true');
    gameFilters.push('g.is_national_tournament = false');
  } else if (seasonType === 'nationaltournament') {
    gameFilters.push('g.is_national_tournament = true');
  }

  // Handle month filter (format: YYYY-MM)
  if (seasonSegment && seasonSegment.match(/^\d{4}-\d{2}$/)) {
    const [year, month] = seasonSegment.split('-');
    gameFilters.push(`EXTRACT(YEAR FROM g.game_date) = ${parseInt(year)}`);
    gameFilters.push(`EXTRACT(MONTH FROM g.game_date) = ${parseInt(month)}`);
  }

  const gameWhereClause = gameFilters.join(' AND ');

  // Determine if we need to limit to last N games
  const lastNGames = seasonSegment === 'last10' ? 10 
                   : seasonSegment === 'last5' ? 5 
                   : seasonSegment === 'last3' ? 3 
                   : null;

  const params = [league];
  let paramIndex = 2;

  // Build conference filter for final WHERE
  let conferenceClause = '';
  if (conference && conference !== 'All Conferences') {
    conferenceClause = `AND t.conference = $${paramIndex}`;
    params.push(conference);
    paramIndex++;
  }

  // Use different query structure for last N games (requires window function)
  let gamesCTE;
  if (lastNGames) {
    gamesCTE = `
      ranked_games AS (
        SELECT g.*,
          ROW_NUMBER() OVER (PARTITION BY g.team_id ORDER BY g.game_date DESC) as rn
        FROM games g
        JOIN teams t ON g.team_id = t.team_id
        WHERE t.league = $1
          AND ${gameWhereClause}
      ),
      filtered_games AS (
        SELECT * FROM ranked_games WHERE rn <= ${lastNGames}
      ),
      game_stats AS (
        SELECT 
          g.team_id,
          COUNT(*) as games_played,
          SUM(CASE WHEN g.team_score > g.opponent_score THEN 1 ELSE 0 END) as wins,
          SUM(CASE WHEN g.team_score < g.opponent_score THEN 1 ELSE 0 END) as losses,
          AVG(g.team_score) as points_per_game,
          AVG(g.opponent_score) as points_allowed_per_game,
          -- Shooting stats
          SUM(g.fgm)::float / NULLIF(SUM(g.fga), 0) as fg_pct,
          SUM(g.fgm3)::float / NULLIF(SUM(g.fga3), 0) as fg3_pct,
          SUM(g.ftm)::float / NULLIF(SUM(g.fta), 0) as ft_pct,
          (SUM(g.fgm) + 0.5 * SUM(g.fgm3))::float / NULLIF(SUM(g.fga), 0) as efg_pct,
          -- Opponent shooting
          SUM(g.opp_fgm)::float / NULLIF(SUM(g.opp_fga), 0) as fg_pct_opp,
          SUM(g.opp_fgm3)::float / NULLIF(SUM(g.opp_fga3), 0) as fg3_pct_opp,
          (SUM(g.opp_fgm) + 0.5 * SUM(g.opp_fgm3))::float / NULLIF(SUM(g.opp_fga), 0) as efg_pct_opp,
          -- Rebounding
          SUM(g.oreb)::float / NULLIF(SUM(g.oreb) + SUM(g.opp_dreb), 0) as oreb_pct,
          SUM(g.dreb)::float / NULLIF(SUM(g.dreb) + SUM(g.opp_oreb), 0) as dreb_pct,
          SUM(g.opp_oreb)::float / NULLIF(SUM(g.opp_oreb) + SUM(g.dreb), 0) as oreb_pct_opp,
          SUM(g.opp_dreb)::float / NULLIF(SUM(g.opp_dreb) + SUM(g.oreb), 0) as dreb_pct_opp,
          -- Turnovers
          SUM(g.turnovers)::float / NULLIF(SUM(g.fga) - SUM(g.oreb) + SUM(g.turnovers) + 0.475 * SUM(g.fta), 0) as turnover_pct,
          SUM(g.opp_turnovers)::float / NULLIF(SUM(g.opp_fga) - SUM(g.opp_oreb) + SUM(g.opp_turnovers) + 0.475 * SUM(g.opp_fta), 0) as turnover_pct_opp,
          -- Rates
          SUM(g.fga3)::float / NULLIF(SUM(g.fga), 0) as three_pt_rate,
          SUM(g.fta)::float / NULLIF(SUM(g.fga), 0) as ft_rate,
          -- For efficiency calculations
          SUM(g.team_score) as total_pts,
          SUM(g.opponent_score) as total_pts_opp,
          SUM(g.fga) as total_fga,
          SUM(g.oreb) as total_oreb,
          SUM(g.turnovers) as total_to,
          SUM(g.fta) as total_fta,
          SUM(g.opp_fga) as total_opp_fga,
          SUM(g.opp_oreb) as total_opp_oreb,
          SUM(g.opp_turnovers) as total_opp_to,
          SUM(g.opp_fta) as total_opp_fta,
          -- Per-game totals
          SUM(g.ast) as total_ast,
          SUM(g.stl) as total_stl,
          SUM(g.blk) as total_blk,
          SUM(g.treb) as total_treb,
          SUM(g.oreb) as total_oreb_raw,
          SUM(g.dreb) as total_dreb,
          SUM(g.pf) as total_pf,
          SUM(g.fgm) as total_fgm,
          SUM(g.fgm3) as total_fgm3,
          SUM(g.ftm) as total_ftm,
          SUM(g.pts_paint) as total_pts_paint,
          SUM(g.pts_fastbreak) as total_pts_fastbreak,
          SUM(g.pts_turnovers) as total_pts_off_to,
          SUM(g.pts_bench) as total_pts_bench,
          -- Opponent per-game totals
          SUM(g.opp_ast) as total_opp_ast,
          SUM(g.opp_stl) as total_opp_stl,
          SUM(g.opp_blk) as total_opp_blk,
          SUM(g.opp_treb) as total_opp_treb,
          SUM(g.opp_pf) as total_opp_pf,
          SUM(g.opp_pts_paint) as total_opp_pts_paint,
          SUM(g.opp_pts_fastbreak) as total_opp_pts_fastbreak,
          SUM(g.opp_pts_turnovers) as total_opp_pts_off_to
        FROM filtered_games g
        GROUP BY g.team_id
        HAVING COUNT(*) > 0
      )`;
  } else {
    gamesCTE = `
      game_stats AS (
        SELECT 
          g.team_id,
          COUNT(*) as games_played,
          SUM(CASE WHEN g.team_score > g.opponent_score THEN 1 ELSE 0 END) as wins,
          SUM(CASE WHEN g.team_score < g.opponent_score THEN 1 ELSE 0 END) as losses,
          AVG(g.team_score) as points_per_game,
          AVG(g.opponent_score) as points_allowed_per_game,
          -- Shooting stats
          SUM(g.fgm)::float / NULLIF(SUM(g.fga), 0) as fg_pct,
          SUM(g.fgm3)::float / NULLIF(SUM(g.fga3), 0) as fg3_pct,
          SUM(g.ftm)::float / NULLIF(SUM(g.fta), 0) as ft_pct,
          (SUM(g.fgm) + 0.5 * SUM(g.fgm3))::float / NULLIF(SUM(g.fga), 0) as efg_pct,
          -- Opponent shooting
          SUM(g.opp_fgm)::float / NULLIF(SUM(g.opp_fga), 0) as fg_pct_opp,
          SUM(g.opp_fgm3)::float / NULLIF(SUM(g.opp_fga3), 0) as fg3_pct_opp,
          (SUM(g.opp_fgm) + 0.5 * SUM(g.opp_fgm3))::float / NULLIF(SUM(g.opp_fga), 0) as efg_pct_opp,
          -- Rebounding
          SUM(g.oreb)::float / NULLIF(SUM(g.oreb) + SUM(g.opp_dreb), 0) as oreb_pct,
          SUM(g.dreb)::float / NULLIF(SUM(g.dreb) + SUM(g.opp_oreb), 0) as dreb_pct,
          SUM(g.opp_oreb)::float / NULLIF(SUM(g.opp_oreb) + SUM(g.dreb), 0) as oreb_pct_opp,
          SUM(g.opp_dreb)::float / NULLIF(SUM(g.opp_dreb) + SUM(g.oreb), 0) as dreb_pct_opp,
          -- Turnovers
          SUM(g.turnovers)::float / NULLIF(SUM(g.fga) - SUM(g.oreb) + SUM(g.turnovers) + 0.475 * SUM(g.fta), 0) as turnover_pct,
          SUM(g.opp_turnovers)::float / NULLIF(SUM(g.opp_fga) - SUM(g.opp_oreb) + SUM(g.opp_turnovers) + 0.475 * SUM(g.opp_fta), 0) as turnover_pct_opp,
          -- Rates
          SUM(g.fga3)::float / NULLIF(SUM(g.fga), 0) as three_pt_rate,
          SUM(g.fta)::float / NULLIF(SUM(g.fga), 0) as ft_rate,
          -- For efficiency calculations
          SUM(g.team_score) as total_pts,
          SUM(g.opponent_score) as total_pts_opp,
          SUM(g.fga) as total_fga,
          SUM(g.oreb) as total_oreb,
          SUM(g.turnovers) as total_to,
          SUM(g.fta) as total_fta,
          SUM(g.opp_fga) as total_opp_fga,
          SUM(g.opp_oreb) as total_opp_oreb,
          SUM(g.opp_turnovers) as total_opp_to,
          SUM(g.opp_fta) as total_opp_fta,
          -- Per-game totals
          SUM(g.ast) as total_ast,
          SUM(g.stl) as total_stl,
          SUM(g.blk) as total_blk,
          SUM(g.treb) as total_treb,
          SUM(g.oreb) as total_oreb_raw,
          SUM(g.dreb) as total_dreb,
          SUM(g.pf) as total_pf,
          SUM(g.fgm) as total_fgm,
          SUM(g.fgm3) as total_fgm3,
          SUM(g.ftm) as total_ftm,
          SUM(g.pts_paint) as total_pts_paint,
          SUM(g.pts_fastbreak) as total_pts_fastbreak,
          SUM(g.pts_turnovers) as total_pts_off_to,
          SUM(g.pts_bench) as total_pts_bench,
          -- Opponent per-game totals
          SUM(g.opp_ast) as total_opp_ast,
          SUM(g.opp_stl) as total_opp_stl,
          SUM(g.opp_blk) as total_opp_blk,
          SUM(g.opp_treb) as total_opp_treb,
          SUM(g.opp_pf) as total_opp_pf,
          SUM(g.opp_pts_paint) as total_opp_pts_paint,
          SUM(g.opp_pts_fastbreak) as total_opp_pts_fastbreak,
          SUM(g.opp_pts_turnovers) as total_opp_pts_off_to
        FROM games g
        JOIN teams t ON g.team_id = t.team_id
        WHERE t.league = $1
          AND ${gameWhereClause}
        GROUP BY g.team_id
        HAVING COUNT(*) > 0
      )`;
  }

  // Determine if we should use pre-calculated adjusted ratings
  const usePreCalculated = gameType === 'all' && seasonSegment === 'all' && seasonType === 'all';

  const query = `
    WITH ${gamesCTE}
    SELECT 
      t.team_id,
      t.name,
      t.conference,
      t.logo_url,
      t.primary_color,
      gs.games_played::int,
      gs.wins::int,
      gs.losses::int,
      ROUND(CASE WHEN gs.games_played > 0 THEN gs.wins::float / gs.games_played ELSE 0 END::numeric, 3) as win_pct,
      gs.wins::int as naia_wins,
      gs.losses::int as naia_losses,
      ROUND(CASE WHEN gs.games_played > 0 THEN gs.wins::float / gs.games_played ELSE 0 END::numeric, 3) as naia_win_pct,
      ROUND(gs.points_per_game::numeric, 1) as points_per_game,
      ROUND(gs.points_allowed_per_game::numeric, 1) as points_allowed_per_game,
      -- Calculate offensive rating (points per 100 possessions)
      ROUND(CASE WHEN (gs.total_fga - gs.total_oreb + gs.total_to + 0.475 * gs.total_fta) > 0
        THEN gs.total_pts * 100.0 / (gs.total_fga - gs.total_oreb + gs.total_to + 0.475 * gs.total_fta)
        ELSE 0 END::numeric, 1) as offensive_rating,
      -- Calculate defensive rating
      ROUND(CASE WHEN (gs.total_opp_fga - gs.total_opp_oreb + gs.total_opp_to + 0.475 * gs.total_opp_fta) > 0
        THEN gs.total_pts_opp * 100.0 / (gs.total_opp_fga - gs.total_opp_oreb + gs.total_opp_to + 0.475 * gs.total_opp_fta)
        ELSE 0 END::numeric, 1) as defensive_rating,
      -- Net rating
      ROUND(CASE WHEN (gs.total_fga - gs.total_oreb + gs.total_to + 0.475 * gs.total_fta) > 0
        THEN (gs.total_pts * 100.0 / (gs.total_fga - gs.total_oreb + gs.total_to + 0.475 * gs.total_fta)) -
             COALESCE((gs.total_pts_opp * 100.0 / NULLIF(gs.total_opp_fga - gs.total_opp_oreb + gs.total_opp_to + 0.475 * gs.total_opp_fta, 0)), 0)
        ELSE 0 END::numeric, 1) as net_rating,
      -- Adjusted ratings: use pre-calculated for 'all' games + 'all' segment, raw for filtered
      ROUND(CASE 
        WHEN ${usePreCalculated} THEN COALESCE(tr.adjusted_offensive_rating, 
          CASE WHEN (gs.total_fga - gs.total_oreb + gs.total_to + 0.475 * gs.total_fta) > 0
            THEN gs.total_pts * 100.0 / (gs.total_fga - gs.total_oreb + gs.total_to + 0.475 * gs.total_fta)
            ELSE 0 END)
        ELSE CASE WHEN (gs.total_fga - gs.total_oreb + gs.total_to + 0.475 * gs.total_fta) > 0
          THEN gs.total_pts * 100.0 / (gs.total_fga - gs.total_oreb + gs.total_to + 0.475 * gs.total_fta)
          ELSE 0 END
      END::numeric, 1) as adjusted_offensive_rating,
      ROUND(CASE 
        WHEN ${usePreCalculated} THEN COALESCE(tr.adjusted_defensive_rating,
          CASE WHEN (gs.total_opp_fga - gs.total_opp_oreb + gs.total_opp_to + 0.475 * gs.total_opp_fta) > 0
            THEN gs.total_pts_opp * 100.0 / (gs.total_opp_fga - gs.total_opp_oreb + gs.total_opp_to + 0.475 * gs.total_opp_fta)
            ELSE 0 END)
        ELSE CASE WHEN (gs.total_opp_fga - gs.total_opp_oreb + gs.total_opp_to + 0.475 * gs.total_opp_fta) > 0
          THEN gs.total_pts_opp * 100.0 / (gs.total_opp_fga - gs.total_opp_oreb + gs.total_opp_to + 0.475 * gs.total_opp_fta)
          ELSE 0 END
      END::numeric, 1) as adjusted_defensive_rating,
      ROUND(CASE 
        WHEN ${usePreCalculated} THEN COALESCE(tr.adjusted_net_rating,
          CASE WHEN (gs.total_fga - gs.total_oreb + gs.total_to + 0.475 * gs.total_fta) > 0
            THEN (gs.total_pts * 100.0 / (gs.total_fga - gs.total_oreb + gs.total_to + 0.475 * gs.total_fta)) -
                 COALESCE((gs.total_pts_opp * 100.0 / NULLIF(gs.total_opp_fga - gs.total_opp_oreb + gs.total_opp_to + 0.475 * gs.total_opp_fta, 0)), 0)
            ELSE 0 END)
        ELSE CASE WHEN (gs.total_fga - gs.total_oreb + gs.total_to + 0.475 * gs.total_fta) > 0
          THEN (gs.total_pts * 100.0 / (gs.total_fga - gs.total_oreb + gs.total_to + 0.475 * gs.total_fta)) -
               COALESCE((gs.total_pts_opp * 100.0 / NULLIF(gs.total_opp_fga - gs.total_opp_oreb + gs.total_opp_to + 0.475 * gs.total_opp_fta, 0)), 0)
          ELSE 0 END
      END::numeric, 1) as adjusted_net_rating,
      -- SOS/RPI only meaningful for all games + all segment
      CASE WHEN ${usePreCalculated} THEN tr.strength_of_schedule ELSE NULL END as strength_of_schedule,
      CASE WHEN ${usePreCalculated} THEN tr.rpi ELSE NULL END as rpi,
      CASE WHEN ${usePreCalculated} THEN tr.nsos ELSE NULL END as nsos,
      CASE WHEN ${usePreCalculated} THEN tr.osos ELSE NULL END as osos,
      CASE WHEN ${usePreCalculated} THEN tr.dsos ELSE NULL END as dsos,
      CASE WHEN ${usePreCalculated} THEN tr.opponent_win_pct ELSE NULL END as opponent_win_pct,
      CASE WHEN ${usePreCalculated} THEN tr.opponent_opponent_win_pct ELSE NULL END as opponent_opponent_win_pct,
      -- Shooting stats
      ROUND(gs.fg_pct::numeric, 3) as fg_pct,
      ROUND(gs.fg3_pct::numeric, 3) as fg3_pct,
      ROUND(gs.ft_pct::numeric, 3) as ft_pct,
      ROUND(gs.efg_pct::numeric, 3) as efg_pct,
      ROUND(gs.fg_pct_opp::numeric, 3) as fg_pct_opp,
      ROUND(gs.fg3_pct_opp::numeric, 3) as fg3_pct_opp,
      ROUND(gs.efg_pct_opp::numeric, 3) as efg_pct_opp,
      -- Rates
      ROUND(gs.three_pt_rate::numeric, 3) as three_pt_rate,
      ROUND(gs.ft_rate::numeric, 3) as ft_rate,
      -- Turnovers
      ROUND(gs.turnover_pct::numeric, 3) as turnover_pct,
      ROUND(gs.turnover_pct_opp::numeric, 3) as turnover_pct_opp,
      -- Pace (possessions per game)
      ROUND(CASE WHEN gs.games_played > 0
        THEN (gs.total_fga - gs.total_oreb + gs.total_to + 0.475 * gs.total_fta)::float / gs.games_played
        ELSE 0 END::numeric, 1) as pace,
      -- Rebounding
      ROUND(gs.oreb_pct::numeric, 3) as oreb_pct,
      ROUND(gs.dreb_pct::numeric, 3) as dreb_pct,
      ROUND(gs.oreb_pct_opp::numeric, 3) as oreb_pct_opp,
      ROUND(gs.dreb_pct_opp::numeric, 3) as dreb_pct_opp,
      -- Per-game stats (Offense)
      ROUND((gs.total_ast::float / gs.games_played)::numeric, 1) as ast_per_game,
      ROUND((gs.total_to::float / gs.games_played)::numeric, 1) as to_per_game,
      ROUND((gs.total_treb::float / gs.games_played)::numeric, 1) as reb_per_game,
      ROUND((gs.total_oreb_raw::float / gs.games_played)::numeric, 1) as oreb_per_game,
      ROUND((gs.total_dreb::float / gs.games_played)::numeric, 1) as dreb_per_game,
      ROUND((gs.total_fgm::float / gs.games_played)::numeric, 1) as fgm_per_game,
      ROUND((gs.total_fgm3::float / gs.games_played)::numeric, 1) as fgm3_per_game,
      ROUND((gs.total_ftm::float / gs.games_played)::numeric, 1) as ftm_per_game,
      ROUND((gs.total_pf::float / gs.games_played)::numeric, 1) as pf_per_game,
      ROUND((gs.total_pts_paint::float / NULLIF(gs.games_played, 0))::numeric, 1) as pts_paint_per_game,
      ROUND((gs.total_pts_fastbreak::float / NULLIF(gs.games_played, 0))::numeric, 1) as pts_fastbreak_per_game,
      ROUND((gs.total_pts_off_to::float / NULLIF(gs.games_played, 0))::numeric, 1) as pts_off_to_per_game,
      ROUND((gs.total_pts_bench::float / NULLIF(gs.games_played, 0))::numeric, 1) as pts_bench_per_game,
      -- Per-game stats (Defense)
      ROUND((gs.total_stl::float / gs.games_played)::numeric, 1) as stl_per_game,
      ROUND((gs.total_blk::float / gs.games_played)::numeric, 1) as blk_per_game,
      ROUND((gs.total_opp_ast::float / gs.games_played)::numeric, 1) as opp_ast_per_game,
      ROUND((gs.total_opp_treb::float / gs.games_played)::numeric, 1) as opp_reb_per_game,
      ROUND((gs.total_opp_pts_paint::float / NULLIF(gs.games_played, 0))::numeric, 1) as opp_pts_paint_per_game,
      ROUND((gs.total_opp_pts_fastbreak::float / NULLIF(gs.games_played, 0))::numeric, 1) as opp_pts_fastbreak_per_game,
      ROUND((gs.total_opp_pts_off_to::float / NULLIF(gs.games_played, 0))::numeric, 1) as opp_pts_off_to_per_game
    FROM teams t
    JOIN game_stats gs ON t.team_id = gs.team_id
    LEFT JOIN team_ratings tr ON t.team_id = tr.team_id
      AND tr.season = t.season
      AND tr.date_calculated = (SELECT MAX(date_calculated) FROM team_ratings WHERE season = t.season)
    WHERE t.league = $1
    AND t.season = '${season.replace(/'/g, "''")}'
    AND t.is_excluded = FALSE
    ${conferenceClause}
    ORDER BY adjusted_net_rating DESC NULLS LAST
  `;

  return await pool.query(query, params);
}

// Get team stats with filters - always calculate dynamically from games
app.get('/api/teams', async (req, res) => {
  try {
    const {
      league = 'mens',
      conference,
      gameType = 'all',
      seasonType = 'all',
      seasonSegment = 'all',
      season = DEFAULT_SEASON,
    } = req.query;

    const result = await calculateDynamicStats(pool, { league, conference, gameType, seasonType, seasonSegment, season });
    let teams = result.rows;

    // Get total record (all games including non-NAIA, but only completed and non-exhibition)
    // Exclude national tournament games since this matches bracketcast behavior
    const totalRecordResult = await pool.query(`
      SELECT
        g.team_id,
        SUM(CASE WHEN g.team_score > g.opponent_score THEN 1 ELSE 0 END) as total_wins,
        SUM(CASE WHEN g.team_score < g.opponent_score THEN 1 ELSE 0 END) as total_losses
      FROM games g
      JOIN teams t ON g.team_id = t.team_id
      WHERE t.league = $1
        AND g.season = $2
        AND g.is_completed = TRUE
        AND g.is_exhibition = FALSE
        AND g.is_national_tournament = FALSE
      GROUP BY g.team_id
    `, [league, season]);

    const totalRecords = {};
    totalRecordResult.rows.forEach(row => {
      totalRecords[row.team_id] = {
        total_wins: parseInt(row.total_wins) || 0,
        total_losses: parseInt(row.total_losses) || 0,
      };
    });

    // Add total record to teams
    teams = teams.map(team => {
      const tr = totalRecords[team.team_id] || { total_wins: 0, total_losses: 0 };
      return {
        ...team,
        total_wins: tr.total_wins,
        total_losses: tr.total_losses,
      };
    });

    // Add QWI and Power Index when viewing full-season unfiltered data
    const usePreCalculated = gameType === 'all' && seasonSegment === 'all' && seasonType === 'all';
    if (usePreCalculated) {
      try {
        // Get RPI rankings for quadrant assignment
        const rpiResult = await pool.query(`
          SELECT t.team_id, tr.rpi
          FROM teams t
          LEFT JOIN team_ratings tr ON t.team_id = tr.team_id
            AND tr.season = t.season
            AND tr.date_calculated = (SELECT MAX(date_calculated) FROM team_ratings WHERE season = $2)
          WHERE t.league = $1
            AND t.season = $2
            AND t.is_excluded = FALSE
          ORDER BY tr.rpi DESC NULLS LAST
        `, [league, season]);

        const rpiRanks = {};
        rpiResult.rows.forEach((row, idx) => {
          rpiRanks[row.team_id] = row.rpi ? idx + 1 : null;
        });

        // Get all completed NAIA games for quadrant calculation
        const gamesResult = await pool.query(`
          SELECT g.team_id, g.opponent_id, g.location, g.team_score, g.opponent_score
          FROM games g
          JOIN teams t ON g.team_id = t.team_id
          WHERE t.league = $1
            AND g.season = $2
            AND g.is_naia_game = TRUE
            AND g.is_completed = TRUE
        `, [league, season]);

        // Tally quadrant records per team
        const quadrantRecords = {};
        teams.forEach(t => {
          quadrantRecords[t.team_id] = {
            q1_wins: 0, q1_losses: 0,
            q2_wins: 0, q2_losses: 0,
            q3_wins: 0, q3_losses: 0,
            q4_wins: 0, q4_losses: 0,
          };
        });

        gamesResult.rows.forEach(game => {
          if (!quadrantRecords[game.team_id]) return;
          const oppRpiRank = rpiRanks[game.opponent_id];
          const quadrant = getQuadrant(oppRpiRank, game.location);
          const isWin = game.team_score > game.opponent_score;
          const qKey = `q${quadrant}_${isWin ? 'wins' : 'losses'}`;
          quadrantRecords[game.team_id][qKey]++;
        });

        // Compute QWI and Power Index for each team
        teams = teams.map(team => {
          const qr = quadrantRecords[team.team_id];
          const rpiRank = rpiRanks[team.team_id] || null;
          if (!qr) return { ...team, qwi: null, power_index: null, rpi_rank: rpiRank };

          const qwi = (qr.q1_wins * 1.0) - (qr.q1_losses * 0.25)
                    + (qr.q2_wins * 0.6) - (qr.q2_losses * 0.5)
                    + (qr.q3_wins * 0.3) - (qr.q3_losses * 0.75)
                    + (qr.q4_wins * 0.1) - (qr.q4_losses * 1.0);

          const adjO = parseFloat(team.adjusted_offensive_rating);
          const adjD = parseFloat(team.adjusted_defensive_rating);
          const sos = parseFloat(team.strength_of_schedule);
          const winPct = parseFloat(team.naia_win_pct);

          let power_index = null;
          if (!isNaN(adjO) && !isNaN(adjD) && !isNaN(sos) && !isNaN(winPct)) {
            power_index = (0.35 * adjO)
                        + (0.35 * (200 - adjD))
                        + (0.15 * sos * 100)
                        + (0.075 * winPct * 100)
                        + (0.075 * qwi);
            power_index = Math.round(power_index * 100) / 100;
          }

          return {
            ...team,
            qwi: Math.round(qwi * 100) / 100,
            power_index,
            rpi_rank: rpiRank,
          };
        });
      } catch (qErr) {
        console.error('Error computing QWI/Power Index:', qErr);
        // Fall through with teams as-is (no QWI/PI)
      }
    }

    // Add conference champion flag
    try {
      const conferenceChampions = await getConferenceChampions(pool, league, season);
      teams = teams.map(team => ({
        ...team,
        is_conference_champion: conferenceChampions.has(team.team_id),
      }));
    } catch (champErr) {
      console.error('Error getting conference champions:', champErr);
      // Continue without champion flags
    }

    // Add conference records
    try {
      const confGamesResult = await pool.query(`
        SELECT g.team_id,
               SUM(CASE WHEN g.team_score > g.opponent_score THEN 1 ELSE 0 END) as conf_wins,
               SUM(CASE WHEN g.team_score < g.opponent_score THEN 1 ELSE 0 END) as conf_losses
        FROM games g
        JOIN teams t ON g.team_id = t.team_id
        WHERE t.league = $1
          AND g.season = $2
          AND g.is_conference = TRUE
          AND g.is_completed = TRUE
        GROUP BY g.team_id
      `, [league, season]);

      const confRecords = {};
      confGamesResult.rows.forEach(row => {
        confRecords[row.team_id] = {
          conf_wins: parseInt(row.conf_wins) || 0,
          conf_losses: parseInt(row.conf_losses) || 0,
        };
      });

      teams = teams.map(team => ({
        ...team,
        conf_wins: confRecords[team.team_id]?.conf_wins || 0,
        conf_losses: confRecords[team.team_id]?.conf_losses || 0,
      }));
    } catch (confErr) {
      console.error('Error getting conference records:', confErr);
      // Continue without conference records
    }

    res.json(teams);
  } catch (err) {
    console.error('Error fetching teams:', err);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

// Get available months that have games
app.get('/api/months', async (req, res) => {
  try {
    const { league = 'mens', season = DEFAULT_SEASON } = req.query;

    const result = await pool.query(`
      SELECT DISTINCT
        EXTRACT(MONTH FROM g.game_date)::int as month,
        EXTRACT(YEAR FROM g.game_date)::int as year
      FROM games g
      JOIN teams t ON g.team_id = t.team_id
      WHERE t.league = $1
        AND g.season = $2
        AND g.is_naia_game = true
      ORDER BY year, month
    `, [league, season]);

    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 
                        'July', 'August', 'September', 'October', 'November', 'December'];
    
    const months = result.rows.map(r => ({
      value: `${r.year}-${String(r.month).padStart(2, '0')}`,
      label: `${monthNames[r.month]} ${r.year}`
    }));

    res.json(months);
  } catch (err) {
    console.error('Error fetching months:', err);
    res.status(500).json({ error: 'Failed to fetch months' });
  }
});

// Get available seasons
app.get('/api/seasons', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT DISTINCT season FROM teams ORDER BY season DESC'
    );
    res.json(result.rows.map(r => r.season));
  } catch (err) {
    console.error('Error fetching seasons:', err);
    res.status(500).json({ error: 'Failed to fetch seasons' });
  }
});

// Get list of conferences
app.get('/api/conferences', async (req, res) => {
  try {
    const { league = 'mens', season = DEFAULT_SEASON } = req.query;

    const result = await pool.query(
      'SELECT DISTINCT conference FROM teams WHERE league = $1 AND season = $2 AND conference IS NOT NULL AND is_excluded = FALSE ORDER BY conference',
      [league, season]
    );

    res.json(result.rows.map(r => r.conference));
  } catch (err) {
    console.error('Error fetching conferences:', err);
    res.status(500).json({ error: 'Failed to fetch conferences' });
  }
});

// Get single team details
app.get('/api/teams/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { season = DEFAULT_SEASON } = req.query;

    const teamResult = await pool.query(
      'SELECT * FROM teams WHERE team_id = $1 AND season = $2',
      [teamId, season]
    );

    if (teamResult.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const ratingsResult = await pool.query(
      `SELECT * FROM team_ratings
       WHERE team_id = $1 AND season = $2
       ORDER BY date_calculated DESC
       LIMIT 1`,
      [teamId, season]
    );

    const gamesResult = await pool.query(
      `SELECT g.*,
              opp.name as opponent_name,
              opp.logo_url as opponent_logo
       FROM games g
       LEFT JOIN teams opp ON g.opponent_id = opp.team_id AND opp.season = $2
       WHERE g.team_id = $1 AND g.season = $2
       ORDER BY g.game_date DESC`,
      [teamId, season]
    );

    res.json({
      team: teamResult.rows[0],
      ratings: ratingsResult.rows[0] || null,
      games: gamesResult.rows
    });
  } catch (err) {
    console.error('Error fetching team:', err);
    res.status(500).json({ error: 'Failed to fetch team' });
  }
});

// Get team splits (stats broken down by different filters)
app.get('/api/teams/:teamId/splits', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { season = DEFAULT_SEASON } = req.query;

    // Helper to calculate stats for a set of games
    const calculateSplitStats = (games) => {
      if (!games || games.length === 0) return null;

      const gamesPlayed = games.length;
      const wins = games.filter(g => g.team_score > g.opponent_score).length;
      const losses = games.filter(g => g.team_score < g.opponent_score).length;

      // Sum up all stats
      const totals = games.reduce((acc, g) => {
        acc.teamScore += g.team_score || 0;
        acc.oppScore += g.opponent_score || 0;
        acc.fgm += g.fgm || 0;
        acc.fga += g.fga || 0;
        acc.fgm3 += g.fgm3 || 0;
        acc.fga3 += g.fga3 || 0;
        acc.ftm += g.ftm || 0;
        acc.fta += g.fta || 0;
        acc.oreb += g.oreb || 0;
        acc.dreb += g.dreb || 0;
        acc.treb += g.treb || 0;
        acc.ast += g.ast || 0;
        acc.stl += g.stl || 0;
        acc.blk += g.blk || 0;
        acc.to += g.turnovers || 0;
        acc.pf += g.pf || 0;
        acc.oppFgm += g.opp_fgm || 0;
        acc.oppFga += g.opp_fga || 0;
        acc.oppFgm3 += g.opp_fgm3 || 0;
        acc.oppFga3 += g.opp_fga3 || 0;
        acc.oppOreb += g.opp_oreb || 0;
        acc.oppDreb += g.opp_dreb || 0;
        acc.oppTreb += g.opp_treb || 0;
        acc.oppTo += g.opp_turnovers || 0;
        acc.ptsPaint += g.pts_paint || 0;
        acc.ptsFastbreak += g.pts_fastbreak || 0;
        acc.ptsOffTo += g.pts_turnovers || 0;
        acc.ptsBench += g.pts_bench || 0;
        acc.oppPtsPaint += g.opp_pts_paint || 0;
        acc.oppPtsFastbreak += g.opp_pts_fastbreak || 0;
        acc.oppPtsOffTo += g.opp_pts_turnovers || 0;
        return acc;
      }, {
        teamScore: 0, oppScore: 0, fgm: 0, fga: 0, fgm3: 0, fga3: 0, ftm: 0, fta: 0,
        oreb: 0, dreb: 0, treb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0,
        oppFgm: 0, oppFga: 0, oppFgm3: 0, oppFga3: 0, oppOreb: 0, oppDreb: 0, oppTreb: 0, oppTo: 0,
        ptsPaint: 0, ptsFastbreak: 0, ptsOffTo: 0, ptsBench: 0,
        oppPtsPaint: 0, oppPtsFastbreak: 0, oppPtsOffTo: 0
      });

      // Calculate possessions
      const poss = totals.fga - totals.oreb + totals.to + 0.44 * totals.fta;
      const oppPoss = totals.oppFga - totals.oppOreb + totals.oppTo + 0.44 * (games.reduce((a,g) => a + (g.opp_fta||0), 0));

      return {
        games_played: gamesPlayed,
        wins,
        losses,
        win_pct: (wins / gamesPlayed).toFixed(3),
        points_per_game: (totals.teamScore / gamesPlayed).toFixed(1),
        points_allowed_per_game: (totals.oppScore / gamesPlayed).toFixed(1),
        offensive_rating: poss > 0 ? ((totals.teamScore / poss) * 100).toFixed(1) : null,
        defensive_rating: oppPoss > 0 ? ((totals.oppScore / oppPoss) * 100).toFixed(1) : null,
        net_rating: poss > 0 && oppPoss > 0 ? (((totals.teamScore / poss) - (totals.oppScore / oppPoss)) * 100).toFixed(1) : null,
        fg_pct: totals.fga > 0 ? (totals.fgm / totals.fga).toFixed(3) : null,
        fg3_pct: totals.fga3 > 0 ? (totals.fgm3 / totals.fga3).toFixed(3) : null,
        ft_pct: totals.fta > 0 ? (totals.ftm / totals.fta).toFixed(3) : null,
        efg_pct: totals.fga > 0 ? ((totals.fgm + 0.5 * totals.fgm3) / totals.fga).toFixed(3) : null,
        fg_pct_opp: totals.oppFga > 0 ? (totals.oppFgm / totals.oppFga).toFixed(3) : null,
        fg3_pct_opp: totals.oppFga3 > 0 ? (totals.oppFgm3 / totals.oppFga3).toFixed(3) : null,
        efg_pct_opp: totals.oppFga > 0 ? ((totals.oppFgm + 0.5 * totals.oppFgm3) / totals.oppFga).toFixed(3) : null,
        three_pt_rate: totals.fga > 0 ? (totals.fga3 / totals.fga).toFixed(3) : null,
        ft_rate: totals.fga > 0 ? (totals.fta / totals.fga).toFixed(3) : null,
        oreb_pct: (totals.oreb + totals.oppDreb) > 0 ? (totals.oreb / (totals.oreb + totals.oppDreb)).toFixed(3) : null,
        dreb_pct: (totals.dreb + totals.oppOreb) > 0 ? (totals.dreb / (totals.dreb + totals.oppOreb)).toFixed(3) : null,
        oreb_pct_opp: (totals.oppOreb + totals.dreb) > 0 ? (totals.oppOreb / (totals.oppOreb + totals.dreb)).toFixed(3) : null,
        turnover_pct: poss > 0 ? (totals.to / poss).toFixed(3) : null,
        turnover_pct_opp: oppPoss > 0 ? (totals.oppTo / oppPoss).toFixed(3) : null,
        pace: gamesPlayed > 0 ? (poss / gamesPlayed).toFixed(1) : null,
        ast_per_game: (totals.ast / gamesPlayed).toFixed(1),
        to_per_game: (totals.to / gamesPlayed).toFixed(1),
        reb_per_game: (totals.treb / gamesPlayed).toFixed(1),
        oreb_per_game: (totals.oreb / gamesPlayed).toFixed(1),
        dreb_per_game: (totals.dreb / gamesPlayed).toFixed(1),
        stl_per_game: (totals.stl / gamesPlayed).toFixed(1),
        blk_per_game: (totals.blk / gamesPlayed).toFixed(1),
        pf_per_game: (totals.pf / gamesPlayed).toFixed(1),
        pts_paint_per_game: (totals.ptsPaint / gamesPlayed).toFixed(1),
        pts_fastbreak_per_game: (totals.ptsFastbreak / gamesPlayed).toFixed(1),
        pts_off_to_per_game: (totals.ptsOffTo / gamesPlayed).toFixed(1),
        pts_bench_per_game: (totals.ptsBench / gamesPlayed).toFixed(1),
        opp_pts_paint_per_game: (totals.oppPtsPaint / gamesPlayed).toFixed(1),
        opp_pts_fastbreak_per_game: (totals.oppPtsFastbreak / gamesPlayed).toFixed(1),
        opp_pts_off_to_per_game: (totals.oppPtsOffTo / gamesPlayed).toFixed(1),
      };
    };

    // Get all completed games for this team (exclude future games)
    const gamesResult = await pool.query(
      `SELECT g.*
       FROM games g
       WHERE g.team_id = $1 AND g.season = $2 AND g.is_naia_game = true AND g.is_completed = true
       ORDER BY g.game_date DESC`,
      [teamId, season]
    );

    const allGames = gamesResult.rows;
    if (allGames.length === 0) {
      return res.json({ splits: [] });
    }

    // Get team info for conference record
    const teamResult = await pool.query('SELECT conference FROM teams WHERE team_id = $1 AND season = $2', [teamId, season]);
    const teamConference = teamResult.rows[0]?.conference;

    // Calculate different splits
    const splits = [];

    // Overall
    const overallStats = calculateSplitStats(allGames);
    if (overallStats) splits.push({ split_name: 'Overall', ...overallStats });

    // Conference games
    const confGames = allGames.filter(g => g.is_conference);
    const confStats = calculateSplitStats(confGames);
    if (confStats) splits.push({ split_name: 'Conference', ...confStats });

    // Last 5 games
    const last5 = allGames.slice(0, 5);
    const last5Stats = calculateSplitStats(last5);
    if (last5Stats) splits.push({ split_name: 'Last 5', ...last5Stats });

    // Last 10 games
    const last10 = allGames.slice(0, 10);
    const last10Stats = calculateSplitStats(last10);
    if (last10Stats) splits.push({ split_name: 'Last 10', ...last10Stats });

    // Home games
    const homeGames = allGames.filter(g => g.location === 'home');
    const homeStats = calculateSplitStats(homeGames);
    if (homeStats) splits.push({ split_name: 'Home', ...homeStats });

    // Away games
    const awayGames = allGames.filter(g => g.location === 'away');
    const awayStats = calculateSplitStats(awayGames);
    if (awayStats) splits.push({ split_name: 'Away', ...awayStats });

    // In Wins
    const winGames = allGames.filter(g => g.team_score > g.opponent_score);
    const winStats = calculateSplitStats(winGames);
    if (winStats) splits.push({ split_name: 'In Wins', ...winStats });

    // In Losses
    const lossGames = allGames.filter(g => g.team_score < g.opponent_score);
    const lossStats = calculateSplitStats(lossGames);
    if (lossStats) splits.push({ split_name: 'In Losses', ...lossStats });

    res.json({ splits });
  } catch (err) {
    console.error('Error fetching team splits:', err);
    res.status(500).json({ error: 'Failed to fetch team splits' });
  }
});

// Get team percentile ranks (national and conference)
app.get('/api/teams/:teamId/percentiles', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { season = DEFAULT_SEASON } = req.query;

    // Get the team's conference
    const teamResult = await pool.query(
      'SELECT conference, league FROM teams WHERE team_id = $1 AND season = $2',
      [teamId, season]
    );

    if (teamResult.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const { conference, league } = teamResult.rows[0];

    // Get all teams' stats for percentile calculation
    const result = await calculateDynamicStats(pool, {
      league,
      gameType: 'all',
      seasonType: 'all',
      seasonSegment: 'all',
      season,
    });

    const allTeams = result.rows;
    const conferenceTeams = allTeams.filter(t => t.conference === conference);
    const targetTeam = allTeams.find(t => t.team_id === teamId);

    if (!targetTeam) {
      return res.status(404).json({ error: 'Team stats not found' });
    }

    // Stats where HIGHER is better
    const higherIsBetter = [
      'offensive_rating', 'adjusted_offensive_rating', 'efg_pct', 'fg_pct', 'fg3_pct', 'ft_pct',
      'three_pt_rate', 'ft_rate', 'oreb_pct', 'dreb_pct', 'ast_per_game', 'stl_per_game',
      'blk_per_game', 'reb_per_game', 'oreb_per_game', 'dreb_per_game', 'points_per_game',
      'net_rating', 'adjusted_net_rating', 'win_pct', 'naia_win_pct',
      'pts_paint_per_game', 'pts_fastbreak_per_game', 'pts_off_to_per_game', 'pts_bench_per_game',
      'turnover_pct_opp', // forcing opponent turnovers is good
      'pace', // higher pace is generally neutral, but keep consistent
    ];

    // Stats where LOWER is better
    const lowerIsBetter = [
      'defensive_rating', 'adjusted_defensive_rating', 'points_allowed_per_game',
      'turnover_pct', 'to_per_game',
      'efg_pct_opp', 'fg_pct_opp', 'fg3_pct_opp', // lower opponent shooting is better
      'oreb_pct_opp', // lower opponent offensive rebounding is better
      'opp_pts_paint_per_game', // lower opponent paint points is better
    ];

    // Calculate percentile for a stat
    const calculatePercentile = (teamValue, allValues, higherBetter) => {
      if (teamValue === null || teamValue === undefined) return null;
      const validValues = allValues.filter(v => v !== null && v !== undefined && !isNaN(v));
      if (validValues.length === 0) return null;

      const val = parseFloat(teamValue);
      let countBelow;
      if (higherBetter) {
        countBelow = validValues.filter(v => parseFloat(v) < val).length;
      } else {
        countBelow = validValues.filter(v => parseFloat(v) > val).length;
      }
      return Math.round((countBelow / validValues.length) * 100);
    };

    // Build percentile data for all relevant stats
    const statKeys = [...higherIsBetter, ...lowerIsBetter];
    const nationalPercentiles = {};
    const conferencePercentiles = {};

    statKeys.forEach(key => {
      const higherBetter = higherIsBetter.includes(key);
      const nationalValues = allTeams.map(t => t[key]);
      const confValues = conferenceTeams.map(t => t[key]);

      nationalPercentiles[key] = calculatePercentile(targetTeam[key], nationalValues, higherBetter);
      conferencePercentiles[key] = calculatePercentile(targetTeam[key], confValues, higherBetter);
    });

    res.json({
      team_id: teamId,
      conference,
      national_count: allTeams.length,
      conference_count: conferenceTeams.length,
      national: nationalPercentiles,
      conference: conferencePercentiles,
    });
  } catch (err) {
    console.error('Error fetching team percentiles:', err);
    res.status(500).json({ error: 'Failed to fetch team percentiles' });
  }
});

// Get team schedule (all games - completed and future)
app.get('/api/teams/:teamId/schedule', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { season = DEFAULT_SEASON } = req.query;

    // First get the league for this team to find correct RPI rankings
    const teamInfo = await pool.query(
      `SELECT league FROM teams WHERE team_id = $1 AND season = $2`, [teamId, season]
    );
    const teamLeague = teamInfo.rows[0]?.league || 'mens';

    // Get RPI rankings for all teams in this league (use latest date_calculated)
    const rpiResult = await pool.query(
      `SELECT t.team_id, tr.rpi
       FROM teams t
       JOIN team_ratings tr ON t.team_id = tr.team_id 
         AND tr.season = $2
         AND tr.date_calculated = (SELECT MAX(date_calculated) FROM team_ratings WHERE season = $2)
       WHERE t.league = $1 AND t.season = $2 AND tr.rpi IS NOT NULL
       ORDER BY tr.rpi DESC`,
      [teamLeague, season]
    );
    const rpiRanks = {};
    rpiResult.rows.forEach((r, i) => { rpiRanks[r.team_id] = i + 1; });

    // Get team ratings for predictions (adjusted offensive/defensive ratings)
    const ratingsResult = await pool.query(
      `SELECT t.team_id, 
              tr.adjusted_offensive_rating,
              tr.adjusted_defensive_rating,
              tr.pace
       FROM teams t
       JOIN team_ratings tr ON t.team_id = tr.team_id 
         AND tr.season = $2
         AND tr.date_calculated = (SELECT MAX(date_calculated) FROM team_ratings WHERE season = $2)
       WHERE t.league = $1 AND t.season = $2`,
      [teamLeague, season]
    );
    const teamRatings = {};
    ratingsResult.rows.forEach(r => {
      teamRatings[r.team_id] = {
        adjO: parseFloat(r.adjusted_offensive_rating) || 100,
        adjD: parseFloat(r.adjusted_defensive_rating) || 100,
        pace: parseFloat(r.pace) || 70
      };
    });

    // Calculate league average pace for predictions
    const leagueAvgPace = ratingsResult.rows.length > 0
      ? ratingsResult.rows.reduce((sum, r) => sum + (parseFloat(r.pace) || 70), 0) / ratingsResult.rows.length
      : 70;

    const gamesResult = await pool.query(
      `SELECT
        g.game_id,
        g.game_date,
        g.location,
        g.opponent_name,
        g.opponent_id,
        g.team_score,
        g.opponent_score,
        g.is_conference,
        g.is_naia_game,
        g.is_exhibition,
        g.is_postseason,
        g.is_national_tournament,
        g.is_completed,
        g.fga, g.oreb, g.turnovers, g.fta,
        g.opp_fga, g.opp_oreb, g.opp_turnovers, g.opp_fta,
        t.name as opponent_team_name,
        t.logo_url as opponent_logo_url
       FROM games g
       LEFT JOIN teams t ON g.opponent_id = t.team_id AND t.season = $2
       WHERE g.team_id = $1 AND g.season = $2
       ORDER BY g.game_date ASC`,
      [teamId, season]
    );

    const games = gamesResult.rows.map(g => {
      // Determine game type for display
      // Priority: Exhibition > National Tournament > Conference Tournament > Non-NAIA > Conference > Non-Conference
      let gameType = 'NAIA';
      if (g.is_exhibition) {
        gameType = 'Exhibition';
      } else if (g.is_national_tournament) {
        gameType = 'National Tournament';
      } else if (g.is_postseason) {
        gameType = 'Conference Tournament';
      } else if (!g.is_naia_game) {
        gameType = 'Non-NAIA';
      } else if (g.is_conference) {
        gameType = 'Conference';
      } else {
        gameType = 'Non-Conference';
      }

      // Calculate per-game net rating for completed games
      let netRating = null;
      if (g.is_completed && g.fga && g.opp_fga) {
        const poss = g.fga - g.oreb + g.turnovers + 0.475 * g.fta;
        const oppPoss = g.opp_fga - g.opp_oreb + g.opp_turnovers + 0.475 * g.opp_fta;
        if (poss > 0 && oppPoss > 0) {
          const ortg = (g.team_score * 100.0) / poss;
          const drtg = (g.opponent_score * 100.0) / oppPoss;
          netRating = Math.round((ortg - drtg) * 10) / 10;
        }
      }

      // Determine opponent quadrant
      const oppRpiRank = g.opponent_id ? rpiRanks[g.opponent_id] || null : null;
      const quadrant = (g.is_naia_game && !g.is_exhibition && oppRpiRank)
        ? getQuadrant(oppRpiRank, g.location)
        : null;

      // Calculate predictions for future games
      let prediction = null;
      if (!g.is_completed && g.opponent_id && teamRatings[teamId] && teamRatings[g.opponent_id]) {
        const team = teamRatings[teamId];
        const opp = teamRatings[g.opponent_id];
        
        // Home court advantage (approximately 3.5 points in college basketball)
        const homeAdv = g.location === 'home' ? 3.5 : (g.location === 'away' ? -3.5 : 0);
        
        // Expected efficiency margin per 100 possessions
        // Net rating difference: (team's net rating) - (opponent's net rating)
        const teamNet = team.adjO - team.adjD;
        const oppNet = opp.adjO - opp.adjD;
        const expectedMarginPer100 = teamNet - oppNet;
        
        // Estimate game pace (average of both teams' pace)
        const expectedPace = (team.pace + opp.pace) / 2;
        
        // Scale margin from per-100-possessions to actual game
        // A typical game has ~70 possessions, so multiply by pace/100
        const paceFactor = expectedPace / 100;
        const predictedMargin = Math.round((expectedMarginPer100 * paceFactor + homeAdv) * 10) / 10;
        
        // Calculate win probability using logistic function
        // Standard deviation of game outcomes is roughly 11 points
        const winProb = Math.round(100 / (1 + Math.exp(-predictedMargin / 5)));
        
        // Calculate predicted scores
        // Average league scoring is roughly 75 points per game
        const avgScore = 75;
        const teamPredScore = Math.round(avgScore + predictedMargin / 2);
        const oppPredScore = Math.round(avgScore - predictedMargin / 2);
        
        prediction = {
          margin: predictedMargin,
          win_probability: winProb,
          team_score: teamPredScore,
          opponent_score: oppPredScore,
          predicted_result: predictedMargin > 0 ? 'W' : 'L'
        };
      }

      return {
        game_id: g.game_id,
        date: g.game_date,
        location: g.location,
        opponent_name: g.opponent_team_name || g.opponent_name,
        opponent_id: g.opponent_id,
        opponent_logo_url: g.opponent_logo_url,
        team_score: g.team_score,
        opponent_score: g.opponent_score,
        is_conference: g.is_conference,
        is_naia_game: g.is_naia_game,
        is_exhibition: g.is_exhibition,
        is_completed: g.is_completed,
        game_type: gameType,
        result: g.is_completed ? (g.team_score > g.opponent_score ? 'W' : 'L') : null,
        quadrant,
        opponent_rpi_rank: oppRpiRank,
        prediction
      };
    });

    // Deduplicate games - keep only one game per date + opponent combination
    // Some scraping may create duplicate entries
    const seenGames = new Set();
    const deduplicatedGames = games.filter(game => {
      const dateStr = new Date(game.date).toISOString().split('T')[0];
      const key = `${dateStr}_${game.opponent_name}`;
      if (seenGames.has(key)) {
        return false;
      }
      seenGames.add(key);
      return true;
    });

    res.json({ games: deduplicatedGames });
  } catch (err) {
    console.error('Error fetching team schedule:', err);
    res.status(500).json({ error: 'Failed to fetch team schedule' });
  }
});

// ========================================
// MATCHUP & BOX SCORE ENDPOINTS
// ========================================

// Get matchup comparison data for two teams
app.get('/api/matchup', async (req, res) => {
  try {
    const { team1, team2, season = DEFAULT_SEASON, league = 'mens' } = req.query;

    if (!team1 || !team2) {
      return res.status(400).json({ error: 'Both team1 and team2 parameters are required' });
    }

    // Get all teams' stats for percentile calculations
    const allTeamsResult = await calculateDynamicStats(pool, {
      league,
      gameType: 'all',
      seasonType: 'all',
      seasonSegment: 'all',
      season,
    });

    const allTeams = allTeamsResult.rows;
    const team1Data = allTeams.find(t => t.team_id === team1);
    const team2Data = allTeams.find(t => t.team_id === team2);

    if (!team1Data || !team2Data) {
      return res.status(404).json({ error: 'One or both teams not found' });
    }

    // Get adjusted ratings for predictions
    const ratingsResult = await pool.query(
      `SELECT t.team_id,
              tr.adjusted_offensive_rating,
              tr.adjusted_defensive_rating,
              tr.pace
       FROM teams t
       JOIN team_ratings tr ON t.team_id = tr.team_id
         AND tr.season = $2
         AND tr.date_calculated = (SELECT MAX(date_calculated) FROM team_ratings WHERE season = $2)
       WHERE t.league = $1 AND t.season = $2 AND t.team_id IN ($3, $4)`,
      [league, season, team1, team2]
    );

    const ratings = {};
    ratingsResult.rows.forEach(r => {
      ratings[r.team_id] = {
        adjO: parseFloat(r.adjusted_offensive_rating) || 100,
        adjD: parseFloat(r.adjusted_defensive_rating) || 100,
        pace: parseFloat(r.pace) || 70
      };
    });

    // Calculate neutral court prediction
    let prediction = null;
    if (ratings[team1] && ratings[team2]) {
      const t1 = ratings[team1];
      const t2 = ratings[team2];

      const teamNet = t1.adjO - t1.adjD;
      const oppNet = t2.adjO - t2.adjD;
      const expectedMarginPer100 = teamNet - oppNet;
      const expectedPace = (t1.pace + t2.pace) / 2;
      const paceFactor = expectedPace / 100;
      const predictedMargin = Math.round(expectedMarginPer100 * paceFactor * 10) / 10;
      const winProb = Math.round(100 / (1 + Math.exp(-predictedMargin / 5)));
      const avgScore = 75;
      const team1Score = Math.round(avgScore + predictedMargin / 2);
      const team2Score = Math.round(avgScore - predictedMargin / 2);

      prediction = {
        team1_score: team1Score,
        team2_score: team2Score,
        margin: predictedMargin,
        team1_win_probability: winProb,
        expected_pace: Math.round(expectedPace * 10) / 10,
        expected_total: team1Score + team2Score
      };
    }

    // Calculate percentiles for both teams
    const higherIsBetter = [
      'offensive_rating', 'adjusted_offensive_rating', 'efg_pct', 'fg_pct', 'fg3_pct', 'ft_pct',
      'three_pt_rate', 'ft_rate', 'oreb_pct', 'dreb_pct', 'ast_per_game', 'stl_per_game',
      'blk_per_game', 'reb_per_game', 'oreb_per_game', 'dreb_per_game', 'points_per_game',
      'net_rating', 'adjusted_net_rating', 'win_pct', 'naia_win_pct',
      'pts_paint_per_game', 'pts_fastbreak_per_game', 'pts_off_to_per_game', 'pts_bench_per_game',
      'turnover_pct_opp', 'pace',
    ];
    const lowerIsBetter = [
      'defensive_rating', 'adjusted_defensive_rating', 'points_allowed_per_game',
      'turnover_pct', 'to_per_game',
      'efg_pct_opp', 'fg_pct_opp', 'fg3_pct_opp',
      'oreb_pct_opp',
      'opp_pts_paint_per_game',
    ];

    const calculatePercentile = (teamValue, allValues, higherBetter) => {
      if (teamValue === null || teamValue === undefined) return null;
      const validValues = allValues.filter(v => v !== null && v !== undefined && !isNaN(v));
      if (validValues.length === 0) return null;
      const val = parseFloat(teamValue);
      const countBelow = higherBetter
        ? validValues.filter(v => parseFloat(v) < val).length
        : validValues.filter(v => parseFloat(v) > val).length;
      return Math.round((countBelow / validValues.length) * 100);
    };

    const statKeys = [...higherIsBetter, ...lowerIsBetter];
    const buildPercentiles = (targetTeam) => {
      const pctiles = {};
      statKeys.forEach(key => {
        const higherBetter = higherIsBetter.includes(key);
        const nationalValues = allTeams.map(t => t[key]);
        pctiles[key] = calculatePercentile(targetTeam[key], nationalValues, higherBetter);
      });
      return pctiles;
    };

    // Get head-to-head games
    const h2hResult = await pool.query(
      `SELECT g.game_date, g.team_id, g.opponent_id, g.team_score, g.opponent_score, g.location, g.is_completed
       FROM games g
       WHERE g.season = $1 AND g.is_completed = true
         AND ((g.team_id = $2 AND g.opponent_id = $3) OR (g.team_id = $3 AND g.opponent_id = $2))
       ORDER BY g.game_date ASC`,
      [season, team1, team2]
    );

    // Deduplicate H2H (keep from team1's perspective)
    const seenH2H = new Set();
    const headToHead = h2hResult.rows
      .filter(g => {
        const dateStr = new Date(g.game_date).toISOString().split('T')[0];
        if (seenH2H.has(dateStr)) return false;
        seenH2H.add(dateStr);
        return true;
      })
      .map(g => {
        const isTeam1Perspective = g.team_id === team1;
        return {
          date: g.game_date,
          team1_score: isTeam1Perspective ? g.team_score : g.opponent_score,
          team2_score: isTeam1Perspective ? g.opponent_score : g.team_score,
          location: isTeam1Perspective ? g.location : (g.location === 'home' ? 'away' : g.location === 'away' ? 'home' : 'neutral'),
        };
      });

    // Get top 3 players for each team
    const playersResult = await pool.query(
      `SELECT p.team_id, (p.first_name || ' ' || p.last_name) as name, p.pts_pg, p.reb_pg, p.ast_pg
       FROM players p
       WHERE p.season = $1 AND p.team_id IN ($2, $3)
       ORDER BY p.pts_pg DESC`,
      [season, team1, team2]
    );

    const team1Players = playersResult.rows.filter(p => p.team_id === team1).slice(0, 3);
    const team2Players = playersResult.rows.filter(p => p.team_id === team2).slice(0, 3);

    const buildTeamResponse = (teamData, teamRatings, percentiles, topPlayers) => ({
      team_id: teamData.team_id,
      name: teamData.name,
      conference: teamData.conference,
      logo_url: teamData.logo_url,
      record: { wins: teamData.wins, losses: teamData.losses },
      stats: teamData,
      percentiles,
      ratings: teamRatings || null,
      top_players: topPlayers.map(p => ({
        name: p.name,
        ppg: parseFloat(p.pts_pg) || 0,
        rpg: parseFloat(p.reb_pg) || 0,
        apg: parseFloat(p.ast_pg) || 0,
      })),
    });

    res.json({
      team1: buildTeamResponse(team1Data, ratings[team1], buildPercentiles(team1Data), team1Players),
      team2: buildTeamResponse(team2Data, ratings[team2], buildPercentiles(team2Data), team2Players),
      prediction,
      head_to_head: headToHead,
    });
  } catch (err) {
    console.error('Error fetching matchup data:', err);
    res.status(500).json({ error: 'Failed to fetch matchup data' });
  }
});

// Get box score for a specific game
app.get('/api/games/:gameId/boxscore', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { season = DEFAULT_SEASON } = req.query;

    const result = await pool.query(
      `SELECT
        g.game_id, g.game_date, g.location, g.is_completed,
        g.team_id, g.opponent_id, g.opponent_name,
        g.team_score, g.opponent_score,
        g.fgm, g.fga, g.fgm3, g.fga3, g.ftm, g.fta,
        g.oreb, g.dreb, g.treb, g.ast, g.stl, g.blk, g.turnovers, g.pf,
        g.pts_paint, g.pts_fastbreak, g.pts_turnovers, g.pts_bench,
        g.opp_fgm, g.opp_fga, g.opp_fgm3, g.opp_fga3, g.opp_ftm, g.opp_fta,
        g.opp_oreb, g.opp_dreb, g.opp_treb, g.opp_ast, g.opp_stl, g.opp_blk, g.opp_turnovers, g.opp_pf,
        g.opp_pts_paint, g.opp_pts_fastbreak, g.opp_pts_turnovers,
        t1.name as team_name, t1.logo_url as team_logo_url,
        t2.name as opponent_team_name, t2.logo_url as opponent_logo_url
       FROM games g
       LEFT JOIN teams t1 ON g.team_id = t1.team_id AND t1.season = $2
       LEFT JOIN teams t2 ON g.opponent_id = t2.team_id AND t2.season = $2
       WHERE g.game_id = $1 AND g.season = $2`,
      [gameId, season]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const g = result.rows[0];

    res.json({
      game_id: g.game_id,
      date: g.game_date,
      location: g.location,
      is_completed: g.is_completed,
      team: {
        team_id: g.team_id,
        name: g.team_name || g.team_id,
        logo_url: g.team_logo_url,
        score: g.team_score,
        stats: {
          fgm: g.fgm, fga: g.fga, fg_pct: g.fga > 0 ? (g.fgm / g.fga) : null,
          fgm3: g.fgm3, fga3: g.fga3, fg3_pct: g.fga3 > 0 ? (g.fgm3 / g.fga3) : null,
          ftm: g.ftm, fta: g.fta, ft_pct: g.fta > 0 ? (g.ftm / g.fta) : null,
          oreb: g.oreb, dreb: g.dreb, treb: g.treb || ((g.oreb || 0) + (g.dreb || 0)),
          ast: g.ast, stl: g.stl, blk: g.blk,
          turnovers: g.turnovers, pf: g.pf,
          pts_paint: g.pts_paint, pts_fastbreak: g.pts_fastbreak,
          pts_turnovers: g.pts_turnovers, pts_bench: g.pts_bench,
        },
      },
      opponent: {
        team_id: g.opponent_id,
        name: g.opponent_team_name || g.opponent_name || 'Opponent',
        logo_url: g.opponent_logo_url,
        score: g.opponent_score,
        stats: {
          fgm: g.opp_fgm, fga: g.opp_fga, fg_pct: g.opp_fga > 0 ? (g.opp_fgm / g.opp_fga) : null,
          fgm3: g.opp_fgm3, fga3: g.opp_fga3, fg3_pct: g.opp_fga3 > 0 ? (g.opp_fgm3 / g.opp_fga3) : null,
          ftm: g.opp_ftm, fta: g.opp_fta, ft_pct: g.opp_fta > 0 ? (g.opp_ftm / g.opp_fta) : null,
          oreb: g.opp_oreb, dreb: g.opp_dreb, treb: g.opp_treb || ((g.opp_oreb || 0) + (g.opp_dreb || 0)),
          ast: g.opp_ast, stl: g.opp_stl, blk: g.opp_blk,
          turnovers: g.opp_turnovers, pf: g.opp_pf,
          pts_paint: g.opp_pts_paint, pts_fastbreak: g.opp_pts_fastbreak,
          pts_turnovers: g.opp_pts_turnovers,
        },
      },
    });
  } catch (err) {
    console.error('Error fetching box score:', err);
    res.status(500).json({ error: 'Failed to fetch box score' });
  }
});

// ========================================
// PLAYER ENDPOINTS
// ========================================

// Get all players (with filtering and sorting)
app.get('/api/players', async (req, res) => {
  try {
    const { 
      league = 'mens', 
      season = DEFAULT_SEASON,
      conference,
      team_id,
      team,
      position,
      year,
      sort_by = 'pts_pg',
      sort_order = 'DESC',
      limit = 100,
      offset = 0,
      min_gp = 5  // Minimum games played filter
    } = req.query;

    // Build WHERE clause
    let whereConditions = ['p.league = $1', 'p.season = $2', 'p.gp >= $3', 't.is_excluded = FALSE'];
    let params = [league, season, parseInt(min_gp) || 0];
    let paramIndex = 4;

    if (conference) {
      whereConditions.push(`t.conference = $${paramIndex}`);
      params.push(conference);
      paramIndex++;
    }

    if (team_id) {
      whereConditions.push(`p.team_id = $${paramIndex}`);
      params.push(team_id);
      paramIndex++;
    }

    if (team) {
      whereConditions.push(`t.name = $${paramIndex}`);
      params.push(team);
      paramIndex++;
    }

    if (position) {
      whereConditions.push(`p.position ILIKE $${paramIndex}`);
      params.push(`%${position}%`);
      paramIndex++;
    }

    if (year) {
      whereConditions.push(`p.year ILIKE $${paramIndex}`);
      params.push(`%${year}%`);
      paramIndex++;
    }

    // Validate sort column
    const validSortColumns = [
      // Per game stats
      'pts_pg', 'reb_pg', 'ast_pg', 'stl_pg', 'blk_pg', 'min_pg', 'to_pg',
      // Percentages
      'fg_pct', 'fg3_pct', 'ft_pct',
      // Totals
      'pts', 'reb', 'ast', 'stl', 'blk', 'gp', 'turnovers', 'pf',
      'fgm', 'fga', 'fg3m', 'fg3a', 'ftm', 'fta',
      'oreb', 'dreb', 'min',
      // Calculated
      'ast_to_ratio', 'oreb_pg', 'dreb_pg',
      // Name
      'last_name', 'first_name'
    ];
    const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'pts_pg';
    const order = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Map calculated columns to their expressions
    const calculatedColumns = {
      'oreb_pg': 'ROUND(CAST(p.oreb AS DECIMAL) / NULLIF(p.gp, 0), 1)',
      'dreb_pg': 'ROUND(CAST(p.dreb AS DECIMAL) / NULLIF(p.gp, 0), 1)'
    };
    
    const orderByExpr = calculatedColumns[sortColumn] 
      ? `${calculatedColumns[sortColumn]} ${order} NULLS LAST`
      : `p.${sortColumn} ${order} NULLS LAST`;

    const query = `
      SELECT 
        p.*,
        t.name as team_name,
        t.conference,
        t.logo_url as team_logo_url,
        t.primary_color as team_primary_color,
        ROUND(CAST(p.oreb AS DECIMAL) / NULLIF(p.gp, 0), 1) as oreb_pg,
        ROUND(CAST(p.dreb AS DECIMAL) / NULLIF(p.gp, 0), 1) as dreb_pg
      FROM players p
      JOIN teams t ON p.team_id = t.team_id AND p.season = t.season
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY ${orderByExpr}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(parseInt(limit) || 100, parseInt(offset) || 0);

    const result = await pool.query(query, params);

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM players p
      JOIN teams t ON p.team_id = t.team_id AND p.season = t.season
      WHERE ${whereConditions.join(' AND ')}
    `;
    const countResult = await pool.query(countQuery, params.slice(0, -2));

    res.json({
      players: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('Error fetching players:', err);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// Check if player data exists for a given season/league
// NOTE: This route MUST come before /api/players/:playerId
app.get('/api/players/exists', async (req, res) => {
  try {
    const { season = DEFAULT_SEASON, league = 'mens' } = req.query;

    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM players
      WHERE season = $1 AND league = $2
    `, [season, league]);

    res.json({ 
      hasPlayers: parseInt(result.rows[0].count) > 0,
      count: parseInt(result.rows[0].count)
    });
  } catch (err) {
    console.error('Error checking player data:', err);
    res.status(500).json({ error: 'Failed to check player data' });
  }
});

// Get single player by ID
app.get('/api/players/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;
    const { season = DEFAULT_SEASON } = req.query;

    const result = await pool.query(`
      SELECT 
        p.*,
        t.name as team_name,
        t.conference,
        t.logo_url as team_logo_url,
        t.primary_color as team_primary_color
      FROM players p
      JOIN teams t ON p.team_id = t.team_id AND p.season = t.season
      WHERE p.player_id = $1 AND p.season = $2
    `, [playerId, season]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching player:', err);
    res.status(500).json({ error: 'Failed to fetch player' });
  }
});

// Get team roster
app.get('/api/teams/:teamId/roster', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { season = DEFAULT_SEASON } = req.query;

    const result = await pool.query(`
      SELECT 
        p.*,
        t.name as team_name,
        t.conference
      FROM players p
      JOIN teams t ON p.team_id = t.team_id AND p.season = t.season
      WHERE p.team_id = $1 AND p.season = $2
      ORDER BY p.pts_pg DESC
    `, [teamId, season]);

    res.json({ roster: result.rows });
  } catch (err) {
    console.error('Error fetching team roster:', err);
    res.status(500).json({ error: 'Failed to fetch team roster' });
  }
});

// ========================================
// END PLAYER ENDPOINTS
// ========================================

// Get conference games for a specific date
app.get('/api/conferences/:conference/games', async (req, res) => {
  try {
    const { conference } = req.params;
    const { league = 'mens', season = DEFAULT_SEASON, date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'Date parameter is required' });
    }

    // Get all teams in this conference
    const teamsResult = await pool.query(`
      SELECT team_id, name, logo_url
      FROM teams
      WHERE conference = $1 AND league = $2 AND season = $3 AND is_excluded = FALSE
    `, [decodeURIComponent(conference), league, season]);

    const teamIds = teamsResult.rows.map(t => t.team_id);
    const teamsMap = {};
    teamsResult.rows.forEach(t => {
      teamsMap[t.team_id] = { name: t.name, logo_url: t.logo_url };
    });

    if (teamIds.length === 0) {
      return res.json({ games: [] });
    }

    // Get games for these teams on the specified date
    const gamesResult = await pool.query(`
      SELECT
        g.game_id,
        g.team_id,
        g.opponent_id,
        g.opponent_name,
        g.game_date,
        g.location,
        g.team_score,
        g.opponent_score,
        g.is_completed,
        g.is_conference,
        g.is_naia_game,
        t_home.name as team_name,
        t_home.logo_url as team_logo_url,
        t_opp.name as opponent_team_name,
        t_opp.logo_url as opponent_logo_url,
        t_opp.conference as opponent_conference
      FROM games g
      JOIN teams t_home ON g.team_id = t_home.team_id AND t_home.season = $3
      LEFT JOIN teams t_opp ON g.opponent_id = t_opp.team_id AND t_opp.season = $3
      WHERE g.team_id = ANY($1)
        AND g.season = $3
        AND DATE(g.game_date) = $2::date
      ORDER BY g.game_date ASC, t_home.name ASC
    `, [teamIds, date, season]);

    // Deduplicate games (each game appears twice - once for each team)
    // Keep only one record per matchup
    const seenMatchups = new Set();
    const games = [];

    gamesResult.rows.forEach(game => {
      // Create a unique key for the matchup (sorted team IDs)
      const ids = [game.team_id, game.opponent_id].filter(Boolean).sort();
      const matchupKey = `${ids[0]}-${ids[1]}-${game.game_date}`;

      if (!seenMatchups.has(matchupKey)) {
        seenMatchups.add(matchupKey);

        // Determine if this is a conference game between two conference teams
        const isConferenceMatchup = teamIds.includes(game.opponent_id);

        games.push({
          game_id: game.game_id,
          date: game.game_date,
          home_team: game.location === 'home' ? {
            team_id: game.team_id,
            name: game.team_name,
            logo_url: game.team_logo_url,
            score: game.team_score,
          } : {
            team_id: game.opponent_id,
            name: game.opponent_team_name || game.opponent_name,
            logo_url: game.opponent_logo_url,
            score: game.opponent_score,
          },
          away_team: game.location === 'away' ? {
            team_id: game.team_id,
            name: game.team_name,
            logo_url: game.team_logo_url,
            score: game.team_score,
          } : {
            team_id: game.opponent_id,
            name: game.opponent_team_name || game.opponent_name,
            logo_url: game.opponent_logo_url,
            score: game.opponent_score,
          },
          location: game.location,
          is_completed: game.is_completed,
          is_conference_matchup: isConferenceMatchup,
          opponent_conference: game.opponent_conference,
        });
      }
    });

    res.json({ games });
  } catch (err) {
    console.error('Error fetching conference games:', err);
    res.status(500).json({ error: 'Failed to fetch conference games' });
  }
});

// Conference to Area mapping based on NAIA Selection Committee Policy
const CONFERENCE_AREAS = {
  // East
  'Appalachian Athletic Conference': 'East',
  'Mid-South Conference': 'East',
  'Southern States Athletic Conference': 'East',
  'The Sun Conference': 'East',
  // Midwest
  'American Midwest Conference': 'Midwest',
  'Great Plains Athletic Conference': 'Midwest',
  'Heart of America Athletic Conference': 'Midwest',
  'Kansas Collegiate Athletic Conference': 'Midwest',
  // North
  'Chicagoland Collegiate Athletic Conference': 'North',
  'Crossroads League': 'North',
  'River States Conference': 'North',
  'Wolverine-Hoosier Athletic Conference': 'North',
  // South
  'Continental Athletic Conference': 'South',
  'HBCU Athletic Conference': 'South',
  'Red River Athletic Conference': 'South',
  'Sooner Athletic Conference': 'South',
  // West
  'California Pacific Conference': 'West',
  'Cascade Collegiate Conference': 'West',
  'Frontier Conference': 'West',
  'Great Southwest Athletic Conference': 'West',
};

/**
 * Determine quadrant for a game based on opponent RPI rank and game location
 * Quadrant thresholds from NAIA Selection Committee Policy:
 *
 * |Location| Q1     | Q2      | Q3       | Q4    |
 * |--------|--------|---------|----------|-------|
 * | Home   | 1-45   | 46-90   | 91-135   | 136+  |
 * | Neutral| 1-55   | 56-105  | 106-150  | 150+  |
 * | Away   | 1-65   | 66-120  | 121-165  | 166+  |
 */
function getQuadrant(oppRpiRank, location) {
  if (!oppRpiRank) return 4; // Unranked opponents are Q4

  if (location === 'home') {
    if (oppRpiRank <= 45) return 1;
    if (oppRpiRank <= 90) return 2;
    if (oppRpiRank <= 135) return 3;
    return 4;
  } else if (location === 'neutral') {
    if (oppRpiRank <= 55) return 1;
    if (oppRpiRank <= 105) return 2;
    if (oppRpiRank <= 150) return 3;
    return 4;
  } else { // away
    if (oppRpiRank <= 65) return 1;
    if (oppRpiRank <= 120) return 2;
    if (oppRpiRank <= 165) return 3;
    return 4;
  }
}

// Get bracketcast data with quadrant records and seed projections
app.get('/api/bracketcast', async (req, res) => {
  try {
    const { league = 'mens', season = DEFAULT_SEASON, asOfDate: userAsOfDate } = req.query;

    // If user provides an asOfDate, use it; otherwise get the latest game date
    let asOfDate;
    if (userAsOfDate) {
      // User-provided date - use end of that day (games on that date are included)
      asOfDate = userAsOfDate;
    } else {
      // Get the latest completed game date
      const asOfResult = await pool.query(`
        SELECT MAX(game_date) as as_of_date
        FROM games g
        JOIN teams t ON g.team_id = t.team_id
        WHERE t.league = $1
          AND g.season = $2
          AND g.is_completed = TRUE
      `, [league, season]);
      asOfDate = asOfResult.rows[0].as_of_date;
    }

    // Step 1: Get all teams with their RPI and create RPI rankings
    // Note: RPI from team_ratings is pre-calculated, but records will be filtered by date
    const teamsResult = await pool.query(`
      SELECT
        t.team_id,
        t.name,
        t.conference,
        t.logo_url,
        t.city,
        t.state,
        t.latitude,
        t.longitude,
        tr.rpi,
        tr.strength_of_schedule,
        tr.naia_wins,
        tr.naia_losses,
        tr.naia_win_pct,
        tr.opponent_win_pct,
        tr.opponent_opponent_win_pct,
        tr.adjusted_net_rating as net_efficiency
      FROM teams t
      LEFT JOIN team_ratings tr ON t.team_id = tr.team_id
        AND tr.season = $2
        AND tr.date_calculated = (SELECT MAX(date_calculated) FROM team_ratings WHERE season = $2)
      WHERE t.league = $1
        AND t.season = $2
        AND t.is_excluded = FALSE
      ORDER BY tr.rpi DESC NULLS LAST
    `, [league, season]);

    const teams = teamsResult.rows;

    // Step 1a: Get conference champions
    const conferenceChampions = await getConferenceChampions(pool, league, season);

    // Step 1b: Get total record (all games including non-NAIA, but only completed and non-exhibition)
    // Exclude national tournament games since bracketcast is for projecting seeds
    // Filter by asOfDate if provided
    const totalRecordResult = await pool.query(`
      SELECT
        g.team_id,
        SUM(CASE WHEN g.team_score > g.opponent_score THEN 1 ELSE 0 END) as total_wins,
        SUM(CASE WHEN g.team_score < g.opponent_score THEN 1 ELSE 0 END) as total_losses
      FROM games g
      JOIN teams t ON g.team_id = t.team_id
      WHERE t.league = $1
        AND g.season = $2
        AND g.is_completed = TRUE
        AND g.is_exhibition = FALSE
        AND g.is_national_tournament = FALSE
        AND ($3::date IS NULL OR g.game_date <= $3::date)
      GROUP BY g.team_id
    `, [league, season, asOfDate]);

    const totalRecords = {};
    totalRecordResult.rows.forEach(row => {
      totalRecords[row.team_id] = {
        total_wins: parseInt(row.total_wins) || 0,
        total_losses: parseInt(row.total_losses) || 0,
      };
    });

    // Step 1c: Get NAIA record from games table (using is_naia_game flag for consistency)
    // Exclude national tournament games since bracketcast is for projecting seeds
    // Filter by asOfDate if provided
    const naiaRecordResult = await pool.query(`
      SELECT
        g.team_id,
        SUM(CASE WHEN g.team_score > g.opponent_score THEN 1 ELSE 0 END) as naia_wins,
        SUM(CASE WHEN g.team_score < g.opponent_score THEN 1 ELSE 0 END) as naia_losses
      FROM games g
      JOIN teams t ON g.team_id = t.team_id
      WHERE t.league = $1
        AND g.season = $2
        AND g.is_completed = TRUE
        AND g.is_exhibition = FALSE
        AND g.is_naia_game = TRUE
        AND g.is_national_tournament = FALSE
        AND ($3::date IS NULL OR g.game_date <= $3::date)
      GROUP BY g.team_id
    `, [league, season, asOfDate]);

    const naiaRecords = {};
    naiaRecordResult.rows.forEach(row => {
      const wins = parseInt(row.naia_wins) || 0;
      const losses = parseInt(row.naia_losses) || 0;
      const total = wins + losses;
      naiaRecords[row.team_id] = {
        naia_wins: wins,
        naia_losses: losses,
        naia_win_pct: total > 0 ? wins / total : 0,
      };
    });

    // Create RPI rank lookup (1-indexed)
    const rpiRanks = {};
    teams.forEach((team, idx) => {
      rpiRanks[team.team_id] = team.rpi ? idx + 1 : null;
    });

    // Step 2: Get all NAIA games for quadrant calculation
    // Exclude national tournament games since bracketcast is for projecting seeds
    // Filter by asOfDate if provided
    const gamesResult = await pool.query(`
      SELECT
        g.team_id,
        g.opponent_id,
        g.location,
        g.team_score,
        g.opponent_score,
        g.is_conference
      FROM games g
      JOIN teams t ON g.team_id = t.team_id
      WHERE t.league = $1
        AND g.season = $2
        AND g.is_naia_game = TRUE
        AND g.is_completed = TRUE
        AND g.is_national_tournament = FALSE
        AND ($3::date IS NULL OR g.game_date <= $3::date)
    `, [league, season, asOfDate]);

    // Step 3: Calculate quadrant records for each team
    const quadrantRecords = {};
    const conferenceRecords = {};

    // Initialize records for all teams
    teams.forEach(team => {
      quadrantRecords[team.team_id] = {
        q1_wins: 0, q1_losses: 0,
        q2_wins: 0, q2_losses: 0,
        q3_wins: 0, q3_losses: 0,
        q4_wins: 0, q4_losses: 0,
      };
      conferenceRecords[team.team_id] = {
        conf_wins: 0, conf_losses: 0
      };
    });

    // Process each game
    gamesResult.rows.forEach(game => {
      const oppRpiRank = rpiRanks[game.opponent_id];
      const quadrant = getQuadrant(oppRpiRank, game.location);
      const isWin = game.team_score > game.opponent_score;

      if (quadrantRecords[game.team_id]) {
        const qKey = `q${quadrant}_${isWin ? 'wins' : 'losses'}`;
        quadrantRecords[game.team_id][qKey]++;

        // Conference record
        if (game.is_conference) {
          if (isWin) {
            conferenceRecords[game.team_id].conf_wins++;
          } else {
            conferenceRecords[game.team_id].conf_losses++;
          }
        }
      }
    });

    // Step 4: Calculate SOS rankings (higher SOS = better = lower rank number)
    const teamsWithSos = teams
      .filter(t => t.strength_of_schedule != null)
      .sort((a, b) => parseFloat(b.strength_of_schedule) - parseFloat(a.strength_of_schedule));
    const sosRanks = {};
    teamsWithSos.forEach((team, idx) => {
      sosRanks[team.team_id] = idx + 1;
    });

    // Step 5: Build final team data with all fields
    let bracketcastTeams = teams.map((team, idx) => {
      const qr = quadrantRecords[team.team_id] || {};
      const cr = conferenceRecords[team.team_id] || {};
      const tr = totalRecords[team.team_id] || { total_wins: 0, total_losses: 0 };
      const nr = naiaRecords[team.team_id] || { naia_wins: 0, naia_losses: 0, naia_win_pct: 0 };
      const rpiRank = rpiRanks[team.team_id];

      // Calculate total win percentage
      const totalGames = tr.total_wins + tr.total_losses;
      const totalWinPct = totalGames > 0 ? tr.total_wins / totalGames : 0;

      return {
        team_id: team.team_id,
        name: team.name,
        conference: team.conference,
        logo_url: team.logo_url,
        city: team.city,
        state: team.state,
        latitude: team.latitude ? parseFloat(team.latitude) : null,
        longitude: team.longitude ? parseFloat(team.longitude) : null,
        area: CONFERENCE_AREAS[team.conference] || 'Unknown',
        // Total record (all games including non-NAIA)
        total_wins: tr.total_wins,
        total_losses: tr.total_losses,
        total_win_pct: totalWinPct,
        // NAIA record (calculated from games table using is_naia_game flag)
        naia_wins: nr.naia_wins,
        naia_losses: nr.naia_losses,
        naia_win_pct: nr.naia_win_pct,
        // Legacy fields for backwards compatibility
        wins: tr.total_wins,
        losses: tr.total_losses,
        win_pct: totalWinPct,
        rpi: team.rpi ? parseFloat(team.rpi) : null,
        rpi_rank: rpiRank,
        q1_wins: qr.q1_wins || 0,
        q1_losses: qr.q1_losses || 0,
        q2_wins: qr.q2_wins || 0,
        q2_losses: qr.q2_losses || 0,
        q3_wins: qr.q3_wins || 0,
        q3_losses: qr.q3_losses || 0,
        q4_wins: qr.q4_wins || 0,
        q4_losses: qr.q4_losses || 0,
        conf_wins: cr.conf_wins || 0,
        conf_losses: cr.conf_losses || 0,
        net_efficiency: team.net_efficiency ? parseFloat(team.net_efficiency) : null,
        sos: team.strength_of_schedule ? parseFloat(team.strength_of_schedule) : null,
        sos_rank: sosRanks[team.team_id] || null,
        owp: team.opponent_win_pct ? parseFloat(team.opponent_win_pct) : null,
        oowp: team.opponent_opponent_win_pct ? parseFloat(team.opponent_opponent_win_pct) : null,
        projected_seed: rpiRank && rpiRank <= 64 ? rpiRank : null,
        is_conference_champion: conferenceChampions.has(team.team_id),
      };
    });

    // Step 6: Calculate PCR (Primary Criteria Ranking) for each team
    // PCR = average of ranks in: Total Win %, RPI, and QWP
    const calcQWP = (team) =>
      (team.q1_wins || 0) * 4 +
      (team.q2_wins || 0) * 2 +
      (team.q3_wins || 0) * 1 +
      (team.q4_wins || 0) * 0.5;

    // Add QWP to each team
    const teamsWithQWP = bracketcastTeams.map(t => ({ ...t, qwp: calcQWP(t) }));

    // Rank by each criteria (descending - higher is better)
    const rankDesc = (arr, key) => {
      const sorted = [...arr].sort((a, b) => (b[key] || 0) - (a[key] || 0));
      const ranks = {};
      sorted.forEach((t, i) => { ranks[t.team_id] = i + 1; });
      return ranks;
    };

    const winPctRanks = rankDesc(teamsWithQWP, 'total_win_pct');
    const rpiValueRanks = rankDesc(teamsWithQWP, 'rpi');
    const qwpRanks = rankDesc(teamsWithQWP, 'qwp');

    // Compute average rank for each team
    const teamsWithAvg = teamsWithQWP.map(t => ({
      ...t,
      pcr_avg: (winPctRanks[t.team_id] + rpiValueRanks[t.team_id] + qwpRanks[t.team_id]) / 3,
    }));

    // Sort by average rank to assign final PCR position
    const byAvg = [...teamsWithAvg].sort((a, b) => a.pcr_avg - b.pcr_avg);
    const pcrMap = {};
    byAvg.forEach((t, i) => { pcrMap[t.team_id] = i + 1; });

    // Add PCR to bracketcast teams
    bracketcastTeams = teamsWithAvg.map(t => ({ ...t, pcr: pcrMap[t.team_id] }));

    // Step 6b: Calculate PR (Projected Rank)
    // PR = PCR, but conference champions are forced to be ranked at least in the top 64
    // This simulates the automatic qualification for conference tournament winners
    const championsOutsideTop64 = bracketcastTeams
      .filter(t => t.is_conference_champion && t.pcr > 64)
      .sort((a, b) => a.pcr - b.pcr); // Sort by PCR ascending (best first)

    const nonChampionsInTop64 = bracketcastTeams
      .filter(t => !t.is_conference_champion && t.pcr <= 64)
      .sort((a, b) => b.pcr - a.pcr); // Sort by PCR descending (worst first, to be bumped)

    // Build PR map - start with PCR values
    const prMap = {};
    bracketcastTeams.forEach(t => { prMap[t.team_id] = t.pcr; });

    // For each champion outside top 64, bump out a non-champion from top 64
    const bumpsNeeded = Math.min(championsOutsideTop64.length, nonChampionsInTop64.length);
    for (let i = 0; i < bumpsNeeded; i++) {
      const championIn = championsOutsideTop64[i];
      const nonChampionOut = nonChampionsInTop64[i];
      // Swap their PR ranks
      prMap[championIn.team_id] = nonChampionOut.pcr;
      prMap[nonChampionOut.team_id] = championIn.pcr;
    }

    // Add PR to bracketcast teams
    bracketcastTeams = bracketcastTeams.map(t => ({ ...t, pr: prMap[t.team_id] }));

    // Step 7: Build bracket projection (top 64 teams by PR)
    const qualifiedTeams = bracketcastTeams
      .filter(t => t.pr && t.pr <= 64)
      .sort((a, b) => a.pr - b.pr);

    // Step 8: Build pod assignments (16 pods of 4 teams each)
    // Helper function to calculate distance between two points (Haversine formula)
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
      if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
      const R = 3959; // Earth's radius in miles
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return Math.round(R * c);
    };

    // Get teams by seed tier
    const seed1Teams = qualifiedTeams.slice(0, 16);  // #1 seeds (hosts)
    const seed2Teams = qualifiedTeams.slice(16, 32); // #2 seeds
    const seed3Teams = qualifiedTeams.slice(32, 48); // #3 seeds
    const seed4Teams = qualifiedTeams.slice(48, 64); // #4 seeds

    // Function to get potential hosts for a team (closest 4 host sites)
    const getPotentialHosts = (team, hostTeams) => {
      // If team is a host (#1 seed), they host themselves
      const isHost = hostTeams.some(h => h.team_id === team.team_id);
      if (isHost) {
        return { isHost: true, potentialHosts: [] };
      }

      // Calculate distance to each host
      const hostsWithDistance = hostTeams.map(host => ({
        team_id: host.team_id,
        name: host.name,
        city: host.city,
        state: host.state,
        conference: host.conference,
        rpi_rank: host.rpi_rank,
        distance: calculateDistance(
          team.latitude, team.longitude,
          host.latitude, host.longitude
        ),
        hasConferenceConflict: host.conference === team.conference,
      }));

      // Sort by distance and take closest 4
      hostsWithDistance.sort((a, b) => a.distance - b.distance);
      return {
        isHost: false,
        potentialHosts: hostsWithDistance.slice(0, 4),
      };
    };

    // Build bracket with potential hosts for each team
    const buildBracketQuad = (teams, hostTeams) => {
      return teams.map((t, i) => {
        const hostInfo = getPotentialHosts(t, hostTeams);
        return {
          seed: i + 1,
          team_id: t.team_id,
          name: t.name,
          conference: t.conference,
          city: t.city,
          state: t.state,
          record: `${t.wins}-${t.losses}`,
          rpi_rank: t.rpi_rank,
          isHost: hostInfo.isHost,
          potentialHosts: hostInfo.potentialHosts,
        };
      });
    };

    // Legacy quad structure (for backward compatibility) - now with potential hosts
    const bracket = {
      quad1: buildBracketQuad(qualifiedTeams.slice(0, 16), seed1Teams),
      quad2: buildBracketQuad(qualifiedTeams.slice(16, 32), seed1Teams),
      quad3: buildBracketQuad(qualifiedTeams.slice(32, 48), seed1Teams),
      quad4: buildBracketQuad(qualifiedTeams.slice(48, 64), seed1Teams),
    };

    // Initialize 16 pods with #1 seeds as hosts
    const pods = seed1Teams.map((host, index) => ({
      podNumber: index + 1,
      host: {
        seed: 1,
        team_id: host.team_id,
        name: host.name,
        conference: host.conference,
        city: host.city,
        state: host.state,
        latitude: host.latitude,
        longitude: host.longitude,
        record: `${host.wins}-${host.losses}`,
        rpi_rank: host.rpi_rank,
        distance: 0, // Host travels 0 miles
      },
      teams: [], // Will hold #2, #3, #4 seeds
    }));

    // Function to assign a team to the best available pod
    const assignTeamToPod = (team, seedNumber, pods) => {
      // Calculate distance to each pod host
      const podDistances = pods.map((pod, index) => ({
        podIndex: index,
        distance: calculateDistance(
          team.latitude, team.longitude,
          pod.host.latitude, pod.host.longitude
        ),
        hasConferenceConflict: pod.host.conference === team.conference ||
          pod.teams.some(t => t.conference === team.conference),
        currentTeamCount: pod.teams.length,
      }));

      // Sort by:
      // 1. Pods with fewer teams (balance distribution)
      // 2. No conference conflict preferred
      // 3. Shortest distance
      podDistances.sort((a, b) => {
        // First, prefer pods that need more teams
        if (a.currentTeamCount !== b.currentTeamCount) {
          return a.currentTeamCount - b.currentTeamCount;
        }
        // Then, prefer no conference conflict
        if (a.hasConferenceConflict !== b.hasConferenceConflict) {
          return a.hasConferenceConflict ? 1 : -1;
        }
        // Finally, prefer shorter distance
        return a.distance - b.distance;
      });

      // Assign to best pod
      const bestPod = podDistances[0];
      pods[bestPod.podIndex].teams.push({
        seed: seedNumber,
        team_id: team.team_id,
        name: team.name,
        conference: team.conference,
        city: team.city,
        state: team.state,
        record: `${team.wins}-${team.losses}`,
        rpi_rank: team.rpi_rank,
        distance: bestPod.distance,
      });
    };

    // Assign #2 seeds first (they have more flexibility)
    seed2Teams.forEach(team => assignTeamToPod(team, 2, pods));

    // Then assign #3 seeds
    seed3Teams.forEach(team => assignTeamToPod(team, 3, pods));

    // Finally assign #4 seeds
    seed4Teams.forEach(team => assignTeamToPod(team, 4, pods));

    // Sort teams within each pod by seed
    pods.forEach(pod => {
      pod.teams.sort((a, b) => a.seed - b.seed);
    });

    res.json({
      teams: bracketcastTeams,
      bracket,
      pods,
      asOfDate,
    });
  } catch (err) {
    console.error('Error fetching bracketcast:', err);
    res.status(500).json({ error: 'Failed to fetch bracketcast data' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Get last data update timestamp
app.get('/api/last-updated', async (req, res) => {
  try {
    const { season = DEFAULT_SEASON } = req.query;
    // Get the most recent updated_at from games table (when game data was last imported)
    const result = await pool.query(`
      SELECT MAX(updated_at) as last_update
      FROM games
      WHERE season = $1
    `, [season]);

    res.json({
      lastUpdated: result.rows[0].last_update,
    });
  } catch (err) {
    console.error('Error fetching last updated:', err);
    res.status(500).json({ error: 'Failed to fetch last updated timestamp' });
  }
});

// Serve React app for all other routes in production
if (process.env.NODE_ENV === 'production') {
  app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/dist/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Start automated task scheduler in production
  if (process.env.NODE_ENV === 'production') {
    startScheduler();
  } else {
    console.log('Scheduler disabled in development (set NODE_ENV=production to enable)');
  }
});
