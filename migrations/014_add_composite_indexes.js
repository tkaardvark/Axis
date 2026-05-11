// 014_add_composite_indexes.js
// Add composite indexes to speed up the most common query pattern across the app:
// filtering teams + games by (league, season) and joining on (team_id, season).
//
// PostgreSQL cannot efficiently combine two single-column B-tree indexes for
// equality filters on multiple columns, so a composite index is materially
// faster for these patterns. Estimated savings: 50–150ms per request.
//
// Uses CREATE INDEX CONCURRENTLY where possible so it does not lock the table
// during creation. CONCURRENTLY cannot run inside a transaction, so each
// statement is issued individually.

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('============================================================');
    console.log('Migration 014: Add composite indexes');
    console.log('============================================================\n');

    const indexes = [
      {
        name: 'idx_teams_league_season',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_teams_league_season
              ON teams (league, season)`,
      },
      {
        name: 'idx_teams_season_excluded',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_teams_season_excluded
              ON teams (season, is_excluded)`,
      },
      {
        name: 'idx_exp_box_season_away',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_exp_box_season_away
              ON exp_game_box_scores (season, away_team_id)`,
      },
      {
        name: 'idx_exp_box_season_home',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_exp_box_season_home
              ON exp_game_box_scores (season, home_team_id)`,
      },
      {
        name: 'idx_games_team_season',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_games_team_season
              ON games (team_id, season)`,
      },
    ];

    for (const idx of indexes) {
      console.log(`Creating ${idx.name}...`);
      try {
        await client.query(idx.sql);
        console.log(`  ✓ ${idx.name} ready`);
      } catch (err) {
        // CONCURRENTLY cannot run inside an implicit transaction on some
        // managed Postgres setups. Fall back to a plain CREATE INDEX.
        if (err.message && err.message.includes('CONCURRENTLY')) {
          console.log(`  ! CONCURRENTLY not allowed — falling back to plain CREATE INDEX`);
          const fallback = idx.sql.replace('CONCURRENTLY ', '');
          await client.query(fallback);
          console.log(`  ✓ ${idx.name} ready`);
        } else {
          throw err;
        }
      }
    }

    console.log('\n✅ Migration 014 complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
