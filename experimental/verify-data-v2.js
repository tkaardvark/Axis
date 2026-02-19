/**
 * Deeper verification — understand the mismatches
 */
require('dotenv').config();
const { pool } = require('../db/pool');

async function verify() {
  const season = '2025-26';

  // 1. Check for duplicate matchups on same date in existing games table
  const dupes = await pool.query(`
    SELECT g.game_date, t.name as team_name, g.opponent_name, COUNT(*) as cnt
    FROM games g
    JOIN teams t ON g.team_id = t.team_id AND t.season = $1
    WHERE g.season = $1
    GROUP BY g.game_date, t.name, g.opponent_name
    HAVING COUNT(*) > 1
    ORDER BY g.game_date
    LIMIT 20
  `, [season]);
  console.log('=== DUPLICATE MATCHUPS IN GAMES TABLE (same team vs same opponent, same date) ===');
  console.log(`Found ${dupes.rows.length} duplicate pairs (showing up to 20):`);
  for (const r of dupes.rows) {
    console.log(`  ${r.game_date} ${r.team_name} vs ${r.opponent_name} (${r.cnt} rows)`);
  }

  // 2. How many game rows in existing are NAIA games (have stats)?
  const naiaGames = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE fgm IS NOT NULL) as has_stats,
      COUNT(*) FILTER (WHERE fgm IS NULL) as no_stats,
      COUNT(*) FILTER (WHERE team_score IS NULL) as no_score,
      COUNT(*) FILTER (WHERE is_exhibition = true) as exhibition,
      COUNT(*) FILTER (WHERE is_naia_game = false) as non_naia
    FROM games WHERE season = $1
  `, [season]);
  console.log('\n=== EXISTING GAMES TABLE BREAKDOWN ===');
  console.log(naiaGames.rows[0]);

  // 3. Deduplicated score comparison — use ROW_NUMBER to pick one match per game row
  const deduped = await pool.query(`
    WITH exp_flat AS (
      SELECT game_date, away_team_name as team, home_team_name as opponent, away_score as team_score, home_score as opp_score
      FROM exp_game_box_scores WHERE season = $1
      UNION ALL
      SELECT game_date, home_team_name as team, away_team_name as opponent, home_score as team_score, away_score as opp_score
      FROM exp_game_box_scores WHERE season = $1
    ),
    matched AS (
      SELECT 
        g.id, g.game_date, t.name as team_name, g.opponent_name,
        g.team_score as g_score, g.opponent_score as g_opp,
        ef.team_score as e_score, ef.opp_score as e_opp,
        ROW_NUMBER() OVER (PARTITION BY g.id ORDER BY ABS(g.team_score - ef.team_score) + ABS(g.opponent_score - ef.opp_score)) as rn
      FROM games g
      JOIN teams t ON g.team_id = t.team_id AND t.season = $1
      JOIN exp_flat ef ON g.game_date = ef.game_date 
        AND t.name = ef.team 
        AND g.opponent_name = ef.opponent
      WHERE g.season = $1
        AND g.team_score IS NOT NULL
    )
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE g_score = e_score AND g_opp = e_opp) as exact_match,
      COUNT(*) FILTER (WHERE g_score != e_score OR g_opp != e_opp) as mismatch
    FROM matched
    WHERE rn = 1
  `, [season]);
  console.log('\n=== DEDUPLICATED SCORE MATCH (best match per game row) ===');
  console.log(deduped.rows[0]);
  const d = deduped.rows[0];
  console.log(`Match rate: ${(d.exact_match / d.total * 100).toFixed(1)}%`);

  // 4. Show actual mismatches (deduplicated)
  const mismatches = await pool.query(`
    WITH exp_flat AS (
      SELECT game_date, away_team_name as team, home_team_name as opponent, away_score as team_score, home_score as opp_score
      FROM exp_game_box_scores WHERE season = $1
      UNION ALL
      SELECT game_date, home_team_name as team, away_team_name as opponent, home_score as team_score, away_score as opp_score
      FROM exp_game_box_scores WHERE season = $1
    ),
    matched AS (
      SELECT 
        g.id, g.game_date, t.name as team_name, g.opponent_name,
        g.team_score as g_score, g.opponent_score as g_opp,
        ef.team_score as e_score, ef.opp_score as e_opp,
        ROW_NUMBER() OVER (PARTITION BY g.id ORDER BY ABS(g.team_score - ef.team_score) + ABS(g.opponent_score - ef.opp_score)) as rn
      FROM games g
      JOIN teams t ON g.team_id = t.team_id AND t.season = $1
      JOIN exp_flat ef ON g.game_date = ef.game_date 
        AND t.name = ef.team 
        AND g.opponent_name = ef.opponent
      WHERE g.season = $1
        AND g.team_score IS NOT NULL
    )
    SELECT game_date, team_name, opponent_name, g_score, e_score, g_opp, e_opp
    FROM matched
    WHERE rn = 1 AND (g_score != e_score OR g_opp != e_opp)
    ORDER BY game_date
    LIMIT 30
  `, [season]);
  console.log('\n=== ACTUAL MISMATCHES (after dedup) ===');
  for (const r of mismatches.rows) {
    console.log(`  ${r.game_date} ${r.team_name} ${r.g_score}(exp:${r.e_score}) vs ${r.opponent_name} ${r.g_opp}(exp:${r.e_opp})`);
  }

  // 5. Deduplicated stat comparison
  const statMatch = await pool.query(`
    WITH exp_flat AS (
      SELECT game_date, away_team_name as team, home_team_name as opponent, 
        away_score as team_score, home_score as opp_score,
        away_fgm as fgm, away_fga as fga, away_reb as reb, away_ast as ast, away_stl as stl, away_blk as blk, away_to as tos
      FROM exp_game_box_scores WHERE season = $1
      UNION ALL
      SELECT game_date, home_team_name as team, away_team_name as opponent, 
        home_score as team_score, away_score as opp_score,
        home_fgm as fgm, home_fga as fga, home_reb as reb, home_ast as ast, home_stl as stl, home_blk as blk, home_to as tos
      FROM exp_game_box_scores WHERE season = $1
    ),
    matched AS (
      SELECT 
        g.id,
        g.team_score as g_score, ef.team_score as e_score,
        g.fgm as g_fgm, ef.fgm as e_fgm,
        g.fga as g_fga, ef.fga as e_fga,
        g.treb as g_reb, ef.reb as e_reb,
        g.ast as g_ast, ef.ast as e_ast,
        g.stl as g_stl, ef.stl as e_stl,
        g.blk as g_blk, ef.blk as e_blk,
        g.turnovers as g_to, ef.tos as e_to,
        ROW_NUMBER() OVER (PARTITION BY g.id ORDER BY ABS(g.team_score - ef.team_score) + ABS(COALESCE(g.opponent_score,0) - ef.opp_score)) as rn
      FROM games g
      JOIN teams t ON g.team_id = t.team_id AND t.season = $1
      JOIN exp_flat ef ON g.game_date = ef.game_date 
        AND t.name = ef.team 
        AND g.opponent_name = ef.opponent
      WHERE g.season = $1
        AND g.team_score IS NOT NULL
        AND g.fgm IS NOT NULL
    )
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE g_score = e_score) as score_match,
      COUNT(*) FILTER (WHERE g_fgm = e_fgm) as fgm_match,
      COUNT(*) FILTER (WHERE g_fga = e_fga) as fga_match,
      COUNT(*) FILTER (WHERE g_reb = e_reb) as reb_match,
      COUNT(*) FILTER (WHERE g_ast = e_ast) as ast_match,
      COUNT(*) FILTER (WHERE g_stl = e_stl) as stl_match,
      COUNT(*) FILTER (WHERE g_blk = e_blk) as blk_match,
      COUNT(*) FILTER (WHERE g_to = e_to) as to_match
    FROM matched
    WHERE rn = 1
  `, [season]);
  console.log('\n=== DEDUPLICATED STAT MATCH RATES ===');
  const s = statMatch.rows[0];
  const pct = (n) => (n / s.total * 100).toFixed(1);
  console.log(`Total matched rows: ${s.total}`);
  console.log(`Score: ${s.score_match}/${s.total} (${pct(s.score_match)}%)`);
  console.log(`FGM:   ${s.fgm_match}/${s.total} (${pct(s.fgm_match)}%)`);
  console.log(`FGA:   ${s.fga_match}/${s.total} (${pct(s.fga_match)}%)`);
  console.log(`REB:   ${s.reb_match}/${s.total} (${pct(s.reb_match)}%)`);
  console.log(`AST:   ${s.ast_match}/${s.total} (${pct(s.ast_match)}%)`);
  console.log(`STL:   ${s.stl_match}/${s.total} (${pct(s.stl_match)}%)`);
  console.log(`BLK:   ${s.blk_match}/${s.total} (${pct(s.blk_match)}%)`);
  console.log(`TO:    ${s.to_match}/${s.total} (${pct(s.to_match)}%)`);

  // 6. What does the exp table have that games doesn't? (extra games in exp)
  const expOnly = await pool.query(`
    SELECT COUNT(*) as count
    FROM exp_game_box_scores e
    WHERE e.season = $1
    AND NOT EXISTS (
      SELECT 1 FROM games g
      JOIN teams t ON g.team_id = t.team_id AND t.season = $1
      WHERE g.season = $1
        AND g.game_date = e.game_date
        AND (t.name = e.away_team_name OR t.name = e.home_team_name)
    )
  `, [season]);
  console.log('\n=== GAMES IN EXP BUT NOT IN EXISTING ===');
  console.log('Count:', expOnly.rows[0].count);

  // Sample of exp-only games
  const expOnlySample = await pool.query(`
    SELECT e.game_date, e.away_team_name, e.away_score, e.home_team_name, e.home_score, e.is_exhibition, e.is_conference
    FROM exp_game_box_scores e
    WHERE e.season = $1
    AND NOT EXISTS (
      SELECT 1 FROM games g
      JOIN teams t ON g.team_id = t.team_id AND t.season = $1
      WHERE g.season = $1
        AND g.game_date = e.game_date
        AND (t.name = e.away_team_name OR t.name = e.home_team_name)
    )
    ORDER BY e.game_date
    LIMIT 15
  `, [season]);
  if (expOnlySample.rows.length > 0) {
    console.log('Sample:');
    for (const r of expOnlySample.rows) {
      const flags = [];
      if (r.is_exhibition) flags.push('EXH');
      if (r.is_conference) flags.push('CONF');
      console.log(`  ${r.game_date} ${r.away_team_name} ${r.away_score} @ ${r.home_team_name} ${r.home_score} ${flags.join(',') || ''}`);
    }
  }

  await pool.end();
}

verify().catch(e => { console.error(e); process.exit(1); });
