require('dotenv').config();
const { Client } = require('pg');

async function query() {
  const client = new Client({ 
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false } 
  });
  
  await client.connect();
  
  const graceId = 'gjjg68o96u18nogw';
  
  // Check ALL games including non-NAIA
  const result = await client.query(
    'SELECT game_date, opponent_name, team_score, opponent_score, is_naia_game, is_completed FROM games WHERE team_id = $1 ORDER BY game_date', 
    [graceId]
  );
  
  console.log('All Grace games (including non-NAIA):');
  result.rows.forEach(g => {
    const res = g.team_score > g.opponent_score ? 'W' : 'L';
    const date = g.game_date ? g.game_date.toISOString().split('T')[0] : 'no date';
    console.log(`  ${date} vs ${g.opponent_name}: ${g.team_score}-${g.opponent_score} (${res}) | NAIA: ${g.is_naia_game} | Completed: ${g.is_completed}`);
  });
  
  console.log('\nBreakdown:');
  console.log('  Total games:', result.rows.length);
  console.log('  NAIA games:', result.rows.filter(g => g.is_naia_game === true).length);
  console.log('  Non-NAIA games:', result.rows.filter(g => g.is_naia_game === false).length);
  console.log('  Completed:', result.rows.filter(g => g.is_completed === true).length);
  
  await client.end();
}

query();
