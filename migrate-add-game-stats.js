/**
 * Migration: Add comprehensive game stats columns
 * 
 * Adds all available box score statistics from the JSON data
 * to the games table for detailed per-game analysis.
 */

require('dotenv').config();
const { Client } = require('pg');

const STAT_COLUMNS = [
  // Game metadata
  { name: 'is_conference', type: 'BOOLEAN DEFAULT FALSE' },
  { name: 'is_postseason', type: 'BOOLEAN DEFAULT FALSE' },
  { name: 'event_id', type: 'VARCHAR(50)' },
  { name: 'opponent_name', type: 'VARCHAR(255)' },
  
  // Team shooting stats
  { name: 'fgm', type: 'INTEGER' },           // Field goals made
  { name: 'fga', type: 'INTEGER' },           // Field goals attempted
  { name: 'fg_pct', type: 'DECIMAL(5,3)' },   // Field goal percentage
  { name: 'fgm3', type: 'INTEGER' },          // 3-pointers made
  { name: 'fga3', type: 'INTEGER' },          // 3-pointers attempted
  { name: 'fg3_pct', type: 'DECIMAL(5,3)' },  // 3-point percentage
  { name: 'ftm', type: 'INTEGER' },           // Free throws made
  { name: 'fta', type: 'INTEGER' },           // Free throws attempted
  { name: 'ft_pct', type: 'DECIMAL(5,3)' },   // Free throw percentage
  
  // Team rebounding
  { name: 'oreb', type: 'INTEGER' },          // Offensive rebounds
  { name: 'dreb', type: 'INTEGER' },          // Defensive rebounds
  { name: 'treb', type: 'INTEGER' },          // Total rebounds
  
  // Team other stats
  { name: 'ast', type: 'INTEGER' },           // Assists
  { name: 'stl', type: 'INTEGER' },           // Steals
  { name: 'blk', type: 'INTEGER' },           // Blocks
  { name: 'turnovers', type: 'INTEGER' },     // Turnovers (avoiding 'to' keyword)
  { name: 'pf', type: 'INTEGER' },            // Personal fouls
  
  // Team advanced/derived
  { name: 'pts_paint', type: 'INTEGER' },     // Points in the paint
  { name: 'pts_fastbreak', type: 'INTEGER' }, // Fast break points
  { name: 'pts_bench', type: 'INTEGER' },     // Bench points
  { name: 'pts_turnovers', type: 'INTEGER' }, // Points off turnovers
  { name: 'possessions', type: 'DECIMAL(6,1)' },  // Total possessions
  
  // Opponent shooting stats
  { name: 'opp_fgm', type: 'INTEGER' },
  { name: 'opp_fga', type: 'INTEGER' },
  { name: 'opp_fg_pct', type: 'DECIMAL(5,3)' },
  { name: 'opp_fgm3', type: 'INTEGER' },
  { name: 'opp_fga3', type: 'INTEGER' },
  { name: 'opp_fg3_pct', type: 'DECIMAL(5,3)' },
  { name: 'opp_ftm', type: 'INTEGER' },
  { name: 'opp_fta', type: 'INTEGER' },
  { name: 'opp_ft_pct', type: 'DECIMAL(5,3)' },
  
  // Opponent rebounding
  { name: 'opp_oreb', type: 'INTEGER' },
  { name: 'opp_dreb', type: 'INTEGER' },
  { name: 'opp_treb', type: 'INTEGER' },
  
  // Opponent other stats
  { name: 'opp_ast', type: 'INTEGER' },
  { name: 'opp_stl', type: 'INTEGER' },
  { name: 'opp_blk', type: 'INTEGER' },
  { name: 'opp_turnovers', type: 'INTEGER' },
  { name: 'opp_pf', type: 'INTEGER' },
  
  // Opponent advanced
  { name: 'opp_pts_paint', type: 'INTEGER' },
  { name: 'opp_pts_fastbreak', type: 'INTEGER' },
  { name: 'opp_pts_bench', type: 'INTEGER' },
  { name: 'opp_pts_turnovers', type: 'INTEGER' },
  { name: 'opp_possessions', type: 'DECIMAL(6,1)' },
  
  // Halftime scores
  { name: 'first_half_score', type: 'INTEGER' },
  { name: 'second_half_score', type: 'INTEGER' },
  { name: 'opp_first_half_score', type: 'INTEGER' },
  { name: 'opp_second_half_score', type: 'INTEGER' },
];

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database\n');

    // Get existing columns
    const existing = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'games'
    `);
    const existingCols = new Set(existing.rows.map(r => r.column_name));

    let added = 0;
    for (const col of STAT_COLUMNS) {
      if (!existingCols.has(col.name)) {
        await client.query(`ALTER TABLE games ADD COLUMN ${col.name} ${col.type}`);
        console.log(`  ✅ Added: ${col.name}`);
        added++;
      } else {
        console.log(`  ⏭️  Exists: ${col.name}`);
      }
    }

    console.log(`\n✅ Migration complete! Added ${added} new columns.`);
    
    // Show final column count
    const final = await client.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.columns 
      WHERE table_name = 'games'
    `);
    console.log(`📊 Games table now has ${final.rows[0].count} columns.`);

  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    await client.end();
  }
}

migrate();
