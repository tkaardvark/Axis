/**
 * Database Migration: Add Advanced Analytics Columns
 * 
 * Adds all the columns needed for comprehensive NAIA analytics
 * 
 * Usage: node migrate-add-analytics.js
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

    console.log('Adding new columns to team_ratings table...\n');

    // Add columns one by one (ignore errors if they already exist)
    const columns = [
      // Basic stats
      ['games_played', 'INTEGER DEFAULT 0'],
      ['points_per_game', 'DECIMAL(5,1)'],
      ['points_allowed_per_game', 'DECIMAL(5,1)'],
      
      // Raw efficiency
      ['offensive_rating', 'DECIMAL(6,2)'],
      ['defensive_rating', 'DECIMAL(6,2)'],
      ['net_rating', 'DECIMAL(6,2)'],
      
      // Adjusted ratings already exist
      
      // Shooting
      ['fg_pct', 'DECIMAL(5,2)'],
      ['fg3_pct', 'DECIMAL(5,2)'],
      ['ft_pct', 'DECIMAL(5,2)'],
      ['efg_pct', 'DECIMAL(5,2)'],
      ['fg_pct_opp', 'DECIMAL(5,2)'],
      ['fg3_pct_opp', 'DECIMAL(5,2)'],
      ['efg_pct_opp', 'DECIMAL(5,2)'],
      
      // Turnovers
      ['turnover_pct', 'DECIMAL(5,2)'],
      ['turnover_pct_opp', 'DECIMAL(5,2)'],
      
      // Rebounding
      ['oreb_pct', 'DECIMAL(5,2)'],
      ['dreb_pct', 'DECIMAL(5,2)'],
      ['oreb_pct_opp', 'DECIMAL(5,2)'],
      ['dreb_pct_opp', 'DECIMAL(5,2)'],
      
      // Attempt rates
      ['ft_rate', 'DECIMAL(5,2)'],
      ['three_pt_rate', 'DECIMAL(5,2)'],
      
      // RPI components
      ['rpi', 'DECIMAL(6,4)'],
      ['naia_wins', 'INTEGER DEFAULT 0'],
      ['naia_losses', 'INTEGER DEFAULT 0'],
      ['naia_win_pct', 'DECIMAL(5,3)'],
      
      // Adjusted rating components
      ['osos', 'DECIMAL(6,2)'],  // Opponent schedule offensive strength
      ['dsos', 'DECIMAL(6,2)'],  // Opponent schedule defensive strength
      ['nsos', 'DECIMAL(6,2)']   // Net schedule opponent strength
    ];

    for (const [colName, colType] of columns) {
      try {
        await client.query(`ALTER TABLE team_ratings ADD COLUMN ${colName} ${colType}`);
        console.log(`✓ Added column: ${colName}`);
      } catch (err) {
        if (err.code === '42701') {
          console.log(`  Column ${colName} already exists, skipping`);
        } else {
          console.error(`  Error adding ${colName}: ${err.message}`);
        }
      }
    }

    console.log('\n✅ Migration complete!');

  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
