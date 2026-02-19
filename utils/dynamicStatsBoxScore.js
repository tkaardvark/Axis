const { DEFAULT_SEASON } = require('../db/pool');

/**
 * Calculate team stats dynamically from exp_game_box_scores table.
 * 
 * This mirrors calculateDynamicStats() in dynamicStats.js but sources data
 * from the experimental box score tables instead of the existing games table.
 * 
 * The key transformation: exp_game_box_scores stores 1 row per game with
 * away/home sides. We flatten it into 1 row per team per game (like the
 * existing games table) using a UNION ALL CTE, then apply the same
 * aggregation and stat calculations.
 * 
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {Object} filters - Same filter options as calculateDynamicStats
 * @returns {Promise<QueryResult>} - Same shape as calculateDynamicStats output
 */
async function calculateDynamicStatsFromBoxScores(pool, filters) {
  const {
    league = 'mens',
    conference,
    gameType = 'all',
    seasonType = 'all',
    seasonSegment = 'all',
    season = DEFAULT_SEASON,
  } = filters;

  // Build game-level WHERE filters applied to the exp table (before flattening)
  const expFilters = [`e.season = '${season.replace(/'/g, "''")}'`];
  
  // Exclude exhibition games (matches is_naia_game filter in original)
  expFilters.push('e.is_exhibition = false');
  // Only completed games (has scores)
  expFilters.push('e.away_score IS NOT NULL');
  expFilters.push('e.home_score IS NOT NULL');

  if (gameType === 'conference') {
    expFilters.push('e.is_conference = true');
  }

  if (seasonType === 'regular') {
    expFilters.push('e.is_postseason = false');
  } else if (seasonType === 'postseason') {
    expFilters.push('e.is_postseason = true');
  }
  // Note: conftournament and nationaltournament are not distinguishable in exp_ tables yet

  // Month filter
  if (seasonSegment && seasonSegment.match(/^\d{4}-\d{2}$/)) {
    const [year, month] = seasonSegment.split('-');
    expFilters.push(`EXTRACT(YEAR FROM e.game_date) = ${parseInt(year)}`);
    expFilters.push(`EXTRACT(MONTH FROM e.game_date) = ${parseInt(month)}`);
  }

  const expWhereClause = expFilters.join(' AND ');

  // Build conference filter
  const params = [league];
  let paramIndex = 2;
  let conferenceClause = '';
  if (conference && conference !== 'All Conferences') {
    conferenceClause = `AND t.conference = $${paramIndex}`;
    params.push(conference);
    paramIndex++;
  }

  // Last N games support
  const lastNGames = seasonSegment === 'last10' ? 10
                   : seasonSegment === 'last5' ? 5
                   : seasonSegment === 'last3' ? 3
                   : null;

  // The flattened CTE: transform 1-row-per-game into 1-row-per-team-per-game
  // Each exp_game_box_scores row produces 2 rows: one for away team, one for home team
  const flattenedCTE = `
    flat_games AS (
      -- Away team perspective
      SELECT
        t.team_id,
        e.game_date,
        e.away_score as team_score,
        e.home_score as opponent_score,
        e.is_conference,
        e.is_postseason,
        -- Team stats (away side)
        e.away_fgm as fgm, e.away_fga as fga,
        e.away_fgm3 as fgm3, e.away_fga3 as fga3,
        e.away_ftm as ftm, e.away_fta as fta,
        e.away_oreb as oreb, e.away_dreb as dreb, e.away_reb as treb,
        e.away_ast as ast, e.away_stl as stl, e.away_blk as blk,
        e.away_to as turnovers, e.away_pf as pf,
        e.away_points_in_paint as pts_paint,
        e.away_fastbreak_points as pts_fastbreak,
        e.away_points_off_turnovers as pts_turnovers,
        e.away_bench_points as pts_bench,
        e.away_second_chance_points as second_chance_pts,
        e.home_second_chance_points as opp_second_chance_pts,
        -- Game flow fields
        e.lead_changes,
        e.ties,
        e.away_largest_lead as largest_lead,
        e.home_largest_lead as opp_largest_lead,
        -- Halftime data (period_scores array index 0 = 1st half)
        (e.away_period_scores->>0)::int as team_half1_score,
        (e.home_period_scores->>0)::int as opp_half1_score,
        e.id as game_box_score_id,
        -- Opponent stats (home side)
        e.home_fgm as opp_fgm, e.home_fga as opp_fga,
        e.home_fgm3 as opp_fgm3, e.home_fga3 as opp_fga3,
        e.home_ftm as opp_ftm, e.home_fta as opp_fta,
        e.home_oreb as opp_oreb, e.home_dreb as opp_dreb, e.home_reb as opp_treb,
        e.home_ast as opp_ast, e.home_stl as opp_stl, e.home_blk as opp_blk,
        e.home_to as opp_turnovers, e.home_pf as opp_pf,
        e.home_points_in_paint as opp_pts_paint,
        e.home_fastbreak_points as opp_pts_fastbreak,
        e.home_points_off_turnovers as opp_pts_turnovers
      FROM exp_game_box_scores e
      JOIN teams t ON t.name = e.away_team_name AND t.season = e.season
      WHERE ${expWhereClause}
        AND t.league = $1

      UNION ALL

      -- Home team perspective
      SELECT
        t.team_id,
        e.game_date,
        e.home_score as team_score,
        e.away_score as opponent_score,
        e.is_conference,
        e.is_postseason,
        -- Team stats (home side)
        e.home_fgm as fgm, e.home_fga as fga,
        e.home_fgm3 as fgm3, e.home_fga3 as fga3,
        e.home_ftm as ftm, e.home_fta as fta,
        e.home_oreb as oreb, e.home_dreb as dreb, e.home_reb as treb,
        e.home_ast as ast, e.home_stl as stl, e.home_blk as blk,
        e.home_to as turnovers, e.home_pf as pf,
        e.home_points_in_paint as pts_paint,
        e.home_fastbreak_points as pts_fastbreak,
        e.home_points_off_turnovers as pts_turnovers,
        e.home_bench_points as pts_bench,
        e.home_second_chance_points as second_chance_pts,
        e.away_second_chance_points as opp_second_chance_pts,
        -- Game flow fields
        e.lead_changes,
        e.ties,
        e.home_largest_lead as largest_lead,
        e.away_largest_lead as opp_largest_lead,
        -- Halftime data (period_scores array index 0 = 1st half)
        (e.home_period_scores->>0)::int as team_half1_score,
        (e.away_period_scores->>0)::int as opp_half1_score,
        e.id as game_box_score_id,
        -- Opponent stats (away side)
        e.away_fgm as opp_fgm, e.away_fga as opp_fga,
        e.away_fgm3 as opp_fgm3, e.away_fga3 as opp_fga3,
        e.away_ftm as opp_ftm, e.away_fta as opp_fta,
        e.away_oreb as opp_oreb, e.away_dreb as opp_dreb, e.away_reb as opp_treb,
        e.away_ast as opp_ast, e.away_stl as opp_stl, e.away_blk as opp_blk,
        e.away_to as opp_turnovers, e.away_pf as opp_pf,
        e.away_points_in_paint as opp_pts_paint,
        e.away_fastbreak_points as opp_pts_fastbreak,
        e.away_points_off_turnovers as opp_pts_turnovers
      FROM exp_game_box_scores e
      JOIN teams t ON t.name = e.home_team_name AND t.season = e.season
      WHERE ${expWhereClause}
        AND t.league = $1
    )`;

  // Build game_stats CTE — aggregate the flattened rows
  let gamesCTE;
  if (lastNGames) {
    gamesCTE = `
      ${flattenedCTE},
      ranked_games AS (
        SELECT g.*,
          ROW_NUMBER() OVER (PARTITION BY g.team_id ORDER BY g.game_date DESC) as rn
        FROM flat_games g
      ),
      filtered_games AS (
        SELECT * FROM ranked_games WHERE rn <= ${lastNGames}
      ),
      game_stats AS (
        SELECT
          g.team_id,
          ${buildAggregateSelects('g')}
        FROM filtered_games g
        GROUP BY g.team_id
        HAVING COUNT(*) > 0
      )`;
  } else {
    gamesCTE = `
      ${flattenedCTE},
      game_stats AS (
        SELECT
          g.team_id,
          ${buildAggregateSelects('g')}
        FROM flat_games g
        GROUP BY g.team_id
        HAVING COUNT(*) > 0
      )`;
  }

  // For box score source, we don't have pre-calculated adjusted ratings
  // So we always use raw ratings (no SOS/RPI)
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
      -- Offensive rating
      ROUND(CASE WHEN (gs.total_fga - gs.total_oreb + gs.total_to + 0.475 * gs.total_fta) > 0
        THEN gs.total_pts * 100.0 / (gs.total_fga - gs.total_oreb + gs.total_to + 0.475 * gs.total_fta)
        ELSE 0 END::numeric, 1) as offensive_rating,
      -- Defensive rating
      ROUND(CASE WHEN (gs.total_opp_fga - gs.total_opp_oreb + gs.total_opp_to + 0.475 * gs.total_opp_fta) > 0
        THEN gs.total_pts_opp * 100.0 / (gs.total_opp_fga - gs.total_opp_oreb + gs.total_opp_to + 0.475 * gs.total_opp_fta)
        ELSE 0 END::numeric, 1) as defensive_rating,
      -- Net rating
      ROUND(CASE WHEN (gs.total_fga - gs.total_oreb + gs.total_to + 0.475 * gs.total_fta) > 0
        THEN (gs.total_pts * 100.0 / (gs.total_fga - gs.total_oreb + gs.total_to + 0.475 * gs.total_fta)) -
             COALESCE((gs.total_pts_opp * 100.0 / NULLIF(gs.total_opp_fga - gs.total_opp_oreb + gs.total_opp_to + 0.475 * gs.total_opp_fta, 0)), 0)
        ELSE 0 END::numeric, 1) as net_rating,
      -- Adjusted ratings: use pre-calculated when available, fall back to raw
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
      -- SOS/RPI from pre-calculated ratings (same source regardless)
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
      -- Pace
      ROUND(CASE WHEN gs.games_played > 0
        THEN (gs.total_fga - gs.total_oreb + gs.total_to + 0.475 * gs.total_fta)::float / gs.games_played
        ELSE 0 END::numeric, 1) as pace,
      -- Rebounding
      ROUND(gs.oreb_pct::numeric, 3) as oreb_pct,
      ROUND(gs.dreb_pct::numeric, 3) as dreb_pct,
      ROUND(gs.oreb_pct_opp::numeric, 3) as oreb_pct_opp,
      ROUND(gs.dreb_pct_opp::numeric, 3) as dreb_pct_opp,
      -- Per-game stats
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
      -- Defense per-game
      ROUND((gs.total_stl::float / gs.games_played)::numeric, 1) as stl_per_game,
      ROUND((gs.total_blk::float / gs.games_played)::numeric, 1) as blk_per_game,
      ROUND((gs.total_opp_ast::float / gs.games_played)::numeric, 1) as opp_ast_per_game,
      ROUND((gs.total_opp_treb::float / gs.games_played)::numeric, 1) as opp_reb_per_game,
      ROUND((gs.total_opp_pts_paint::float / NULLIF(gs.games_played, 0))::numeric, 1) as opp_pts_paint_per_game,
      ROUND((gs.total_opp_pts_fastbreak::float / NULLIF(gs.games_played, 0))::numeric, 1) as opp_pts_fastbreak_per_game,
      ROUND((gs.total_opp_pts_off_to::float / NULLIF(gs.games_played, 0))::numeric, 1) as opp_pts_off_to_per_game,
      -- Game flow derived stats
      ROUND(gs.avg_lead_changes::numeric, 1) as lead_changes_per_game,
      ROUND(gs.avg_ties::numeric, 1) as ties_per_game,
      ROUND(gs.avg_largest_lead::numeric, 1) as avg_largest_lead,
      ROUND(gs.avg_opp_largest_lead::numeric, 1) as avg_opp_largest_lead,
      ROUND((gs.total_second_chance_pts::float / NULLIF(gs.games_played, 0))::numeric, 1) as second_chance_per_game,
      ROUND((gs.total_opp_second_chance_pts::float / NULLIF(gs.games_played, 0))::numeric, 1) as opp_second_chance_per_game,
      gs.close_wins::int as close_wins,
      gs.close_losses::int as close_losses,
      gs.blowout_wins::int as blowout_wins,
      gs.blowout_losses::int as blowout_losses,
      ROUND(CASE WHEN gs.half_lead_games > 0 THEN gs.half_lead_wins::float / gs.half_lead_games ELSE NULL END::numeric, 3) as half_lead_win_pct,
      gs.half_lead_wins::int as half_lead_wins,
      gs.half_lead_games::int as half_lead_games,
      ROUND(CASE WHEN gs.trailing_half_games > 0 THEN gs.comeback_wins::float / gs.trailing_half_games ELSE NULL END::numeric, 3) as comeback_win_pct,
      gs.comeback_wins::int as comeback_wins,
      gs.trailing_half_games::int as trailing_half_games
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

/**
 * Build the aggregate SELECT expressions for game_stats CTE.
 * Shared between lastN and full-season variants.
 */
function buildAggregateSelects(alias) {
  const g = alias;
  return `
          COUNT(*) as games_played,
          SUM(CASE WHEN ${g}.team_score > ${g}.opponent_score THEN 1 ELSE 0 END) as wins,
          SUM(CASE WHEN ${g}.team_score < ${g}.opponent_score THEN 1 ELSE 0 END) as losses,
          AVG(${g}.team_score) as points_per_game,
          AVG(${g}.opponent_score) as points_allowed_per_game,
          -- Shooting stats
          SUM(${g}.fgm)::float / NULLIF(SUM(${g}.fga), 0) as fg_pct,
          SUM(${g}.fgm3)::float / NULLIF(SUM(${g}.fga3), 0) as fg3_pct,
          SUM(${g}.ftm)::float / NULLIF(SUM(${g}.fta), 0) as ft_pct,
          (SUM(${g}.fgm) + 0.5 * SUM(${g}.fgm3))::float / NULLIF(SUM(${g}.fga), 0) as efg_pct,
          -- Opponent shooting
          SUM(${g}.opp_fgm)::float / NULLIF(SUM(${g}.opp_fga), 0) as fg_pct_opp,
          SUM(${g}.opp_fgm3)::float / NULLIF(SUM(${g}.opp_fga3), 0) as fg3_pct_opp,
          (SUM(${g}.opp_fgm) + 0.5 * SUM(${g}.opp_fgm3))::float / NULLIF(SUM(${g}.opp_fga), 0) as efg_pct_opp,
          -- Rebounding
          SUM(${g}.oreb)::float / NULLIF(SUM(${g}.oreb) + SUM(${g}.opp_dreb), 0) as oreb_pct,
          SUM(${g}.dreb)::float / NULLIF(SUM(${g}.dreb) + SUM(${g}.opp_oreb), 0) as dreb_pct,
          SUM(${g}.opp_oreb)::float / NULLIF(SUM(${g}.opp_oreb) + SUM(${g}.dreb), 0) as oreb_pct_opp,
          SUM(${g}.opp_dreb)::float / NULLIF(SUM(${g}.opp_dreb) + SUM(${g}.oreb), 0) as dreb_pct_opp,
          -- Turnovers
          SUM(${g}.turnovers)::float / NULLIF(SUM(${g}.fga) - SUM(${g}.oreb) + SUM(${g}.turnovers) + 0.475 * SUM(${g}.fta), 0) as turnover_pct,
          SUM(${g}.opp_turnovers)::float / NULLIF(SUM(${g}.opp_fga) - SUM(${g}.opp_oreb) + SUM(${g}.opp_turnovers) + 0.475 * SUM(${g}.opp_fta), 0) as turnover_pct_opp,
          -- Rates
          SUM(${g}.fga3)::float / NULLIF(SUM(${g}.fga), 0) as three_pt_rate,
          SUM(${g}.fta)::float / NULLIF(SUM(${g}.fga), 0) as ft_rate,
          -- For efficiency calculations
          SUM(${g}.team_score) as total_pts,
          SUM(${g}.opponent_score) as total_pts_opp,
          SUM(${g}.fga) as total_fga,
          SUM(${g}.oreb) as total_oreb,
          SUM(${g}.turnovers) as total_to,
          SUM(${g}.fta) as total_fta,
          SUM(${g}.opp_fga) as total_opp_fga,
          SUM(${g}.opp_oreb) as total_opp_oreb,
          SUM(${g}.opp_turnovers) as total_opp_to,
          SUM(${g}.opp_fta) as total_opp_fta,
          -- Per-game totals
          SUM(${g}.ast) as total_ast,
          SUM(${g}.stl) as total_stl,
          SUM(${g}.blk) as total_blk,
          SUM(${g}.treb) as total_treb,
          SUM(${g}.oreb) as total_oreb_raw,
          SUM(${g}.dreb) as total_dreb,
          SUM(${g}.pf) as total_pf,
          SUM(${g}.fgm) as total_fgm,
          SUM(${g}.fgm3) as total_fgm3,
          SUM(${g}.ftm) as total_ftm,
          SUM(${g}.pts_paint) as total_pts_paint,
          SUM(${g}.pts_fastbreak) as total_pts_fastbreak,
          SUM(${g}.pts_turnovers) as total_pts_off_to,
          SUM(${g}.pts_bench) as total_pts_bench,
          -- Opponent per-game totals
          SUM(${g}.opp_ast) as total_opp_ast,
          SUM(${g}.opp_stl) as total_opp_stl,
          SUM(${g}.opp_blk) as total_opp_blk,
          SUM(${g}.opp_treb) as total_opp_treb,
          SUM(${g}.opp_pf) as total_opp_pf,
          SUM(${g}.opp_pts_paint) as total_opp_pts_paint,
          SUM(${g}.opp_pts_fastbreak) as total_opp_pts_fastbreak,
          SUM(${g}.opp_pts_turnovers) as total_opp_pts_off_to,
          -- Game flow aggregates
          SUM(${g}.second_chance_pts) as total_second_chance_pts,
          SUM(${g}.opp_second_chance_pts) as total_opp_second_chance_pts,
          AVG(${g}.lead_changes) as avg_lead_changes,
          AVG(${g}.ties) as avg_ties,
          AVG(${g}.largest_lead) as avg_largest_lead,
          AVG(${g}.opp_largest_lead) as avg_opp_largest_lead,
          -- Close/blowout/halftime records
          SUM(CASE WHEN ABS(${g}.team_score - ${g}.opponent_score) <= 5 AND ${g}.team_score > ${g}.opponent_score THEN 1 ELSE 0 END) as close_wins,
          SUM(CASE WHEN ABS(${g}.team_score - ${g}.opponent_score) <= 5 AND ${g}.team_score < ${g}.opponent_score THEN 1 ELSE 0 END) as close_losses,
          SUM(CASE WHEN (${g}.team_score - ${g}.opponent_score) >= 15 THEN 1 ELSE 0 END) as blowout_wins,
          SUM(CASE WHEN (${g}.opponent_score - ${g}.team_score) >= 15 THEN 1 ELSE 0 END) as blowout_losses,
          SUM(CASE WHEN ${g}.team_half1_score > ${g}.opp_half1_score AND ${g}.team_score > ${g}.opponent_score THEN 1 ELSE 0 END) as half_lead_wins,
          SUM(CASE WHEN ${g}.team_half1_score > ${g}.opp_half1_score THEN 1 ELSE 0 END) as half_lead_games,
          SUM(CASE WHEN ${g}.team_half1_score < ${g}.opp_half1_score AND ${g}.team_score > ${g}.opponent_score THEN 1 ELSE 0 END) as comeback_wins,
          SUM(CASE WHEN ${g}.team_half1_score < ${g}.opp_half1_score THEN 1 ELSE 0 END) as trailing_half_games`;
}

/**
 * Get flattened game rows for a specific team from exp_game_box_scores.
 * Returns rows shaped like the games table (1 row per team per game).
 * Used by team schedule, splits, and modal endpoints.
 * 
 * @param {Pool} pool
 * @param {string} teamId - team_id from teams table
 * @param {string} season
 * @returns {Promise<Array>} Game rows with team-centric stats
 */
async function getBoxScoreGamesForTeam(pool, teamId, season = DEFAULT_SEASON) {
  const result = await pool.query(`
    -- Away team perspective (team is the away team)
    SELECT
      e.id as game_id,
      e.game_date,
      'away' as location,
      e.home_team_name as opponent_name,
      opp_t.team_id as opponent_id,
      opp_t.name as opponent_team_name,
      opp_t.logo_url as opponent_logo_url,
      e.away_score as team_score,
      e.home_score as opponent_score,
      e.is_conference,
      e.is_exhibition,
      e.is_postseason,
      true as is_naia_game,
      false as is_national_tournament,
      true as is_completed,
      -- Team stats
      e.away_fgm as fgm, e.away_fga as fga, e.away_fgm3 as fgm3, e.away_fga3 as fga3,
      e.away_ftm as ftm, e.away_fta as fta,
      e.away_oreb as oreb, e.away_dreb as dreb, e.away_reb as treb,
      e.away_ast as ast, e.away_stl as stl, e.away_blk as blk,
      e.away_to as turnovers, e.away_pf as pf,
      e.away_points_in_paint as pts_paint,
      e.away_fastbreak_points as pts_fastbreak,
      e.away_points_off_turnovers as pts_turnovers,
      e.away_bench_points as pts_bench,
      -- Opponent stats
      e.home_fgm as opp_fgm, e.home_fga as opp_fga, e.home_fgm3 as opp_fgm3, e.home_fga3 as opp_fga3,
      e.home_ftm as opp_ftm, e.home_fta as opp_fta,
      e.home_oreb as opp_oreb, e.home_dreb as opp_dreb, e.home_reb as opp_treb,
      e.home_ast as opp_ast, e.home_stl as opp_stl, e.home_blk as opp_blk,
      e.home_to as opp_turnovers, e.home_pf as opp_pf,
      e.home_points_in_paint as opp_pts_paint,
      e.home_fastbreak_points as opp_pts_fastbreak,
      e.home_points_off_turnovers as opp_pts_turnovers,
      -- Extra box score data
      e.ties, e.lead_changes, e.status, e.attendance, e.box_score_url,
      e.away_period_scores as period_scores,
      e.home_period_scores as opp_period_scores
    FROM exp_game_box_scores e
    JOIN teams t ON t.name = e.away_team_name AND t.season = e.season
    LEFT JOIN teams opp_t ON opp_t.name = e.home_team_name AND opp_t.season = e.season AND opp_t.league = t.league
    WHERE t.team_id = $1 AND e.season = $2
      AND e.away_score IS NOT NULL AND e.home_score IS NOT NULL

    UNION ALL

    -- Home team perspective (team is the home team)
    SELECT
      e.id as game_id,
      e.game_date,
      'home' as location,
      e.away_team_name as opponent_name,
      opp_t.team_id as opponent_id,
      opp_t.name as opponent_team_name,
      opp_t.logo_url as opponent_logo_url,
      e.home_score as team_score,
      e.away_score as opponent_score,
      e.is_conference,
      e.is_exhibition,
      e.is_postseason,
      true as is_naia_game,
      false as is_national_tournament,
      true as is_completed,
      -- Team stats
      e.home_fgm as fgm, e.home_fga as fga, e.home_fgm3 as fgm3, e.home_fga3 as fga3,
      e.home_ftm as ftm, e.home_fta as fta,
      e.home_oreb as oreb, e.home_dreb as dreb, e.home_reb as treb,
      e.home_ast as ast, e.home_stl as stl, e.home_blk as blk,
      e.home_to as turnovers, e.home_pf as pf,
      e.home_points_in_paint as pts_paint,
      e.home_fastbreak_points as pts_fastbreak,
      e.home_points_off_turnovers as pts_turnovers,
      e.home_bench_points as pts_bench,
      -- Opponent stats
      e.away_fgm as opp_fgm, e.away_fga as opp_fga, e.away_fgm3 as opp_fgm3, e.away_fga3 as opp_fga3,
      e.away_ftm as opp_ftm, e.away_fta as opp_fta,
      e.away_oreb as opp_oreb, e.away_dreb as opp_dreb, e.away_reb as opp_treb,
      e.away_ast as opp_ast, e.away_stl as opp_stl, e.away_blk as opp_blk,
      e.away_to as opp_turnovers, e.away_pf as opp_pf,
      e.away_points_in_paint as opp_pts_paint,
      e.away_fastbreak_points as opp_pts_fastbreak,
      e.away_points_off_turnovers as opp_pts_turnovers,
      -- Extra box score data
      e.ties, e.lead_changes, e.status, e.attendance, e.box_score_url,
      e.home_period_scores as period_scores,
      e.away_period_scores as opp_period_scores
    FROM exp_game_box_scores e
    JOIN teams t ON t.name = e.home_team_name AND t.season = e.season
    LEFT JOIN teams opp_t ON opp_t.name = e.away_team_name AND opp_t.season = e.season AND opp_t.league = t.league
    WHERE t.team_id = $1 AND e.season = $2
      AND e.away_score IS NOT NULL AND e.home_score IS NOT NULL

    ORDER BY game_date DESC
  `, [teamId, season]);

  return result.rows;
}

/**
 * Get player season aggregates from exp_player_game_stats.
 * Aggregates per-game box score lines into season totals,
 * matching the shape of the existing players table.
 * 
 * @param {Pool} pool
 * @param {Object} filters
 * @returns {Promise<QueryResult>}
 */
async function getBoxScorePlayerStats(pool, filters) {
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
    min_gp = 5,
  } = filters;

  let whereConditions = ['t.league = $1', 'p.season = $2', 't.is_excluded = FALSE'];
  let params = [league, season];
  let paramIndex = 3;

  if (conference) {
    whereConditions.push(`t.conference = $${paramIndex}`);
    params.push(conference);
    paramIndex++;
  }
  if (team_id) {
    whereConditions.push(`t.team_id = $${paramIndex}`);
    params.push(team_id);
    paramIndex++;
  }
  if (team) {
    whereConditions.push(`t.name = $${paramIndex}`);
    params.push(team);
    paramIndex++;
  }

  const validSortColumns = [
    'pts_pg', 'reb_pg', 'ast_pg', 'stl_pg', 'blk_pg', 'to_pg',
    'fg_pct', 'fg3_pct', 'ft_pct',
    'pts', 'reb', 'ast', 'stl', 'blk', 'gp', 'turnovers',
    'fgm', 'fga', 'fg3m', 'fg3a', 'ftm', 'fta',
    'oreb', 'dreb',
  ];
  const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'pts_pg';
  const order = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const query = `
    WITH player_seasons AS (
      SELECT
        p.player_name,
        p.player_id,
        p.team_name,
        t.team_id,
        t.conference,
        t.logo_url as team_logo_url,
        t.primary_color as team_primary_color,
        COUNT(*) as gp,
        SUM(p.pts) as pts,
        SUM(p.reb) as reb,
        SUM(p.ast) as ast,
        SUM(p.stl) as stl,
        SUM(p.blk) as blk,
        SUM(p.turnovers) as turnovers,
        SUM(p.fgm) as fgm,
        SUM(p.fga) as fga,
        SUM(p.fgm3) as fg3m,
        SUM(p.fga3) as fg3a,
        SUM(p.ftm) as ftm,
        SUM(p.fta) as fta,
        SUM(p.oreb) as oreb,
        SUM(p.dreb) as dreb,
        SUM(p.pf) as pf,
        SUM(p.minutes) as min,
        -- Per-game averages
        ROUND(SUM(p.pts)::numeric / NULLIF(COUNT(*), 0), 1) as pts_pg,
        ROUND(SUM(p.reb)::numeric / NULLIF(COUNT(*), 0), 1) as reb_pg,
        ROUND(SUM(p.ast)::numeric / NULLIF(COUNT(*), 0), 1) as ast_pg,
        ROUND(SUM(p.stl)::numeric / NULLIF(COUNT(*), 0), 1) as stl_pg,
        ROUND(SUM(p.blk)::numeric / NULLIF(COUNT(*), 0), 1) as blk_pg,
        ROUND(SUM(p.turnovers)::numeric / NULLIF(COUNT(*), 0), 1) as to_pg,
        ROUND(SUM(p.minutes)::numeric / NULLIF(COUNT(*), 0), 1) as min_pg,
        -- Percentages
        ROUND(SUM(p.fgm)::numeric / NULLIF(SUM(p.fga), 0), 3) as fg_pct,
        ROUND(SUM(p.fgm3)::numeric / NULLIF(SUM(p.fga3), 0), 3) as fg3_pct,
        ROUND(SUM(p.ftm)::numeric / NULLIF(SUM(p.fta), 0), 3) as ft_pct
      FROM exp_player_game_stats p
      JOIN exp_game_box_scores g ON g.id = p.game_box_score_id
      JOIN teams t ON t.name = p.team_name AND t.season = p.season
      WHERE ${whereConditions.join(' AND ')} AND g.is_exhibition = false
      GROUP BY p.player_name, p.player_id, p.team_name, t.team_id, t.conference, t.logo_url, t.primary_color
      HAVING COUNT(*) >= ${parseInt(min_gp) || 0}
    )
    SELECT * FROM player_seasons
    ORDER BY ${sortColumn} ${order} NULLS LAST
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  params.push(parseInt(limit) || 100, parseInt(offset) || 0);

  const result = await pool.query(query, params);

  // Get count
  const countQuery = `
    SELECT COUNT(*) as total FROM (
      SELECT p.player_id
      FROM exp_player_game_stats p
      JOIN exp_game_box_scores g ON g.id = p.game_box_score_id
      JOIN teams t ON t.name = p.team_name AND t.season = p.season
      WHERE ${whereConditions.join(' AND ')} AND g.is_exhibition = false
      GROUP BY p.player_name, p.player_id, p.team_name, t.team_id, t.conference, t.logo_url, t.primary_color
      HAVING COUNT(*) >= ${parseInt(min_gp) || 0}
    ) sub
  `;
  const countResult = await pool.query(countQuery, params.slice(0, -2));

  return {
    players: result.rows,
    total: parseInt(countResult.rows[0].total),
  };
}

module.exports = {
  calculateDynamicStatsFromBoxScores,
  getBoxScoreGamesForTeam,
  getBoxScorePlayerStats,
  getTeamScoringRuns,
};

/**
 * Compute 10-0 scoring runs per team from PBP data.
 * Returns a Map: team_id → { runs_scored, runs_allowed, games }
 *
 * A "10-0 run" = a team scores ≥10 consecutive unanswered points
 * within a single game. We track runs both scored and allowed.
 *
 * @param {Pool} pool
 * @param {string} season
 * @param {string} league
 * @returns {Promise<Map<string, {runs_scored: number, runs_allowed: number, games: number}>>}
 */
async function getTeamScoringRuns(pool, season = DEFAULT_SEASON, league = 'mens') {
  // Get all scoring plays grouped by game, with team mapping
  const result = await pool.query(`
    SELECT
      p.game_box_score_id,
      p.away_score,
      p.home_score,
      p.sequence_number,
      e.away_team_name,
      e.home_team_name
    FROM exp_play_by_play p
    JOIN exp_game_box_scores e ON e.id = p.game_box_score_id
    WHERE p.season = $1 AND p.is_scoring_play = true
      AND e.is_exhibition = false AND e.league = $2
    ORDER BY p.game_box_score_id, p.sequence_number
  `, [season, league]);

  // Build team name → team_id lookup
  const teamLookup = await pool.query(
    'SELECT name, team_id FROM teams WHERE season = $1 AND league = $2',
    [season, league]
  );
  const nameToId = new Map();
  for (const row of teamLookup.rows) {
    nameToId.set(row.name, row.team_id);
  }

  // Process scoring plays per game
  const teamRuns = new Map(); // team_id → { runs_scored, runs_allowed, games }
  const RUN_THRESHOLD = 10;

  let currentGameId = null;
  let prevAway = 0;
  let prevHome = 0;
  let runTeam = null; // 'away' | 'home'
  let runPts = 0;
  let awayTeamName = null;
  let homeTeamName = null;
  let gameRuns = { away: 0, home: 0 }; // runs scored in current game

  const flushGame = () => {
    if (!currentGameId) return;
    const awayId = nameToId.get(awayTeamName);
    const homeId = nameToId.get(homeTeamName);
    if (awayId) {
      if (!teamRuns.has(awayId)) teamRuns.set(awayId, { runs_scored: 0, runs_allowed: 0, games: 0 });
      const t = teamRuns.get(awayId);
      t.runs_scored += gameRuns.away;
      t.runs_allowed += gameRuns.home;
      t.games++;
    }
    if (homeId) {
      if (!teamRuns.has(homeId)) teamRuns.set(homeId, { runs_scored: 0, runs_allowed: 0, games: 0 });
      const t = teamRuns.get(homeId);
      t.runs_scored += gameRuns.home;
      t.runs_allowed += gameRuns.away;
      t.games++;
    }
  };

  for (const play of result.rows) {
    if (play.game_box_score_id !== currentGameId) {
      flushGame();
      currentGameId = play.game_box_score_id;
      prevAway = 0;
      prevHome = 0;
      runTeam = null;
      runPts = 0;
      awayTeamName = play.away_team_name;
      homeTeamName = play.home_team_name;
      gameRuns = { away: 0, home: 0 };
    }

    const awayScored = play.away_score - prevAway;
    const homeScored = play.home_score - prevHome;

    if (awayScored > 0) {
      if (runTeam === 'away') {
        runPts += awayScored;
      } else {
        runTeam = 'away';
        runPts = awayScored;
      }
      if (runPts >= RUN_THRESHOLD) {
        // Count each time we cross a threshold boundary
        const prevTotal = runPts - awayScored;
        if (prevTotal < RUN_THRESHOLD) gameRuns.away++;
      }
    }
    if (homeScored > 0) {
      if (runTeam === 'home') {
        runPts += homeScored;
      } else {
        runTeam = 'home';
        runPts = homeScored;
      }
      if (runPts >= RUN_THRESHOLD) {
        const prevTotal = runPts - homeScored;
        if (prevTotal < RUN_THRESHOLD) gameRuns.home++;
      }
    }

    prevAway = play.away_score;
    prevHome = play.home_score;
  }
  flushGame();

  return teamRuns;
}
