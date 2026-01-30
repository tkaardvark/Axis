/**
 * Database Migration: Increase SOS/RPI decimal precision
 *
 * Changes rpi, strength_of_schedule, opponent_win_pct, and
 * opponent_opponent_win_pct from DECIMAL(5,3)/DECIMAL(6,3)
 * to DECIMAL(8,6) so values aren't rounded to 3 decimal places.
 *
 * Usage: node migrate-sos-precision.js
 */

require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  try {
    await client.connect();
    console.log('Connected to database\n');

    const alterations = [
      ['rpi', 'DECIMAL(8,6)'],
      ['strength_of_schedule', 'DECIMAL(8,6)'],
      ['opponent_win_pct', 'DECIMAL(8,6)'],
      ['opponent_opponent_win_pct', 'DECIMAL(8,6)'],
    ];

    for (const [col, type] of alterations) {
      try {
        await client.query(`ALTER TABLE team_ratings ALTER COLUMN ${col} TYPE ${type}`);
        console.log(`  ✓ ${col} → ${type}`);
      } catch (err) {
        console.log(`  ✗ ${col}: ${err.message}`);
      }
    }

    console.log('\nMigration complete! Run "npm run analytics" to recalculate with full precision.');
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    await client.end();
  }
}

migrate();
