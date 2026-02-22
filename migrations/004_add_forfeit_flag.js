/**
 * Migration: Add forfeit_team_id to exp_game_box_scores
 * 
 * This tracks which team forfeited a game (if any).
 * When a game is forfeited:
 * - The forfeiting team gets a 0-2 loss
 * - The other team gets a 2-0 win
 * - Individual player stats still count
 * 
 * Usage: node migrations/004_add_forfeit_flag.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  console.log('Adding forfeit_team_id column to exp_game_box_scores...');
  
  try {
    // Check if column already exists
    const check = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'exp_game_box_scores' AND column_name = 'forfeit_team_id'
    `);
    
    if (check.rows.length > 0) {
      console.log('Column forfeit_team_id already exists, skipping.');
      return;
    }
    
    // Add the column
    await pool.query(`
      ALTER TABLE exp_game_box_scores 
      ADD COLUMN forfeit_team_id VARCHAR(50) DEFAULT NULL
    `);
    
    console.log('Successfully added forfeit_team_id column.');
    
    // Add index for efficient querying
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_exp_gbs_forfeit 
      ON exp_game_box_scores(forfeit_team_id) 
      WHERE forfeit_team_id IS NOT NULL
    `);
    
    console.log('Successfully added index.');
    
  } catch (err) {
    console.error('Migration error:', err);
    throw err;
  } finally {
    await pool.end();
  }
}

migrate().then(() => {
  console.log('Migration complete.');
  process.exit(0);
}).catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
