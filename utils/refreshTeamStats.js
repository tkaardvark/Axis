/**
 * Refresh Team Stats from Box Scores
 * 
 * Aggregates stats from exp_game_box_scores and updates team_ratings table.
 * Called after box score imports to keep pre-calculated stats fresh.
 * 
 * Usage:
 *   const { refreshTeamStats } = require('./utils/refreshTeamStats');
 *   await refreshTeamStats('2025-26', 'mens');
 */

require('dotenv').config();
const { pool } = require('../db/pool');

/**
 * Refresh team stats from box scores for a given season/league
 * @param {string} season - Season string (e.g., '2025-26')
 * @param {string} league - 'mens' or 'womens'
 */
async function refreshTeamStats(season, league) {
  const startTime = Date.now();
  console.log(`Refreshing team stats from box scores (${league} ${season})...`);

  // Build the aggregation query
  const query = `
    WITH flat_games AS (
      -- Away team perspective
      SELECT
        t.team_id,
        e.game_date,
        e.away_score as team_score,
        e.home_score as opponent_score,
        e.forfeit_team_id,
        -- Team stats
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
        -- Game flow
        e.lead_changes, e.ties,
        e.away_largest_lead as largest_lead,
        e.home_largest_lead as opp_largest_lead,
        -- Halftime
        (e.away_period_scores->>0)::int as team_half1_score,
        (e.home_period_scores->>0)::int as opp_half1_score,
        -- Opponent stats
        e.home_fgm as opp_fgm, e.home_fga as opp_fga,
        e.home_fgm3 as opp_fgm3, e.home_fga3 as opp_fga3,
        e.home_ftm as opp_ftm, e.home_fta as opp_fta,
        e.home_oreb as opp_oreb, e.home_dreb as opp_dreb, e.home_reb as opp_treb,
        e.home_ast as opp_ast,
        e.home_points_in_paint as opp_pts_paint,
        e.home_fastbreak_points as opp_pts_fastbreak,
        e.home_points_off_turnovers as opp_pts_turnovers
      FROM exp_game_box_scores e
      JOIN teams t ON t.team_id = e.away_team_id AND t.season = e.season
      WHERE e.season = $1 AND t.league = $2 AND t.is_excluded = FALSE
        AND e.is_exhibition = false
        AND e.away_score IS NOT NULL AND e.home_score IS NOT NULL

      UNION ALL

      -- Home team perspective
      SELECT
        t.team_id,
        e.game_date,
        e.home_score as team_score,
        e.away_score as opponent_score,
        e.forfeit_team_id,
        -- Team stats
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
        -- Game flow
        e.lead_changes, e.ties,
        e.home_largest_lead as largest_lead,
        e.away_largest_lead as opp_largest_lead,
        -- Halftime
        (e.home_period_scores->>0)::int as team_half1_score,
        (e.away_period_scores->>0)::int as opp_half1_score,
        -- Opponent stats
        e.away_fgm as opp_fgm, e.away_fga as opp_fga,
        e.away_fgm3 as opp_fgm3, e.away_fga3 as opp_fga3,
        e.away_ftm as opp_ftm, e.away_fta as opp_fta,
        e.away_oreb as opp_oreb, e.away_dreb as opp_dreb, e.away_reb as opp_treb,
        e.away_ast as opp_ast,
        e.away_points_in_paint as opp_pts_paint,
        e.away_fastbreak_points as opp_pts_fastbreak,
        e.away_points_off_turnovers as opp_pts_turnovers
      FROM exp_game_box_scores e
      JOIN teams t ON t.team_id = e.home_team_id AND t.season = e.season
      WHERE e.season = $1 AND t.league = $2 AND t.is_excluded = FALSE
        AND e.is_exhibition = false
        AND e.away_score IS NOT NULL AND e.home_score IS NOT NULL
    ),
    game_stats AS (
      SELECT
        team_id,
        COUNT(*) as games_played,
        SUM(CASE WHEN (forfeit_team_id IS NOT NULL AND forfeit_team_id != team_id) OR (forfeit_team_id IS NULL AND team_score > opponent_score) THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN forfeit_team_id = team_id OR (forfeit_team_id IS NULL AND team_score < opponent_score) THEN 1 ELSE 0 END) as losses,
        -- Points
        AVG(team_score) as ppg,
        AVG(opponent_score) as papg,
        -- Shooting totals
        SUM(fga) as total_fga,
        SUM(fgm) as total_fgm,
        SUM(fga3) as total_fga3,
        SUM(fgm3) as total_fgm3,
        SUM(fta) as total_fta,
        SUM(ftm) as total_ftm,
        SUM(COALESCE(oreb, 0)) as total_oreb,
        SUM(COALESCE(dreb, 0)) as total_dreb,
        SUM(COALESCE(treb, 0)) as total_treb,
        SUM(COALESCE(ast, 0)) as total_ast,
        SUM(COALESCE(turnovers, 0)) as total_to,
        SUM(COALESCE(stl, 0)) as total_stl,
        SUM(COALESCE(blk, 0)) as total_blk,
        SUM(COALESCE(pf, 0)) as total_pf,
        SUM(COALESCE(pts_paint, 0)) as total_pts_paint,
        SUM(COALESCE(pts_fastbreak, 0)) as total_pts_fastbreak,
        SUM(COALESCE(pts_turnovers, 0)) as total_pts_turnovers,
        SUM(COALESCE(pts_bench, 0)) as total_pts_bench,
        SUM(COALESCE(second_chance_pts, 0)) as total_second_chance,
        SUM(COALESCE(opp_second_chance_pts, 0)) as total_opp_second_chance,
        -- Opponent totals
        SUM(opp_fga) as total_opp_fga,
        SUM(opp_fgm) as total_opp_fgm,
        SUM(opp_fga3) as total_opp_fga3,
        SUM(opp_fgm3) as total_opp_fgm3,
        SUM(opp_fta) as total_opp_fta,
        SUM(opp_ftm) as total_opp_ftm,
        SUM(COALESCE(opp_oreb, 0)) as total_opp_oreb,
        SUM(COALESCE(opp_dreb, 0)) as total_opp_dreb,
        SUM(COALESCE(opp_treb, 0)) as total_opp_treb,
        SUM(COALESCE(opp_ast, 0)) as total_opp_ast,
        SUM(COALESCE(opp_pts_paint, 0)) as total_opp_pts_paint,
        SUM(COALESCE(opp_pts_fastbreak, 0)) as total_opp_pts_fastbreak,
        SUM(COALESCE(opp_pts_turnovers, 0)) as total_opp_pts_turnovers,
        -- Game flow
        AVG(COALESCE(lead_changes, 0)) as avg_lead_changes,
        AVG(COALESCE(ties, 0)) as avg_ties,
        AVG(COALESCE(largest_lead, 0)) as avg_largest_lead,
        AVG(COALESCE(opp_largest_lead, 0)) as avg_opp_largest_lead,
        -- Close games (within 5 points) - exclude forfeits (artificial 2-0 scores)
        SUM(CASE WHEN forfeit_team_id IS NULL AND ABS(team_score - opponent_score) <= 5 AND team_score > opponent_score THEN 1 ELSE 0 END) as close_wins,
        SUM(CASE WHEN forfeit_team_id IS NULL AND ABS(team_score - opponent_score) <= 5 AND team_score < opponent_score THEN 1 ELSE 0 END) as close_losses,
        -- Blowouts (15+ margin) - exclude forfeits
        SUM(CASE WHEN forfeit_team_id IS NULL AND team_score - opponent_score >= 15 THEN 1 ELSE 0 END) as blowout_wins,
        SUM(CASE WHEN forfeit_team_id IS NULL AND opponent_score - team_score >= 15 THEN 1 ELSE 0 END) as blowout_losses,
        -- Leading at halftime - exclude forfeits
        SUM(CASE WHEN forfeit_team_id IS NULL AND team_half1_score > opp_half1_score AND team_score > opponent_score THEN 1 ELSE 0 END) as half_lead_wins,
        SUM(CASE WHEN forfeit_team_id IS NULL AND team_half1_score > opp_half1_score THEN 1 ELSE 0 END) as half_lead_games,
        -- Comebacks - exclude forfeits
        SUM(CASE WHEN forfeit_team_id IS NULL AND team_half1_score < opp_half1_score AND team_score > opponent_score THEN 1 ELSE 0 END) as comeback_wins,
        SUM(CASE WHEN forfeit_team_id IS NULL AND team_half1_score < opp_half1_score THEN 1 ELSE 0 END) as trailing_half_games
      FROM flat_games
      GROUP BY team_id
    ),
    calculated AS (
      SELECT
        gs.team_id,
        gs.games_played,
        -- Per-game stats
        ROUND((gs.total_ast::float / NULLIF(gs.games_played, 0))::numeric, 1) as ast_per_game,
        ROUND((gs.total_to::float / NULLIF(gs.games_played, 0))::numeric, 1) as to_per_game,
        ROUND((gs.total_treb::float / NULLIF(gs.games_played, 0))::numeric, 1) as reb_per_game,
        ROUND((gs.total_oreb::float / NULLIF(gs.games_played, 0))::numeric, 1) as oreb_per_game,
        ROUND((gs.total_dreb::float / NULLIF(gs.games_played, 0))::numeric, 1) as dreb_per_game,
        ROUND((gs.total_fgm::float / NULLIF(gs.games_played, 0))::numeric, 1) as fgm_per_game,
        ROUND((gs.total_fgm3::float / NULLIF(gs.games_played, 0))::numeric, 1) as fgm3_per_game,
        ROUND((gs.total_ftm::float / NULLIF(gs.games_played, 0))::numeric, 1) as ftm_per_game,
        ROUND((gs.total_pf::float / NULLIF(gs.games_played, 0))::numeric, 1) as pf_per_game,
        ROUND((gs.total_stl::float / NULLIF(gs.games_played, 0))::numeric, 1) as stl_per_game,
        ROUND((gs.total_blk::float / NULLIF(gs.games_played, 0))::numeric, 1) as blk_per_game,
        -- Paint/fastbreak
        ROUND((gs.total_pts_paint::float / NULLIF(gs.games_played, 0))::numeric, 1) as pts_paint_per_game,
        ROUND((gs.total_pts_fastbreak::float / NULLIF(gs.games_played, 0))::numeric, 1) as pts_fastbreak_per_game,
        ROUND((gs.total_pts_turnovers::float / NULLIF(gs.games_played, 0))::numeric, 1) as pts_off_to_per_game,
        ROUND((gs.total_pts_bench::float / NULLIF(gs.games_played, 0))::numeric, 1) as pts_bench_per_game,
        -- Opponent stats
        ROUND((gs.total_opp_ast::float / NULLIF(gs.games_played, 0))::numeric, 1) as opp_ast_per_game,
        ROUND((gs.total_opp_treb::float / NULLIF(gs.games_played, 0))::numeric, 1) as opp_reb_per_game,
        ROUND((gs.total_opp_pts_paint::float / NULLIF(gs.games_played, 0))::numeric, 1) as opp_pts_paint_per_game,
        ROUND((gs.total_opp_pts_fastbreak::float / NULLIF(gs.games_played, 0))::numeric, 1) as opp_pts_fastbreak_per_game,
        ROUND((gs.total_opp_pts_turnovers::float / NULLIF(gs.games_played, 0))::numeric, 1) as opp_pts_off_to_per_game,
        -- Game flow
        ROUND(gs.avg_lead_changes::numeric, 1) as lead_changes_per_game,
        ROUND(gs.avg_ties::numeric, 1) as ties_per_game,
        ROUND(gs.avg_largest_lead::numeric, 1) as avg_largest_lead,
        ROUND(gs.avg_opp_largest_lead::numeric, 1) as avg_opp_largest_lead,
        ROUND((gs.total_second_chance::float / NULLIF(gs.games_played, 0))::numeric, 1) as second_chance_per_game,
        ROUND((gs.total_opp_second_chance::float / NULLIF(gs.games_played, 0))::numeric, 1) as opp_second_chance_per_game,
        -- Close/blowout
        gs.close_wins::int,
        gs.close_losses::int,
        gs.blowout_wins::int,
        gs.blowout_losses::int,
        -- Half lead
        ROUND(CASE WHEN gs.half_lead_games > 0 THEN gs.half_lead_wins::float / gs.half_lead_games ELSE NULL END::numeric, 3) as half_lead_win_pct,
        gs.half_lead_wins::int,
        gs.half_lead_games::int,
        -- Comeback
        ROUND(CASE WHEN gs.trailing_half_games > 0 THEN gs.comeback_wins::float / gs.trailing_half_games ELSE NULL END::numeric, 3) as comeback_win_pct,
        gs.comeback_wins::int,
        gs.trailing_half_games::int,
        -- EPR: (Possessions + OREB - TO) / Possessions = (FGA + 0.475*FTA) / (FGA - OREB + TO + 0.475*FTA)
        ROUND(CASE WHEN (gs.total_fga - gs.total_oreb + gs.total_to + 0.475 * gs.total_fta) > 0
          THEN (gs.total_fga + 0.475 * gs.total_fta)::float / (gs.total_fga - gs.total_oreb + gs.total_to + 0.475 * gs.total_fta)
          ELSE 1 END::numeric, 3) as effective_possession_ratio
      FROM game_stats gs
    )
    SELECT * FROM calculated
  `;

  try {
    const result = await pool.query(query, [season, league]);
    const stats = result.rows;

    if (stats.length === 0) {
      console.log('  No teams found with box score data');
      return 0;
    }

    // Get today's date for date_calculated
    const today = new Date().toISOString().split('T')[0];

    // Batch update all teams in a single query using a VALUES list
    const valueRows = [];
    const params = [season];
    let paramIdx = 2;

    for (const team of stats) {
      const fields = [
        team.team_id, team.ast_per_game, team.to_per_game, team.reb_per_game,
        team.oreb_per_game, team.dreb_per_game, team.fgm_per_game, team.fgm3_per_game,
        team.ftm_per_game, team.pf_per_game, team.stl_per_game, team.blk_per_game,
        team.pts_paint_per_game, team.pts_fastbreak_per_game, team.pts_off_to_per_game,
        team.pts_bench_per_game, team.opp_ast_per_game, team.opp_reb_per_game,
        team.opp_pts_paint_per_game, team.opp_pts_fastbreak_per_game, team.opp_pts_off_to_per_game,
        team.lead_changes_per_game, team.ties_per_game, team.avg_largest_lead,
        team.avg_opp_largest_lead, team.second_chance_per_game, team.opp_second_chance_per_game,
        team.close_wins, team.close_losses, team.blowout_wins, team.blowout_losses,
        team.half_lead_win_pct, team.half_lead_wins, team.half_lead_games,
        team.comeback_win_pct, team.comeback_wins, team.trailing_half_games,
        team.effective_possession_ratio,
      ];
      const placeholders = fields.map(() => `$${paramIdx++}`);
      valueRows.push(`(${placeholders.join(', ')})`);
      params.push(...fields);
    }

    const updateResult = await pool.query(`
      UPDATE team_ratings AS tr SET
        ast_per_game = v.ast_per_game,
        to_per_game = v.to_per_game,
        reb_per_game = v.reb_per_game,
        oreb_per_game = v.oreb_per_game,
        dreb_per_game = v.dreb_per_game,
        fgm_per_game = v.fgm_per_game,
        fgm3_per_game = v.fgm3_per_game,
        ftm_per_game = v.ftm_per_game,
        pf_per_game = v.pf_per_game,
        stl_per_game = v.stl_per_game,
        blk_per_game = v.blk_per_game,
        pts_paint_per_game = v.pts_paint_per_game,
        pts_fastbreak_per_game = v.pts_fastbreak_per_game,
        pts_off_to_per_game = v.pts_off_to_per_game,
        pts_bench_per_game = v.pts_bench_per_game,
        opp_ast_per_game = v.opp_ast_per_game,
        opp_reb_per_game = v.opp_reb_per_game,
        opp_pts_paint_per_game = v.opp_pts_paint_per_game,
        opp_pts_fastbreak_per_game = v.opp_pts_fastbreak_per_game,
        opp_pts_off_to_per_game = v.opp_pts_off_to_per_game,
        lead_changes_per_game = v.lead_changes_per_game,
        ties_per_game = v.ties_per_game,
        avg_largest_lead = v.avg_largest_lead,
        avg_opp_largest_lead = v.avg_opp_largest_lead,
        second_chance_per_game = v.second_chance_per_game,
        opp_second_chance_per_game = v.opp_second_chance_per_game,
        close_wins = v.close_wins,
        close_losses = v.close_losses,
        blowout_wins = v.blowout_wins,
        blowout_losses = v.blowout_losses,
        half_lead_win_pct = v.half_lead_win_pct,
        half_lead_wins = v.half_lead_wins,
        half_lead_games = v.half_lead_games,
        comeback_win_pct = v.comeback_win_pct,
        comeback_wins = v.comeback_wins,
        trailing_half_games = v.trailing_half_games,
        effective_possession_ratio = v.effective_possession_ratio,
        boxscore_updated_at = CURRENT_TIMESTAMP
      FROM (VALUES ${valueRows.join(',\n        ')}) AS v(
        team_id, ast_per_game, to_per_game, reb_per_game,
        oreb_per_game, dreb_per_game, fgm_per_game, fgm3_per_game,
        ftm_per_game, pf_per_game, stl_per_game, blk_per_game,
        pts_paint_per_game, pts_fastbreak_per_game, pts_off_to_per_game,
        pts_bench_per_game, opp_ast_per_game, opp_reb_per_game,
        opp_pts_paint_per_game, opp_pts_fastbreak_per_game, opp_pts_off_to_per_game,
        lead_changes_per_game, ties_per_game, avg_largest_lead,
        avg_opp_largest_lead, second_chance_per_game, opp_second_chance_per_game,
        close_wins, close_losses, blowout_wins, blowout_losses,
        half_lead_win_pct, half_lead_wins, half_lead_games,
        comeback_win_pct, comeback_wins, trailing_half_games,
        effective_possession_ratio
      )
      WHERE tr.team_id = v.team_id
        AND tr.season = $1
        AND tr.date_calculated = (
          SELECT MAX(date_calculated) FROM team_ratings
          WHERE team_id = tr.team_id AND season = $1
        )
    `, params);

    const updated = updateResult.rowCount;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`  Updated ${updated} teams in ${elapsed}s`);
    return updated;

  } catch (err) {
    console.error('Error refreshing team stats:', err.message);
    throw err;
  }
}

// Allow running standalone
if (require.main === module) {
  const args = process.argv.slice(2);
  const seasonIdx = args.indexOf('--season');
  const leagueIdx = args.indexOf('--league');
  
  const season = seasonIdx !== -1 && args[seasonIdx + 1] ? args[seasonIdx + 1] : '2025-26';
  const league = leagueIdx !== -1 && args[leagueIdx + 1] ? args[leagueIdx + 1] : 'mens';

  refreshTeamStats(season, league)
    .then(() => pool.end())
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { refreshTeamStats };
