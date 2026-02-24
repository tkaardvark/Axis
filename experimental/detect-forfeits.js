/**
 * Detect potential forfeits by checking for data inconsistencies.
 * 
 * Since Presto Sports team pages require JavaScript rendering, this script:
 * 1. Lists all currently marked forfeits
 * 2. Identifies games with unusual score patterns (one team has 0 points, low scores)
 * 3. Compares win/loss counts to help identify discrepancies
 * 
 * For complete forfeit detection, manual verification against Presto Sports 
 * team pages is required.
 * 
 * Usage: node experimental/detect-forfeits.js [--season 2025-26] [--league mens]
 */

require('dotenv').config();
const { pool } = require('../db/pool');

// Parse command line args
const args = process.argv.slice(2);
const getArg = (name, defaultVal) => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal;
};

const SEASON = getArg('season', '2025-26');
const LEAGUE = getArg('league', 'mens');

async function main() {
  console.log(`Forfeit Detection Report - ${LEAGUE} ${SEASON}`);
  console.log('='.repeat(50));
  
  // 1. List all currently marked forfeits
  console.log('\n1. CURRENTLY MARKED FORFEITS:');
  const forfeitsResult = await pool.query(`
    SELECT 
      game_date,
      away_team_name,
      home_team_name,
      away_score,
      home_score,
      CASE 
        WHEN forfeit_team_id = away_team_id THEN away_team_name
        ELSE home_team_name 
      END as forfeit_by
    FROM exp_game_box_scores 
    WHERE season = $1 AND league = $2 AND forfeit_team_id IS NOT NULL
    ORDER BY game_date
  `, [SEASON, LEAGUE]);
  
  if (forfeitsResult.rows.length === 0) {
    console.log('   (none)');
  } else {
    forfeitsResult.rows.forEach(g => {
      console.log(`   ${g.game_date.toISOString().slice(0,10)}: ${g.away_team_name} ${g.away_score} @ ${g.home_team_name} ${g.home_score} - Forfeit by ${g.forfeit_by}`);
    });
  }
  console.log(`\n   Total: ${forfeitsResult.rows.length} forfeits marked`);
  
  // 2. Find potential unmarked forfeits (2-0 scores)
  console.log('\n2. POTENTIAL UNMARKED FORFEITS (2-0 scores):');
  const potentialResult = await pool.query(`
    SELECT 
      game_date,
      away_team_name,
      home_team_name,
      away_score,
      home_score
    FROM exp_game_box_scores 
    WHERE season = $1 AND league = $2 
      AND forfeit_team_id IS NULL
      AND ((away_score = 2 AND home_score = 0) OR (away_score = 0 AND home_score = 2))
    ORDER BY game_date
  `, [SEASON, LEAGUE]);
  
  if (potentialResult.rows.length === 0) {
    console.log('   ✓ No unmarked 2-0 games found');
  } else {
    potentialResult.rows.forEach(g => {
      console.log(`   ${g.game_date.toISOString().slice(0,10)}: ${g.away_team_name} ${g.away_score} @ ${g.home_team_name} ${g.home_score}`);
    });
  }
  
  // 3. Teams with suspiciously high forfeit counts
  console.log('\n3. TEAMS WITH MULTIPLE FORFEITS:');
  const teamForfeitsResult = await pool.query(`
    SELECT 
      CASE WHEN forfeit_team_id = away_team_id THEN away_team_name ELSE home_team_name END as team_name,
      COUNT(*) as forfeit_count
    FROM exp_game_box_scores 
    WHERE season = $1 AND league = $2 AND forfeit_team_id IS NOT NULL
    GROUP BY team_name
    ORDER BY forfeit_count DESC
  `, [SEASON, LEAGUE]);
  
  if (teamForfeitsResult.rows.length === 0) {
    console.log('   (none)');
  } else {
    teamForfeitsResult.rows.forEach(t => {
      console.log(`   ${t.team_name}: ${t.forfeit_count} forfeits`);
    });
  }
  
  // 4. Games with very low total scores (potential data issues or forfeits)
  console.log('\n4. GAMES WITH UNUSUALLY LOW SCORES (<60 total):');
  const lowScoreResult = await pool.query(`
    SELECT 
      game_date,
      away_team_name,
      home_team_name,
      away_score,
      home_score,
      (away_score + home_score) as total
    FROM exp_game_box_scores 
    WHERE season = $1 AND league = $2 
      AND forfeit_team_id IS NULL
      AND (away_score + home_score) < 60
    ORDER BY total ASC
    LIMIT 20
  `, [SEASON, LEAGUE]);
  
  if (lowScoreResult.rows.length === 0) {
    console.log('   ✓ No unusually low scoring games found');
  } else {
    lowScoreResult.rows.forEach(g => {
      console.log(`   ${g.game_date.toISOString().slice(0,10)}: ${g.away_team_name} ${g.away_score} @ ${g.home_team_name} ${g.home_score} (total: ${g.total})`);
    });
  }
  
  // 5. Record comparison summary
  console.log('\n5. TO MANUALLY VERIFY FORFEITS:');
  console.log('   Visit each team\'s game log on Presto Sports and look for');
  console.log('   games showing "2-0 L" where our data shows a win.');
  console.log('   URL format: https://naiastats.prestosports.com/sports/mbkb/2025-26/teams/{team-slug}');
  console.log('\n   Teams to prioritize (teams we beat that might have beat us officially):');
  
  // Find teams that have had opponents forfeit to them
  const beneficiariesResult = await pool.query(`
    SELECT DISTINCT
      CASE WHEN forfeit_team_id = away_team_id THEN home_team_name ELSE away_team_name END as team_name
    FROM exp_game_box_scores 
    WHERE season = $1 AND league = $2 AND forfeit_team_id IS NOT NULL
    ORDER BY team_name
  `, [SEASON, LEAGUE]);
  
  if (beneficiariesResult.rows.length > 0) {
    console.log('   Opponents of teams that forfeited (they may have additional forfeits to report):');
    beneficiariesResult.rows.forEach(t => {
      console.log(`     - ${t.team_name}`);
    });
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('Report complete.');
  
  await pool.end();
}

main().catch(err => {
  console.error('Error:', err);
  pool.end();
  process.exit(1);
});
