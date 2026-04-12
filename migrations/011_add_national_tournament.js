/**
 * Migration: Add is_national_tournament column to games table
 * 
 * This differentiates between conference tournament and national tournament games.
 * National tournament games are identified by date (typically starts March 11-12).
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log('Adding is_national_tournament column to games table...');
    
    // Add the column if it doesn't exist
    await client.query(`
      ALTER TABLE games 
      ADD COLUMN IF NOT EXISTS is_national_tournament BOOLEAN DEFAULT FALSE
    `);
    
    console.log('✓ Column added');
    
    // Update existing postseason games based on date
    // NAIA National Tournament first round dates by season:
    // - 2024-25: March 14, 2025
    // - Future seasons: typically around March 11-14
    console.log('Updating existing postseason games...');
    
    const result = await client.query(`
      UPDATE games
      SET is_national_tournament = true
      WHERE is_postseason = true
        AND (
          -- 2024-25 season: National tournament started March 14, 2025
          (season = '2024-25' AND game_date >= '2025-03-14')
          -- Default for other seasons: March 12 or later
          OR (season != '2024-25' AND EXTRACT(MONTH FROM game_date) = 3 AND EXTRACT(DAY FROM game_date) >= 12)
        )
    `);
    
    console.log(`✓ Updated ${result.rowCount} games as national tournament games`);
    
    // Verify the update
    const stats = await client.query(`
      SELECT 
        season,
        COUNT(*) FILTER (WHERE is_postseason AND NOT is_national_tournament) as conf_tournament,
        COUNT(*) FILTER (WHERE is_national_tournament) as national_tournament
      FROM games
      WHERE is_postseason = true
      GROUP BY season
      ORDER BY season
    `);
    
    console.log('\nPostseason game counts by season:');
    for (const row of stats.rows) {
      console.log(`  ${row.season}: ${row.conf_tournament} conference tournament, ${row.national_tournament} national tournament`);
    }
    
    console.log('\n✓ Migration complete!');
    
  } catch (error) {
    console.error('Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
