/**
 * Migration: Create future_games table
 *
 * Stores unplayed/scheduled games for predictions & projected records.
 * This replaces the `games WHERE is_completed = FALSE` rows
 * so the legacy `games` table can eventually be dropped.
 *
 * One row per team-game (same as legacy `games` — team-centric view).
 *
 * Usage:
 *   node migrations/003_create_future_games.js          # Create table
 *   node migrations/003_create_future_games.js --down   # Drop table
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
CREATE TABLE IF NOT EXISTS future_games (
  id              SERIAL PRIMARY KEY,
  season          VARCHAR(10) NOT NULL,
  league          VARCHAR(10) NOT NULL,

  -- Team perspective (one row per team per game)
  team_id         VARCHAR(50) NOT NULL,
  opponent_id     VARCHAR(50),              -- NULL if opponent is non-NAIA
  opponent_name   VARCHAR(255) NOT NULL,

  game_date       DATE NOT NULL,
  location        VARCHAR(10) NOT NULL,      -- 'home', 'away', 'neutral'

  -- Game classification
  is_conference   BOOLEAN DEFAULT false,
  is_exhibition   BOOLEAN DEFAULT false,
  is_postseason   BOOLEAN DEFAULT false,
  is_naia_game    BOOLEAN DEFAULT false,

  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW(),

  UNIQUE(team_id, opponent_name, game_date, season)
);

CREATE INDEX IF NOT EXISTS idx_future_games_team ON future_games(team_id, season);
CREATE INDEX IF NOT EXISTS idx_future_games_date ON future_games(game_date);
CREATE INDEX IF NOT EXISTS idx_future_games_conf ON future_games(is_conference, season);
`;

const DOWN = `
DROP TABLE IF EXISTS future_games;
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
