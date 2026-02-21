/**
 * Migration: Add box score derived stats to team_ratings
 * 
 * These columns store pre-calculated stats from exp_game_box_scores
 * to avoid expensive on-the-fly aggregation.
 * 
 * Run: node migrations/004_add_boxscore_stats.js
 */

require('dotenv').config();
const { pool } = require('../db/pool');

const NEW_COLUMNS = [
  // Per-game stats
  'ast_per_game NUMERIC(5,1)',
  'to_per_game NUMERIC(5,1)',
  'reb_per_game NUMERIC(5,1)',
  'oreb_per_game NUMERIC(5,1)',
  'dreb_per_game NUMERIC(5,1)',
  'fgm_per_game NUMERIC(5,1)',
  'fgm3_per_game NUMERIC(5,1)',
  'ftm_per_game NUMERIC(5,1)',
  'pf_per_game NUMERIC(5,1)',
  'stl_per_game NUMERIC(5,1)',
  'blk_per_game NUMERIC(5,1)',
  
  // Paint/fastbreak stats
  'pts_paint_per_game NUMERIC(5,1)',
  'pts_fastbreak_per_game NUMERIC(5,1)',
  'pts_off_to_per_game NUMERIC(5,1)',
  'pts_bench_per_game NUMERIC(5,1)',
  
  // Opponent per-game stats
  'opp_ast_per_game NUMERIC(5,1)',
  'opp_reb_per_game NUMERIC(5,1)',
  'opp_pts_paint_per_game NUMERIC(5,1)',
  'opp_pts_fastbreak_per_game NUMERIC(5,1)',
  'opp_pts_off_to_per_game NUMERIC(5,1)',
  
  // Game flow stats
  'lead_changes_per_game NUMERIC(5,1)',
  'ties_per_game NUMERIC(5,1)',
  'avg_largest_lead NUMERIC(5,1)',
  'avg_opp_largest_lead NUMERIC(5,1)',
  'second_chance_per_game NUMERIC(5,1)',
  'opp_second_chance_per_game NUMERIC(5,1)',
  
  // Close/blowout records
  'close_wins INTEGER DEFAULT 0',
  'close_losses INTEGER DEFAULT 0',
  'blowout_wins INTEGER DEFAULT 0',
  'blowout_losses INTEGER DEFAULT 0',
  
  // Half lead stats
  'half_lead_win_pct NUMERIC(5,3)',
  'half_lead_wins INTEGER DEFAULT 0',
  'half_lead_games INTEGER DEFAULT 0',
  
  // Comeback stats
  'comeback_win_pct NUMERIC(5,3)',
  'comeback_wins INTEGER DEFAULT 0',
  'trailing_half_games INTEGER DEFAULT 0',
  
  // Run stats
  'runs_scored_per_game NUMERIC(5,2)',
  'runs_allowed_per_game NUMERIC(5,2)',
  
  // Effective possession ratio
  'effective_possession_ratio NUMERIC(5,3)',
  
  // Last updated timestamp for box score stats
  'boxscore_updated_at TIMESTAMP'
];

async function migrate() {
  console.log('Adding box score stat columns to team_ratings...\n');

  for (const colDef of NEW_COLUMNS) {
    const colName = colDef.split(' ')[0];
    try {
      await pool.query(`ALTER TABLE team_ratings ADD COLUMN IF NOT EXISTS ${colDef}`);
      console.log(`✓ Added: ${colName}`);
    } catch (err) {
      if (err.code === '42701') {
        console.log(`  Exists: ${colName}`);
      } else {
        console.error(`✗ Failed: ${colName} - ${err.message}`);
      }
    }
  }

  console.log('\nMigration complete.');
  await pool.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
