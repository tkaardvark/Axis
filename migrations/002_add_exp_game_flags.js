/**
 * Migration: Add missing classification columns to exp_game_box_scores
 *
 * Adds columns needed to fully replace the legacy `games` table:
 *   - is_naia_game          BOOLEAN  (opponent is a recognised NAIA team)
 *   - is_national_tournament BOOLEAN (postseason game in national tournament, not conf tournament)
 *   - is_neutral             BOOLEAN (neutral-site game — neither team is "home")
 *
 * Usage:
 *   node migrations/002_add_exp_game_flags.js            # Add columns
 *   node migrations/002_add_exp_game_flags.js --down      # Remove columns
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('render.com')
    ? { rejectUnauthorized: false }
    : false,
});

const UP = `
  -- New classification columns
  ALTER TABLE exp_game_box_scores
    ADD COLUMN IF NOT EXISTS is_naia_game          BOOLEAN DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS is_national_tournament BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_neutral             BOOLEAN DEFAULT false;

  -- Index for NAIA filtering (used by bracketcast, RPI, quadrants)
  CREATE INDEX IF NOT EXISTS idx_exp_gbs_naia
    ON exp_game_box_scores(is_naia_game)
    WHERE is_naia_game = true;
`;

const DOWN = `
  ALTER TABLE exp_game_box_scores
    DROP COLUMN IF EXISTS is_naia_game,
    DROP COLUMN IF EXISTS is_national_tournament,
    DROP COLUMN IF EXISTS is_neutral;
`;

async function main() {
  const isDown = process.argv.includes('--down');
  const sql = isDown ? DOWN : UP;
  const label = isDown ? 'DOWN' : 'UP';

  try {
    console.log(`Running migration ${label}...`);
    await pool.query(sql);
    console.log(`Migration ${label} complete ✅`);
  } catch (err) {
    console.error(`Migration ${label} failed:`, err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
