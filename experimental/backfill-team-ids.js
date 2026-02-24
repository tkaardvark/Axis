/**
 * Backfill null team_ids in exp_game_box_scores by matching team names to the teams table.
 * 
 * Some box score pages don't include team ID links in the HTML, so the parser
 * leaves team_id as null even for NAIA teams. This script fixes those by exact name match.
 * 
 * Usage: node experimental/backfill-team-ids.js [--season 2025-26] [--dry-run]
 */
require('dotenv').config();
const { pool } = require('../db/pool');

const args = process.argv.slice(2);
const season = args.includes('--season') ? args[args.indexOf('--season') + 1] : '2025-26';
const dryRun = args.includes('--dry-run');

(async () => {
  try {
    console.log(`Backfilling null team_ids for season ${season}${dryRun ? ' (DRY RUN)' : ''}...\n`);

    // Fix null home_team_id
    const homePreview = await pool.query(`
      SELECT e.id, e.home_team_name, t.team_id as resolved_id, e.game_date, e.league
      FROM exp_game_box_scores e
      JOIN teams t ON t.name = e.home_team_name AND t.season = $1 AND t.league = e.league
      WHERE e.home_team_id IS NULL AND e.season = $1
      ORDER BY e.game_date
    `, [season]);

    console.log(`Found ${homePreview.rows.length} fixable null home_team_id entries:`);
    homePreview.rows.forEach(r => {
      const d = r.game_date?.toISOString().split('T')[0];
      console.log(`  ${d} ${r.league} ${r.home_team_name} -> ${r.resolved_id}`);
    });

    if (!dryRun && homePreview.rows.length > 0) {
      const homeResult = await pool.query(`
        UPDATE exp_game_box_scores e
        SET home_team_id = t.team_id
        FROM teams t
        WHERE t.name = e.home_team_name
          AND t.season = $1
          AND t.league = e.league
          AND e.home_team_id IS NULL
          AND e.season = $1
      `, [season]);
      console.log(`  -> Updated ${homeResult.rowCount} rows\n`);
    }

    // Fix null away_team_id
    const awayPreview = await pool.query(`
      SELECT e.id, e.away_team_name, t.team_id as resolved_id, e.game_date, e.league
      FROM exp_game_box_scores e
      JOIN teams t ON t.name = e.away_team_name AND t.season = $1 AND t.league = e.league
      WHERE e.away_team_id IS NULL AND e.season = $1
      ORDER BY e.game_date
    `, [season]);

    console.log(`Found ${awayPreview.rows.length} fixable null away_team_id entries:`);
    awayPreview.rows.forEach(r => {
      const d = r.game_date?.toISOString().split('T')[0];
      console.log(`  ${d} ${r.league} ${r.away_team_name} -> ${r.resolved_id}`);
    });

    if (!dryRun && awayPreview.rows.length > 0) {
      const awayResult = await pool.query(`
        UPDATE exp_game_box_scores e
        SET away_team_id = t.team_id
        FROM teams t
        WHERE t.name = e.away_team_name
          AND t.season = $1
          AND t.league = e.league
          AND e.away_team_id IS NULL
          AND e.season = $1
      `, [season]);
      console.log(`  -> Updated ${awayResult.rowCount} rows\n`);
    }

    // Also fix exp_player_game_stats where team_id is null
    const playerPreview = await pool.query(`
      SELECT COUNT(*) as cnt
      FROM exp_player_game_stats p
      JOIN exp_game_box_scores e ON p.game_box_score_id = e.id
      WHERE p.team_id IS NULL AND e.season = $1
    `, [season]);
    console.log(`Player stats with null team_id: ${playerPreview.rows[0].cnt}`);

    if (!dryRun && parseInt(playerPreview.rows[0].cnt) > 0) {
      // Fix player stats by matching team_name to teams
      const playerResult = await pool.query(`
        UPDATE exp_player_game_stats p
        SET team_id = t.team_id
        FROM teams t, exp_game_box_scores e
        WHERE p.game_box_score_id = e.id
          AND t.name = p.team_name
          AND t.season = $1
          AND t.league = e.league
          AND p.team_id IS NULL
          AND e.season = $1
      `, [season]);
      console.log(`  -> Updated ${playerResult.rowCount} player stat rows`);
    }

    // Summary
    const remaining = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE home_team_id IS NULL) as null_home,
        COUNT(*) FILTER (WHERE away_team_id IS NULL) as null_away,
        COUNT(*) as total
      FROM exp_game_box_scores WHERE season = $1
    `, [season]);
    const r = remaining.rows[0];
    console.log(`\nRemaining null IDs: ${r.null_home} home, ${r.null_away} away (out of ${r.total} total)`);
    console.log('(Remaining nulls are expected — they are non-NAIA opponents not in the teams table)');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
})();
