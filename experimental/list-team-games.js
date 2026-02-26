require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const result = await pool.query(`
    SELECT game_date, away_team_name, home_team_name, away_score, home_score, forfeit_team_id 
    FROM exp_game_box_scores 
    WHERE (away_team_id = '4m7tmp4pdsr01wp4' OR home_team_id = '4m7tmp4pdsr01wp4') 
      AND season = '2025-26' 
    ORDER BY game_date
  `);
  
  console.log('Indiana Southeast Games:\n');
  result.rows.forEach(g => {
    const forfeit = g.forfeit_team_id ? ' (FORFEIT)' : '';
    console.log(`${g.game_date.toISOString().split('T')[0]}: ${g.away_team_name} ${g.away_score} @ ${g.home_team_name} ${g.home_score}${forfeit}`);
  });
  
  const forfeits = result.rows.filter(g => g.forfeit_team_id);
  console.log(`\nTotal games: ${result.rows.length}`);
  console.log(`Forfeits marked: ${forfeits.length}`);
  
  await pool.end();
}

main().catch(err => {
  console.error('Error:', err);
  pool.end();
  process.exit(1);
});
