/**
 * Migration: Add location columns to teams table
 *
 * This adds city, state, latitude, and longitude columns
 * to support geographic bracket pod assignment.
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

    // Define the columns to add
    const columns = [
      { name: 'city', type: 'VARCHAR(100)' },
      { name: 'state', type: 'VARCHAR(2)' },
      { name: 'latitude', type: 'DECIMAL(10, 7)' },
      { name: 'longitude', type: 'DECIMAL(10, 7)' }
    ];

    for (const col of columns) {
      // Check if column exists
      const checkColumn = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'teams' AND column_name = $1
      `, [col.name]);

      if (checkColumn.rows.length === 0) {
        await client.query(`
          ALTER TABLE teams
          ADD COLUMN ${col.name} ${col.type}
        `);
        console.log(`✅ Added ${col.name} column (${col.type}) to teams table`);
      } else {
        console.log(`ℹ️  ${col.name} column already exists`);
      }
    }

    // Show summary of teams with/without location data
    const summary = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE city IS NOT NULL AND state IS NOT NULL) as with_location,
        COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) as with_coordinates,
        COUNT(*) as total
      FROM teams
    `);

    console.log(`\n📊 Summary:`);
    console.log(`   Teams with city/state: ${summary.rows[0].with_location}`);
    console.log(`   Teams with coordinates: ${summary.rows[0].with_coordinates}`);
    console.log(`   Total teams: ${summary.rows[0].total}`);

  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    await client.end();
  }
}

migrate();
