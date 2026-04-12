/**
 * Migration: Add is_excluded column to teams table
 * 
 * This column marks teams that should not be counted as NAIA opponents
 * in RPI, SOS, and NAIA record calculations.
 */

require('dotenv').config();
const { Client } = require('pg');
const excludedTeamsConfig = require('./config/excluded-teams');

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database\n');

    // Add is_excluded column if it doesn't exist
    const checkColumn = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'teams' AND column_name = 'is_excluded'
    `);

    if (checkColumn.rows.length === 0) {
      await client.query(`
        ALTER TABLE teams 
        ADD COLUMN is_excluded BOOLEAN DEFAULT FALSE
      `);
      console.log('✅ Added is_excluded column to teams table\n');
    } else {
      console.log('ℹ️  is_excluded column already exists\n');
    }

    // Update teams based on excluded-teams.js config
    const excludedList = excludedTeamsConfig.excludedTeams.filter(t => {
      if (typeof t === 'string') return t && t.trim();
      return t && t.name && t.name.trim();
    });

    if (excludedList.length === 0) {
      console.log('No teams in exclusion list');
      return;
    }

    // First, reset all to not excluded
    await client.query(`UPDATE teams SET is_excluded = FALSE`);

    // Then mark excluded teams based on name and league
    let excludedCount = 0;
    for (const excluded of excludedList) {
      const name = (typeof excluded === 'string' ? excluded : excluded.name).toLowerCase().trim();
      const league = typeof excluded === 'string' ? 'both' : (excluded.league || 'both');
      
      let query, params;
      if (league === 'both') {
        query = `
          UPDATE teams 
          SET is_excluded = TRUE 
          WHERE LOWER(name) LIKE $1 
             OR LOWER(team_id) LIKE $1
          RETURNING name, league
        `;
        params = [`%${name}%`];
      } else {
        query = `
          UPDATE teams 
          SET is_excluded = TRUE 
          WHERE (LOWER(name) LIKE $1 OR LOWER(team_id) LIKE $1)
            AND league = $2
          RETURNING name, league
        `;
        params = [`%${name}%`, league];
      }
      
      const result = await client.query(query, params);
      
      if (result.rowCount > 0) {
        result.rows.forEach(row => {
          console.log(`  ⛔ Excluded: ${row.name} (${row.league})`);
          excludedCount++;
        });
      }
    }

    console.log(`\n✅ Marked ${excludedCount} teams as excluded`);

    // Show summary
    const summary = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE is_excluded = TRUE) as excluded,
        COUNT(*) FILTER (WHERE is_excluded = FALSE) as included,
        COUNT(*) as total
      FROM teams
    `);
    
    console.log(`\n📊 Summary:`);
    console.log(`   Excluded teams: ${summary.rows[0].excluded}`);
    console.log(`   NAIA teams: ${summary.rows[0].included}`);
    console.log(`   Total teams: ${summary.rows[0].total}`);

  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    await client.end();
  }
}

migrate();
