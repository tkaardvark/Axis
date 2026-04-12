// migrate-copy-locations.js
// Copy location data (city, state, latitude, longitude) from 2025-26 teams to 2024-25 teams

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrateLocationData() {
  const client = await pool.connect();
  
  try {
    console.log('Starting location data migration from 2025-26 to 2024-25...\n');
    
    // Check current state
    const beforeResult = await client.query(`
      SELECT 
        season,
        COUNT(*) as total_teams,
        COUNT(latitude) as has_coords
      FROM teams 
      GROUP BY season
      ORDER BY season
    `);
    
    console.log('Before migration:');
    beforeResult.rows.forEach(row => {
      console.log(`  ${row.season}: ${row.has_coords}/${row.total_teams} teams have coordinates`);
    });
    console.log('');
    
    // Copy location data from 2025-26 to 2024-25 by matching team names
    const updateResult = await client.query(`
      UPDATE teams t24
      SET 
        city = t26.city,
        state = t26.state,
        latitude = t26.latitude,
        longitude = t26.longitude
      FROM teams t26
      WHERE t24.season = '2024-25'
        AND t26.season = '2025-26'
        AND t24.name = t26.name
        AND t24.latitude IS NULL
        AND t26.latitude IS NOT NULL
    `);
    
    console.log(`Updated ${updateResult.rowCount} teams in 2024-25 with location data from 2025-26`);
    
    // Check for teams that couldn't be matched
    const unmatchedResult = await client.query(`
      SELECT t24.name
      FROM teams t24
      LEFT JOIN teams t26 ON t24.name = t26.name AND t26.season = '2025-26'
      WHERE t24.season = '2024-25' 
        AND t24.latitude IS NULL
        AND (t26.team_id IS NULL OR t26.latitude IS NULL)
    `);
    
    if (unmatchedResult.rows.length > 0) {
      console.log(`\n${unmatchedResult.rows.length} teams in 2024-25 still missing location data:`);
      unmatchedResult.rows.forEach(row => console.log(`  - ${row.name}`));
    }
    
    // Verify final state
    const afterResult = await client.query(`
      SELECT 
        season,
        COUNT(*) as total_teams,
        COUNT(latitude) as has_coords
      FROM teams 
      GROUP BY season
      ORDER BY season
    `);
    
    console.log('\nAfter migration:');
    afterResult.rows.forEach(row => {
      console.log(`  ${row.season}: ${row.has_coords}/${row.total_teams} teams have coordinates`);
    });
    
    console.log('\nMigration complete!');
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrateLocationData().catch(console.error);
