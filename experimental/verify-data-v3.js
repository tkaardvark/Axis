/**
 * Final verification — exclude duplicate matchups to get true accuracy
 */
require('dotenv').config();
const { pool } = require('../db/pool');

async function verify() {
  const season = '2025-26';

  // Only compare game rows where (team, opponent, date) is unique in BOTH tables
  const cleanMatch = await pool.query(`
    WITH 
    -- Find unique matchups in existing games table (no duplicates)
    unique_games AS (
      SELECT g.id, g.game_date, t.name as team_name, g.opponent_name, 
             g.team_score, g.opponent_score, g.fgm, g.fga, g.treb, g.ast, g.stl, g.blk, g.turnovers
      FROM games g
      JOIN teams t ON g.team_id = t.team_id AND t.season = $1
      WHERE g.season = $1 AND g.team_score IS NOT NULL
      AND (t.name, g.opponent_name, g.game_date) IN (
        SELECT t2.name, g2.opponent_name, g2.game_date
        FROM games g2
        JOIN teams t2 ON g2.team_id = t2.team_id AND t2.season = $1
        WHERE g2.season = $1
        GROUP BY t2.name, g2.opponent_name, g2.game_date
        HAVING COUNT(*) = 1
      )
    ),
    -- Flatten exp table
    exp_flat AS (
      SELECT game_date, away_team_name as team, home_team_name as opponent, 
             away_score as team_score, home_score as opp_score,
             away_fgm as fgm, away_fga as fga, away_reb as reb, away_ast as ast, away_stl as stl, away_blk as blk, away_to as tos
      FROM exp_game_box_scores WHERE season = $1
      UNION ALL
      SELECT game_date, home_team_name as team, away_team_name as opponent, 
             home_score as team_score, away_score as opp_score,
             home_fgm as fgm, home_fga as fga, home_reb as reb, home_ast as ast, home_stl as stl, home_blk as blk, home_to as tos
      FROM exp_game_box_scores WHERE season = $1
    )
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE ug.team_score = ef.team_score AND ug.opponent_score = ef.opp_score) as score_match,
      COUNT(*) FILTER (WHERE ug.team_score != ef.team_score OR ug.opponent_score != ef.opp_score) as score_mismatch,
      COUNT(*) FILTER (WHERE ug.fgm IS NOT NULL AND ug.fgm = ef.fgm) as fgm_match,
      COUNT(*) FILTER (WHERE ug.fgm IS NOT NULL AND ug.fgm != ef.fgm) as fgm_mismatch,
      COUNT(*) FILTER (WHERE ug.fga IS NOT NULL AND ug.fga = ef.fga) as fga_match,
      COUNT(*) FILTER (WHERE ug.treb IS NOT NULL AND ug.treb = ef.reb) as reb_match,
      COUNT(*) FILTER (WHERE ug.ast IS NOT NULL AND ug.ast = ef.ast) as ast_match,
      COUNT(*) FILTER (WHERE ug.stl IS NOT NULL AND ug.stl = ef.stl) as stl_match,
      COUNT(*) FILTER (WHERE ug.blk IS NOT NULL AND ug.blk = ef.blk) as blk_match,
      COUNT(*) FILTER (WHERE ug.turnovers IS NOT NULL AND ug.turnovers = ef.tos) as to_match
    FROM unique_games ug
    JOIN exp_flat ef ON ug.game_date = ef.game_date 
      AND ug.team_name = ef.team 
      AND ug.opponent_name = ef.opponent
  `, [season]);

  const s = cleanMatch.rows[0];
  const pct = (n) => (n / s.total * 100).toFixed(1);
  
  console.log('=== CLEAN MATCH (unique matchups only, excluding duplicates) ===');
  console.log(`Total joined: ${s.total}`);
  console.log(`Score: ${s.score_match}/${s.total} (${pct(s.score_match)}%) | mismatches: ${s.score_mismatch}`);
  console.log(`FGM:   ${s.fgm_match}/${s.total} (${pct(s.fgm_match)}%)`);
  console.log(`FGA:   ${s.fga_match}/${s.total} (${pct(s.fga_match)}%)`);
  console.log(`REB:   ${s.reb_match}/${s.total} (${pct(s.reb_match)}%)`);
  console.log(`AST:   ${s.ast_match}/${s.total} (${pct(s.ast_match)}%)`);
  console.log(`STL:   ${s.stl_match}/${s.total} (${pct(s.stl_match)}%)`);
  console.log(`BLK:   ${s.blk_match}/${s.total} (${pct(s.blk_match)}%)`);
  console.log(`TO:    ${s.to_match}/${s.total} (${pct(s.to_match)}%)`);

  // Show the actual mismatches
  const mismatches = await pool.query(`
    WITH 
    unique_games AS (
      SELECT g.id, g.game_date, t.name as team_name, g.opponent_name, 
             g.team_score, g.opponent_score
      FROM games g
      JOIN teams t ON g.team_id = t.team_id AND t.season = $1
      WHERE g.season = $1 AND g.team_score IS NOT NULL
      AND (t.name, g.opponent_name, g.game_date) IN (
        SELECT t2.name, g2.opponent_name, g2.game_date
        FROM games g2
        JOIN teams t2 ON g2.team_id = t2.team_id AND t2.season = $1
        WHERE g2.season = $1
        GROUP BY t2.name, g2.opponent_name, g2.game_date
        HAVING COUNT(*) = 1
      )
    ),
    exp_flat AS (
      SELECT game_date, away_team_name as team, home_team_name as opponent, 
             away_score as team_score, home_score as opp_score
      FROM exp_game_box_scores WHERE season = $1
      UNION ALL
      SELECT game_date, home_team_name as team, away_team_name as opponent, 
             home_score as team_score, away_score as opp_score
      FROM exp_game_box_scores WHERE season = $1
    )
    SELECT ug.game_date, ug.team_name, ug.opponent_name,
           ug.team_score as g_score, ef.team_score as e_score,
           ug.opponent_score as g_opp, ef.opp_score as e_opp
    FROM unique_games ug
    JOIN exp_flat ef ON ug.game_date = ef.game_date 
      AND ug.team_name = ef.team 
      AND ug.opponent_name = ef.opponent
    WHERE ug.team_score != ef.team_score OR ug.opponent_score != ef.opp_score
    ORDER BY ug.game_date
    LIMIT 30
  `, [season]);

  console.log(`\n=== ${mismatches.rows.length} ACTUAL MISMATCHES (showing up to 30): ===`);
  for (const r of mismatches.rows) {
    console.log(`  ${r.game_date} ${r.team_name} ${r.g_score}(exp:${r.e_score}) vs ${r.opponent_name} ${r.g_opp}(exp:${r.e_opp})`);
  }

  // Count total mismatches
  const totalMismatch = await pool.query(`
    WITH 
    unique_games AS (
      SELECT g.id, g.game_date, t.name as team_name, g.opponent_name, 
             g.team_score, g.opponent_score
      FROM games g
      JOIN teams t ON g.team_id = t.team_id AND t.season = $1
      WHERE g.season = $1 AND g.team_score IS NOT NULL
      AND (t.name, g.opponent_name, g.game_date) IN (
        SELECT t2.name, g2.opponent_name, g2.game_date
        FROM games g2
        JOIN teams t2 ON g2.team_id = t2.team_id AND t2.season = $1
        WHERE g2.season = $1
        GROUP BY t2.name, g2.opponent_name, g2.game_date
        HAVING COUNT(*) = 1
      )
    ),
    exp_flat AS (
      SELECT game_date, away_team_name as team, home_team_name as opponent, 
             away_score as team_score, home_score as opp_score
      FROM exp_game_box_scores WHERE season = $1
      UNION ALL
      SELECT game_date, home_team_name as team, away_team_name as opponent, 
             home_score as team_score, away_score as opp_score
      FROM exp_game_box_scores WHERE season = $1
    )
    SELECT COUNT(*) as total
    FROM unique_games ug
    JOIN exp_flat ef ON ug.game_date = ef.game_date 
      AND ug.team_name = ef.team 
      AND ug.opponent_name = ef.opponent
    WHERE ug.team_score != ef.team_score OR ug.opponent_score != ef.opp_score
  `, [season]);
  console.log(`\nTotal mismatches: ${totalMismatch.rows[0].total}`);

  await pool.end();
}

verify().catch(e => { console.error(e); process.exit(1); });
