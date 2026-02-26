/**
 * Test that the forfeit win/loss calculation works correctly in SQL.
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const teamId = '4m7tmp4pdsr01wp4'; // Indiana Southeast
  
  // Test the raw data first
  console.log('=== Raw Game Data ===');
  const rawResult = await pool.query(`
    SELECT 
      game_date,
      CASE WHEN away_team_id = $1 THEN away_score ELSE home_score END as team_score,
      CASE WHEN away_team_id = $1 THEN home_score ELSE away_score END as opp_score,
      forfeit_team_id,
      CASE WHEN away_team_id = $1 THEN away_team_name ELSE home_team_name END as team_name
    FROM exp_game_box_scores
    WHERE (away_team_id = $1 OR home_team_id = $1) AND season = '2025-26'
    ORDER BY game_date
  `, [teamId]);
  
  let actualWins = 0, actualLosses = 0;
  let forfeitWins = 0, forfeitLosses = 0;
  
  rawResult.rows.forEach(g => {
    const wonOnCourt = g.team_score > g.opp_score;
    const isForfeit = g.forfeit_team_id === teamId;
    
    // Calculate actual result (accounting for forfeit)
    let actualWin;
    if (g.forfeit_team_id) {
      actualWin = g.forfeit_team_id !== teamId; // Win if OTHER team forfeited
    } else {
      actualWin = wonOnCourt;
    }
    
    if (actualWin) {
      actualWins++;
    } else {
      actualLosses++;
    }
    
    if (isForfeit) {
      forfeitLosses++;
      console.log(`${g.game_date.toISOString().split('T')[0]}: ${g.team_score}-${g.opp_score} (WON on court) → FORFEIT LOSS`);
    }
  });
  
  console.log(`\n=== Summary ===`);
  console.log(`Total games: ${rawResult.rows.length}`);
  console.log(`Forfeit losses: ${forfeitLosses}`);
  console.log(`Expected record: ${actualWins}-${actualLosses}`);
  
  // Now test the aggregate query
  console.log('\n=== Aggregate Query ===');
  const aggResult = await pool.query(`
    WITH flat_games AS (
      SELECT
        t.team_id,
        e.game_date,
        e.away_score as team_score,
        e.home_score as opponent_score,
        e.forfeit_team_id
      FROM exp_game_box_scores e
      JOIN teams t ON t.team_id = e.away_team_id AND t.season = e.season
      WHERE e.season = '2025-26' AND t.team_id = $1

      UNION ALL

      SELECT
        t.team_id,
        e.game_date,
        e.home_score as team_score,
        e.away_score as opponent_score,
        e.forfeit_team_id
      FROM exp_game_box_scores e
      JOIN teams t ON t.team_id = e.home_team_id AND t.season = e.season
      WHERE e.season = '2025-26' AND t.team_id = $1
    )
    SELECT
      COUNT(*) as games_played,
      SUM(CASE 
        WHEN forfeit_team_id IS NOT NULL THEN 
          CASE WHEN forfeit_team_id = team_id THEN 0 ELSE 1 END
        ELSE 
          CASE WHEN team_score > opponent_score THEN 1 ELSE 0 END 
      END) as wins,
      SUM(CASE 
        WHEN forfeit_team_id IS NOT NULL THEN 
          CASE WHEN forfeit_team_id = team_id THEN 1 ELSE 0 END
        ELSE 
          CASE WHEN team_score < opponent_score THEN 1 ELSE 0 END 
      END) as losses
    FROM flat_games
  `, [teamId]);
  
  console.log(`Query result: ${aggResult.rows[0].wins}-${aggResult.rows[0].losses} (${aggResult.rows[0].games_played} games)`);
  
  await pool.end();
}

main().catch(err => {
  console.error('Error:', err);
  pool.end();
  process.exit(1);
});
