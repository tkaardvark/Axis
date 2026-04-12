/**
 * Migration: Add is_naia_game column to games table
 * 
 * This column marks whether a game is against an NAIA opponent.
 * Non-NAIA games will be excluded from all analytics calculations.
 */

require('dotenv').config();
const { Client } = require('pg');

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database\n');

    // Add is_naia_game column if it doesn't exist
    const checkColumn = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'games' AND column_name = 'is_naia_game'
    `);

    if (checkColumn.rows.length === 0) {
      await client.query(`
        ALTER TABLE games 
        ADD COLUMN is_naia_game BOOLEAN DEFAULT TRUE
      `);
      console.log('✅ Added is_naia_game column to games table\n');
    } else {
      console.log('ℹ️  is_naia_game column already exists\n');
    }

    // Mark games based on whether opponent is in our teams table (NAIA teams)
    // and the opponent is not excluded
    console.log('Marking games as NAIA or non-NAIA...\n');
    
    // First, set all games to non-NAIA by default
    await client.query(`UPDATE games SET is_naia_game = FALSE`);
    
    // Then mark games where opponent exists in teams table AND is not excluded
    const result = await client.query(`
      UPDATE games g
      SET is_naia_game = TRUE
      FROM teams t
      WHERE g.opponent_id = t.team_id
        AND t.is_excluded = FALSE
    `);
    
    console.log(`✅ Marked ${result.rowCount} games as NAIA games\n`);

    // Show summary
    const summary = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE is_naia_game = TRUE) as naia_games,
        COUNT(*) FILTER (WHERE is_naia_game = FALSE) as non_naia_games,
        COUNT(*) as total_games
      FROM games
    `);
    
    console.log('📊 Summary:');
    console.log(`   NAIA games: ${summary.rows[0].naia_games}`);
    console.log(`   Non-NAIA games: ${summary.rows[0].non_naia_games}`);
    console.log(`   Total games: ${summary.rows[0].total_games}`);

    // Show some non-NAIA opponents
    console.log('\n📋 Sample non-NAIA opponents:');
    const nonNaia = await client.query(`
      SELECT DISTINCT opponent_name, COUNT(*) as games
      FROM games
      WHERE is_naia_game = FALSE
      GROUP BY opponent_name
      ORDER BY games DESC
      LIMIT 15
    `);
    nonNaia.rows.forEach(r => console.log(`   ${r.opponent_name}: ${r.games} games`));

  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    await client.end();
  }
}

migrate();
