/**
 * Mark Indiana Southeast's forfeited games.
 * 
 * Based on the official game log, Indiana Southeast has forfeited multiple games
 * due to a violation. These are marked with 2-0 scores in the official record.
 * 
 * We need to mark these in our database so the record calculations are correct.
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Games that Indiana Southeast forfeited (based on game log showing 2-0 losses)
// These dates are from the official NAIA game log
const FORFEIT_DATES = [
  '2025-10-24', // at Georgetown (Ky.) - L, 2-0
  '2025-10-28', // vs. Simmons (KY) - L, 2-0
  '2025-11-04', // vs. Miami-Middletown - L, 2-0
  '2025-11-15', // at Marian - L, 2-0
  '2025-11-19', // at Miami-Middletown - L, 2-0
  '2025-12-06', // vs. IU Kokomo - L, 2-0
  '2025-12-09', // at Campbellsville (KY) - L, 2-0
  '2025-12-14', // vs. Asbury - L, 2-0
  '2025-12-18', // at Point Park - L, 2-0
  '2025-12-21', // vs. Brescia - L, 2-0
  '2026-01-04', // at Bethel (TN) - L, 2-0
  '2026-01-08', // at IU Kokomo - L, 2-0
  '2026-01-25', // vs. Mid-America Christian - L, 2-0
  '2026-02-01', // vs. Cumberlands (Ky.) - L, 2-0
  '2026-02-08', // at Brescia - L, 2-0
  '2026-02-15', // vs. Pikeville - L, 2-0
];

async function main() {
  console.log('Marking Indiana Southeast forfeits...\n');
  
  // Get Indiana Southeast's team_id
  const teamResult = await pool.query(`
    SELECT team_id, name FROM teams 
    WHERE name = 'Indiana Southeast' AND season = '2025-26' AND league = 'mens'
  `);
  
  if (teamResult.rows.length === 0) {
    console.log('ERROR: Indiana Southeast not found');
    return;
  }
  
  const seTeamId = teamResult.rows[0].team_id;
  console.log(`Indiana Southeast team_id: ${seTeamId}\n`);
  
  let marked = 0;
  let alreadyMarked = 0;
  let notFound = 0;
  
  for (const date of FORFEIT_DATES) {
    // Find the game on this date involving Indiana Southeast
    const gameResult = await pool.query(`
      SELECT id, game_date, away_team_name, home_team_name, away_team_id, home_team_id, 
             away_score, home_score, forfeit_team_id
      FROM exp_game_box_scores
      WHERE (away_team_id = $1 OR home_team_id = $1)
        AND game_date = $2
        AND season = '2025-26'
    `, [seTeamId, date]);
    
    if (gameResult.rows.length === 0) {
      console.log(`  ${date}: No game found - SKIPPED`);
      notFound++;
      continue;
    }
    
    const game = gameResult.rows[0];
    
    if (game.forfeit_team_id) {
      console.log(`  ${date}: ${game.away_team_name} vs ${game.home_team_name} - ALREADY MARKED`);
      alreadyMarked++;
      continue;
    }
    
    // Mark Indiana Southeast as the forfeiting team
    await pool.query(`
      UPDATE exp_game_box_scores 
      SET forfeit_team_id = $1, updated_at = NOW()
      WHERE id = $2
    `, [seTeamId, game.id]);
    
    console.log(`  ${date}: ${game.away_team_name} ${game.away_score} vs ${game.home_team_name} ${game.home_score} - MARKED`);
    marked++;
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Marked as forfeits: ${marked}`);
  console.log(`Already marked: ${alreadyMarked}`);
  console.log(`Not found: ${notFound}`);
  
  await pool.end();
}

main().catch(err => {
  console.error('Error:', err);
  pool.end();
  process.exit(1);
});
