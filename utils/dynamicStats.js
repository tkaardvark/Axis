const { DEFAULT_SEASON } = require('../db/pool');

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

module.exports = { calculateDynamicStats };
