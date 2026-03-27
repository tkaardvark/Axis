const { pool } = require('./db/pool');
const { TOURNAMENT_BRACKET_2026 } = require('./config/tournament-bracket-2026');

(async () => {
  try {
    const r1 = await pool.query(
      "SELECT COUNT(*) as cnt FROM exp_game_box_scores WHERE season='2025-26' AND league='mens' AND COALESCE(is_national_tournament, false) = true AND home_score IS NOT NULL"
    );
    console.log('Tournament games with scores:', r1.rows[0].cnt);

    const r3 = await pool.query(
      "SELECT game_date::text, COUNT(*) as cnt FROM exp_game_box_scores WHERE season='2025-26' AND league='mens' AND COALESCE(is_national_tournament, false) = true GROUP BY game_date ORDER BY game_date"
    );
    console.log('By date:');
    r3.rows.forEach(r => console.log('  ', r.game_date, '->', r.cnt, 'games'));

    // Get bracket team IDs
    const bracketTeamIds = new Set();
    for (const q of TOURNAMENT_BRACKET_2026.quadrants) {
      for (const pod of q.pods) {
        for (const t of pod.teams) {
          bracketTeamIds.add(t.teamId);
        }
      }
    }
    console.log('\nBracket has', bracketTeamIds.size, 'teams');

    // Check non-tournament games involving bracket teams after March 11
    const r5 = await pool.query(`
      SELECT home_team_id, away_team_id, home_score, away_score, game_date::text, box_score_url
      FROM exp_game_box_scores 
      WHERE season='2025-26' AND league='mens' 
        AND game_date >= '2026-03-11'
        AND COALESCE(is_national_tournament, false) = false
        AND home_score IS NOT NULL
      ORDER BY game_date
    `);
    const bracketGames = r5.rows.filter(r => 
      bracketTeamIds.has(r.home_team_id) && bracketTeamIds.has(r.away_team_id)
    );
    console.log('\nNon-tournament games between bracket teams (March 11+):', bracketGames.length);
    bracketGames.forEach(r => {
      console.log('  ', r.game_date, r.home_team_id, 'vs', r.away_team_id, ':', r.home_score + '-' + r.away_score);
    });

    // Check if there are games from March 13-16 that exist but aren't flagged as tournament
    const r4 = await pool.query(`
      SELECT game_date::text, COUNT(*) as cnt 
      FROM exp_game_box_scores 
      WHERE season='2025-26' AND league='mens' 
        AND game_date >= '2026-03-11'
        AND COALESCE(is_national_tournament, false) = false
      GROUP BY game_date ORDER BY game_date
    `);
    console.log('\nNon-tournament games by date (March 11+):');
    r4.rows.forEach(r => console.log('  ', r.game_date, '->', r.cnt, 'games'));

    // Find bracket teams with no tournament games
    const r6 = await pool.query(`
      SELECT home_team_id, away_team_id
      FROM exp_game_box_scores 
      WHERE season='2025-26' AND league='mens' 
        AND COALESCE(is_national_tournament, false) = true
        AND home_score IS NOT NULL
    `);
    const teamsWithGames = new Set();
    r6.rows.forEach(r => {
      teamsWithGames.add(r.home_team_id);
      teamsWithGames.add(r.away_team_id);
    });
    const teamsWithout = [...bracketTeamIds].filter(id => !teamsWithGames.has(id));
    console.log('\nBracket teams with NO tournament games found:', teamsWithout.length);
    
    if (teamsWithout.length > 0) {
      const nameQuery = await pool.query(
        "SELECT team_id, team_name FROM teams WHERE team_id = ANY($1)",
        [teamsWithout]
      );
      const nameMap = {};
      nameQuery.rows.forEach(r => nameMap[r.team_id] = r.team_name);
      teamsWithout.forEach(id => console.log('  ', id, '->', nameMap[id] || 'UNKNOWN'));
    }

    await pool.end();
  } catch (err) {
    console.error(err);
    await pool.end();
    process.exit(1);
  }
})();
