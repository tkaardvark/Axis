/**
 * Verify experimental box score data against existing games table
 * 
 * games table: 1 row per team per game, team_id -> teams.name, opponent_name stored directly
 * exp_game_box_scores: 1 row per game, away_team_name/home_team_name
 */
require('dotenv').config();
const { pool } = require('../db/pool');

async function verify() {
  const season = '2025-26';

  // 1. Row counts
  const expCount = await pool.query('SELECT COUNT(*) FROM exp_game_box_scores WHERE season = $1', [season]);
  const gamesCount = await pool.query('SELECT COUNT(*) FROM games WHERE season = $1', [season]);
  const gamesDistinct = await pool.query('SELECT COUNT(DISTINCT game_id) FROM games WHERE season = $1', [season]);

  console.log('=== ROW COUNTS ===');
  console.log('exp_game_box_scores:', expCount.rows[0].count);
  console.log('games (rows):', gamesCount.rows[0].count, '(2 rows per game)');
  console.log('games (distinct games):', gamesDistinct.rows[0].count);

  // 2. Date range comparison
  const expDates = await pool.query('SELECT MIN(game_date) as first, MAX(game_date) as last FROM exp_game_box_scores WHERE season = $1', [season]);
  const gamesDates = await pool.query('SELECT MIN(game_date) as first, MAX(game_date) as last FROM games WHERE season = $1', [season]);
  console.log('\n=== DATE RANGES ===');
  console.log('exp:', expDates.rows[0].first, 'to', expDates.rows[0].last);
  console.log('games:', gamesDates.rows[0].first, 'to', gamesDates.rows[0].last);

  // 3. Game type breakdown (exp only)
  const types = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE is_conference) as conference,
      COUNT(*) FILTER (WHERE is_division) as division,
      COUNT(*) FILTER (WHERE is_exhibition) as exhibition,
      COUNT(*) FILTER (WHERE is_postseason) as postseason,
      COUNT(*) FILTER (WHERE NOT is_conference AND NOT is_division AND NOT is_exhibition AND NOT is_postseason) as non_conference
    FROM exp_game_box_scores WHERE season = $1
  `, [season]);
  console.log('\n=== GAME TYPE BREAKDOWN (exp only) ===');
  console.log(types.rows[0]);

  // 4. Player stats counts
  const expPlayers = await pool.query('SELECT COUNT(*) FROM exp_player_game_stats WHERE season = $1', [season]);
  const playersCount = await pool.query('SELECT COUNT(*) FROM players WHERE season = $1', [season]);
  console.log('\n=== PLAYER STATS ===');
  console.log('exp_player_game_stats (per-game lines):', expPlayers.rows[0].count);
  console.log('players (season aggregates):', playersCount.rows[0].count);

  // 5. PBP count
  const pbp = await pool.query('SELECT COUNT(*) FROM exp_play_by_play WHERE season = $1', [season]);
  console.log('exp_play_by_play events:', pbp.rows[0].count);

  // 6. Score matching — join games (via teams.name) to exp on date + team name + opponent name
  console.log('\n=== SCORE COMPARISON (sample) ===');
  const scoreCheck = await pool.query(`
    WITH exp_flat AS (
      SELECT game_date, away_team_name as team, home_team_name as opponent, away_score as team_score, home_score as opp_score
      FROM exp_game_box_scores WHERE season = $1
      UNION ALL
      SELECT game_date, home_team_name as team, away_team_name as opponent, home_score as team_score, away_score as opp_score
      FROM exp_game_box_scores WHERE season = $1
    )
    SELECT 
      g.game_date, t.name as team_name, g.opponent_name, 
      g.team_score as games_score, ef.team_score as exp_score,
      g.opponent_score as games_opp_score, ef.opp_score as exp_opp_score
    FROM games g
    JOIN teams t ON g.team_id = t.team_id AND t.season = $1
    JOIN exp_flat ef ON g.game_date = ef.game_date 
      AND t.name = ef.team 
      AND g.opponent_name = ef.opponent
    WHERE g.season = $1
    LIMIT 20
  `, [season]);
  
  console.log(`Matched ${scoreCheck.rows.length} rows (showing up to 20):`);
  for (const row of scoreCheck.rows) {
    const match = row.games_score == row.exp_score && row.games_opp_score == row.exp_opp_score;
    console.log(`  ${match ? '✅' : '❌'} ${row.game_date} ${row.team_name} ${row.games_score}(${row.exp_score}) vs ${row.opponent_name} ${row.games_opp_score}(${row.exp_opp_score})`);
  }

  // 7. Count total matches and mismatches
  const matchStats = await pool.query(`
    WITH exp_flat AS (
      SELECT game_date, away_team_name as team, home_team_name as opponent, away_score as team_score, home_score as opp_score
      FROM exp_game_box_scores WHERE season = $1
      UNION ALL
      SELECT game_date, home_team_name as team, away_team_name as opponent, home_score as team_score, away_score as opp_score
      FROM exp_game_box_scores WHERE season = $1
    )
    SELECT 
      COUNT(*) as total_matched,
      COUNT(*) FILTER (WHERE g.team_score = ef.team_score AND g.opponent_score = ef.opp_score) as scores_match,
      COUNT(*) FILTER (WHERE g.team_score != ef.team_score OR g.opponent_score != ef.opp_score) as scores_mismatch
    FROM games g
    JOIN teams t ON g.team_id = t.team_id AND t.season = $1
    JOIN exp_flat ef ON g.game_date = ef.game_date 
      AND t.name = ef.team 
      AND g.opponent_name = ef.opponent
    WHERE g.season = $1
  `, [season]);
  console.log('\n=== OVERALL SCORE MATCH ===');
  console.log(matchStats.rows[0]);

  // 8. Games in existing table but NOT in exp (by date + team name)
  const missingFromExp = await pool.query(`
    SELECT COUNT(DISTINCT g.game_id) as missing
    FROM games g
    JOIN teams t ON g.team_id = t.team_id AND t.season = $1
    WHERE g.season = $1
    AND NOT EXISTS (
      SELECT 1 FROM exp_game_box_scores e
      WHERE e.game_date = g.game_date
      AND e.season = $1
      AND (e.away_team_name = t.name OR e.home_team_name = t.name)
    )
  `, [season]);
  console.log('\n=== COVERAGE ===');
  console.log('Games in existing table NOT found in exp:', missingFromExp.rows[0].missing);

  // 9. Show some of the missing games
  const missingSample = await pool.query(`
    SELECT DISTINCT g.game_id, g.game_date, t.name as team_name, g.opponent_name, g.team_score, g.opponent_score
    FROM games g
    JOIN teams t ON g.team_id = t.team_id AND t.season = $1
    WHERE g.season = $1
    AND NOT EXISTS (
      SELECT 1 FROM exp_game_box_scores e
      WHERE e.game_date = g.game_date
      AND e.season = $1
      AND (e.away_team_name = t.name OR e.home_team_name = t.name)
    )
    ORDER BY g.game_date
    LIMIT 20
  `, [season]);
  if (missingSample.rows.length > 0) {
    console.log('Sample missing games:');
    for (const row of missingSample.rows) {
      console.log(`  ${row.game_date} ${row.team_name} ${row.team_score} vs ${row.opponent_name} ${row.opponent_score}`);
    }
  }

  // 10. Stat comparison — compare FGM, FGA, rebounds etc for matched games
  console.log('\n=== STAT COMPARISON (sample FG, REB, AST, STL, BLK, TO) ===');
  const statCheck = await pool.query(`
    SELECT 
      g.game_date, t.name as team_name,
      g.fgm as g_fgm, g.fga as g_fga, g.treb as g_reb, g.ast as g_ast, g.stl as g_stl, g.blk as g_blk, g.turnovers as g_to,
      CASE WHEN t.name = e.away_team_name THEN e.away_fgm ELSE e.home_fgm END as e_fgm,
      CASE WHEN t.name = e.away_team_name THEN e.away_fga ELSE e.home_fga END as e_fga,
      CASE WHEN t.name = e.away_team_name THEN e.away_reb ELSE e.home_reb END as e_reb,
      CASE WHEN t.name = e.away_team_name THEN e.away_ast ELSE e.home_ast END as e_ast,
      CASE WHEN t.name = e.away_team_name THEN e.away_stl ELSE e.home_stl END as e_stl,
      CASE WHEN t.name = e.away_team_name THEN e.away_blk ELSE e.home_blk END as e_blk,
      CASE WHEN t.name = e.away_team_name THEN e.away_to ELSE e.home_to END as e_to
    FROM games g
    JOIN teams t ON g.team_id = t.team_id AND t.season = $1
    JOIN exp_game_box_scores e ON g.game_date = e.game_date 
      AND (t.name = e.away_team_name OR t.name = e.home_team_name)
      AND (g.opponent_name = e.away_team_name OR g.opponent_name = e.home_team_name)
    WHERE g.season = $1
    LIMIT 10
  `, [season]);

  for (const r of statCheck.rows) {
    const fgMatch = r.g_fgm == r.e_fgm && r.g_fga == r.e_fga;
    const rebMatch = r.g_reb == r.e_reb;
    const astMatch = r.g_ast == r.e_ast;
    const allMatch = fgMatch && rebMatch && astMatch && r.g_stl == r.e_stl && r.g_blk == r.e_blk && r.g_to == r.e_to;
    const icon = allMatch ? '✅' : '⚠️';
    console.log(`  ${icon} ${r.game_date} ${r.team_name}: FG ${r.g_fgm}/${r.g_fga}(${r.e_fgm}/${r.e_fga}) REB ${r.g_reb}(${r.e_reb}) AST ${r.g_ast}(${r.e_ast}) STL ${r.g_stl}(${r.e_stl}) BLK ${r.g_blk}(${r.e_blk}) TO ${r.g_to}(${r.e_to})`);
  }

  // 11. Overall stat match rate
  const statMatchRate = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE g.fgm = CASE WHEN t.name = e.away_team_name THEN e.away_fgm ELSE e.home_fgm END) as fgm_match,
      COUNT(*) FILTER (WHERE g.fga = CASE WHEN t.name = e.away_team_name THEN e.away_fga ELSE e.home_fga END) as fga_match,
      COUNT(*) FILTER (WHERE g.treb = CASE WHEN t.name = e.away_team_name THEN e.away_reb ELSE e.home_reb END) as reb_match,
      COUNT(*) FILTER (WHERE g.ast = CASE WHEN t.name = e.away_team_name THEN e.away_ast ELSE e.home_ast END) as ast_match,
      COUNT(*) FILTER (WHERE g.team_score = CASE WHEN t.name = e.away_team_name THEN e.away_score ELSE e.home_score END) as score_match
    FROM games g
    JOIN teams t ON g.team_id = t.team_id AND t.season = $1
    JOIN exp_game_box_scores e ON g.game_date = e.game_date 
      AND (t.name = e.away_team_name OR t.name = e.home_team_name)
      AND (g.opponent_name = e.away_team_name OR g.opponent_name = e.home_team_name)
    WHERE g.season = $1
  `, [season]);
  console.log('\n=== OVERALL STAT MATCH RATES ===');
  const s = statMatchRate.rows[0];
  console.log(`Total matched rows: ${s.total}`);
  console.log(`Score: ${s.score_match}/${s.total} (${(s.score_match/s.total*100).toFixed(1)}%)`);
  console.log(`FGM:   ${s.fgm_match}/${s.total} (${(s.fgm_match/s.total*100).toFixed(1)}%)`);
  console.log(`FGA:   ${s.fga_match}/${s.total} (${(s.fga_match/s.total*100).toFixed(1)}%)`);
  console.log(`REB:   ${s.reb_match}/${s.total} (${(s.reb_match/s.total*100).toFixed(1)}%)`);
  console.log(`AST:   ${s.ast_match}/${s.total} (${(s.ast_match/s.total*100).toFixed(1)}%)`);

  await pool.end();
}

verify().catch(e => { console.error(e); process.exit(1); });

