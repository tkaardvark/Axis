require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

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

/**
 * Calculate team stats dynamically from games table based on filters
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {Object} filters - Filter options
 * @param {string} filters.league - 'mens' or 'womens'
 * @param {string} filters.conference - Conference name or 'All Conferences'
 * @param {string} filters.gameType - 'all' for all NAIA games, 'conference' for conference games only
 * @param {string} filters.seasonSegment - 'all', 'last10', 'last5', 'last3', or 'YYYY-MM' for specific month
 * @returns {Promise<QueryResult>} - PostgreSQL query result
 */
async function calculateDynamicStats(pool, filters) {
  const {
    league = 'mens',
    conference,
    gameType = 'all',
    seasonSegment = 'all',
  } = filters;

  // Build the WHERE clause for game filtering
  const gameFilters = ['g.is_naia_game = true', 'g.is_completed = true'];
  if (gameType === 'conference') {
    gameFilters.push('g.is_conference = true');
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
  const usePreCalculated = gameType === 'all' && seasonSegment === 'all';

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
      AND tr.date_calculated = (SELECT MAX(date_calculated) FROM team_ratings)
    WHERE t.league = $1
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
      seasonSegment = 'all',
    } = req.query;

    const result = await calculateDynamicStats(pool, { league, conference, gameType, seasonSegment });
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching teams:', err);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

// Get available months that have games
app.get('/api/months', async (req, res) => {
  try {
    const { league = 'mens' } = req.query;

    const result = await pool.query(`
      SELECT DISTINCT
        EXTRACT(MONTH FROM g.game_date)::int as month,
        EXTRACT(YEAR FROM g.game_date)::int as year
      FROM games g
      JOIN teams t ON g.team_id = t.team_id
      WHERE t.league = $1
        AND g.is_naia_game = true
      ORDER BY year, month
    `, [league]);

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

// Get list of conferences
app.get('/api/conferences', async (req, res) => {
  try {
    const { league = 'mens' } = req.query;

    const result = await pool.query(
      'SELECT DISTINCT conference FROM teams WHERE league = $1 AND conference IS NOT NULL ORDER BY conference',
      [league]
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

    const teamResult = await pool.query(
      'SELECT * FROM teams WHERE team_id = $1',
      [teamId]
    );

    if (teamResult.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const ratingsResult = await pool.query(
      `SELECT * FROM team_ratings
       WHERE team_id = $1
       ORDER BY date_calculated DESC
       LIMIT 1`,
      [teamId]
    );

    const gamesResult = await pool.query(
      `SELECT g.*,
              opp.name as opponent_name,
              opp.logo_url as opponent_logo
       FROM games g
       LEFT JOIN teams opp ON g.opponent_id = opp.team_id
       WHERE g.team_id = $1
       ORDER BY g.game_date DESC`,
      [teamId]
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
       WHERE g.team_id = $1 AND g.is_naia_game = true AND g.is_completed = true
       ORDER BY g.game_date DESC`,
      [teamId]
    );

    const allGames = gamesResult.rows;
    if (allGames.length === 0) {
      return res.json({ splits: [] });
    }

    // Get team info for conference record
    const teamResult = await pool.query('SELECT conference FROM teams WHERE team_id = $1', [teamId]);
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

// Get team schedule (all games - completed and future)
app.get('/api/teams/:teamId/schedule', async (req, res) => {
  try {
    const { teamId } = req.params;

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
        g.is_completed,
        t.name as opponent_team_name,
        t.logo_url as opponent_logo_url
       FROM games g
       LEFT JOIN teams t ON g.opponent_id = t.team_id
       WHERE g.team_id = $1
       ORDER BY g.game_date ASC`,
      [teamId]
    );

    const games = gamesResult.rows.map(g => {
      // Determine game type for display
      let gameType = 'NAIA';
      if (g.is_exhibition) {
        gameType = 'Exhibition';
      } else if (!g.is_naia_game) {
        gameType = 'Non-NAIA';
      } else if (g.is_conference) {
        gameType = 'Conference';
      } else {
        gameType = 'Non-Conference';
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
        result: g.is_completed ? (g.team_score > g.opponent_score ? 'W' : 'L') : null
      };
    });

    res.json({ games });
  } catch (err) {
    console.error('Error fetching team schedule:', err);
    res.status(500).json({ error: 'Failed to fetch team schedule' });
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
    const { league = 'mens' } = req.query;

    // Step 1: Get all teams with their RPI and create RPI rankings
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
        AND tr.date_calculated = (SELECT MAX(date_calculated) FROM team_ratings)
      WHERE t.league = $1
        AND t.is_excluded = FALSE
      ORDER BY tr.rpi DESC NULLS LAST
    `, [league]);

    const teams = teamsResult.rows;

    // Step 1b: Get total record (all games including non-NAIA, but only completed and non-exhibition)
    const totalRecordResult = await pool.query(`
      SELECT 
        g.team_id,
        SUM(CASE WHEN g.team_score > g.opponent_score THEN 1 ELSE 0 END) as total_wins,
        SUM(CASE WHEN g.team_score < g.opponent_score THEN 1 ELSE 0 END) as total_losses
      FROM games g
      JOIN teams t ON g.team_id = t.team_id
      WHERE t.league = $1
        AND g.is_completed = TRUE
        AND g.is_exhibition = FALSE
      GROUP BY g.team_id
    `, [league]);

    const totalRecords = {};
    totalRecordResult.rows.forEach(row => {
      totalRecords[row.team_id] = {
        total_wins: parseInt(row.total_wins) || 0,
        total_losses: parseInt(row.total_losses) || 0,
      };
    });

    // Create RPI rank lookup (1-indexed)
    const rpiRanks = {};
    teams.forEach((team, idx) => {
      rpiRanks[team.team_id] = team.rpi ? idx + 1 : null;
    });

    // Step 2: Get all NAIA games for quadrant calculation
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
        AND g.is_naia_game = TRUE
        AND g.is_completed = TRUE
    `, [league]);

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
    const bracketcastTeams = teams.map((team, idx) => {
      const qr = quadrantRecords[team.team_id] || {};
      const cr = conferenceRecords[team.team_id] || {};
      const tr = totalRecords[team.team_id] || { total_wins: 0, total_losses: 0 };
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
        // NAIA record (used in RPI formula)
        naia_wins: team.naia_wins || 0,
        naia_losses: team.naia_losses || 0,
        naia_win_pct: team.naia_win_pct ? parseFloat(team.naia_win_pct) : 0,
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
      };
    });

    // Step 6: Build bracket projection (top 64 teams by RPI)
    const qualifiedTeams = bracketcastTeams
      .filter(t => t.rpi_rank && t.rpi_rank <= 64)
      .sort((a, b) => a.rpi_rank - b.rpi_rank);

    // Legacy quad structure (for backward compatibility)
    const bracket = {
      quad1: qualifiedTeams.slice(0, 16).map((t, i) => ({
        seed: i + 1,
        team_id: t.team_id,
        name: t.name,
        conference: t.conference,
        record: `${t.wins}-${t.losses}`,
        rpi_rank: t.rpi_rank,
      })),
      quad2: qualifiedTeams.slice(16, 32).map((t, i) => ({
        seed: i + 1,
        team_id: t.team_id,
        name: t.name,
        conference: t.conference,
        record: `${t.wins}-${t.losses}`,
        rpi_rank: t.rpi_rank,
      })),
      quad3: qualifiedTeams.slice(32, 48).map((t, i) => ({
        seed: i + 1,
        team_id: t.team_id,
        name: t.name,
        conference: t.conference,
        record: `${t.wins}-${t.losses}`,
        rpi_rank: t.rpi_rank,
      })),
      quad4: qualifiedTeams.slice(48, 64).map((t, i) => ({
        seed: i + 1,
        team_id: t.team_id,
        name: t.name,
        conference: t.conference,
        record: `${t.wins}-${t.losses}`,
        rpi_rank: t.rpi_rank,
      })),
    };

    // Step 7: Build pod assignments (16 pods of 4 teams each)
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
    // Get the most recent updated_at from games table (when game data was last imported)
    const result = await pool.query(`
      SELECT MAX(updated_at) as last_update
      FROM games
    `);

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
});
