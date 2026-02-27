const { pool } = require('./db/pool');

(async () => {
  try {
    const res = await pool.query(`
      WITH postseason_games AS (
        SELECT t.team_id, t.name as team_name, t.conference,
               CASE WHEN t.team_id = e.away_team_id THEN e.away_score ELSE e.home_score END as team_score,
               CASE WHEN t.team_id = e.away_team_id THEN e.home_score ELSE e.away_score END as opponent_score,
               e.game_date, e.away_team_name, e.home_team_name, e.away_score, e.home_score
        FROM exp_game_box_scores e
        JOIN teams t ON (t.team_id = e.away_team_id OR t.team_id = e.home_team_id) AND t.season = e.season
        WHERE t.league = 'mens'
          AND e.season = '2025-26'
          AND e.is_postseason = true
          AND COALESCE(e.is_national_tournament, false) = false
          AND e.away_score IS NOT NULL AND e.home_score IS NOT NULL
          AND t.conference = 'Continental Athletic Conference'
      )
      SELECT team_id, team_name, conference, team_score, opponent_score,
             game_date, away_team_name, home_team_name, away_score, home_score,
             CASE WHEN team_score > opponent_score THEN 'W' ELSE 'L' END as result
      FROM postseason_games
      ORDER BY game_date, team_name
    `);

    console.log('\n=== CAC Postseason Games (mens) ===');
    for (const r of res.rows) {
      console.log(r.game_date.toISOString().slice(0,10) + ' | ' + r.team_name + ' (' + r.result + ') ' + r.team_score + '-' + r.opponent_score + ' | ' + r.away_team_name + ' vs ' + r.home_team_name);
    }

    const rec = await pool.query(`
      WITH postseason_games AS (
        SELECT t.team_id, t.name as team_name, t.conference,
               CASE WHEN t.team_id = e.away_team_id THEN e.away_score ELSE e.home_score END as team_score,
               CASE WHEN t.team_id = e.away_team_id THEN e.home_score ELSE e.away_score END as opponent_score
        FROM exp_game_box_scores e
        JOIN teams t ON (t.team_id = e.away_team_id OR t.team_id = e.home_team_id) AND t.season = e.season
        WHERE t.league = 'mens'
          AND e.season = '2025-26'
          AND e.is_postseason = true
          AND COALESCE(e.is_national_tournament, false) = false
          AND e.away_score IS NOT NULL AND e.home_score IS NOT NULL
          AND t.conference = 'Continental Athletic Conference'
      ),
      team_records AS (
        SELECT team_id, team_name, conference,
               SUM(CASE WHEN team_score > opponent_score THEN 1 ELSE 0 END)::int as wins,
               SUM(CASE WHEN team_score < opponent_score THEN 1 ELSE 0 END)::int as losses
        FROM postseason_games
        GROUP BY team_id, team_name, conference
      )
      SELECT *,
             CASE WHEN losses = 0 THEN 'UNDEFEATED' ELSE 'ELIMINATED' END as status
      FROM team_records
      ORDER BY losses, wins DESC
    `);

    console.log('\n=== CAC Postseason Records ===');
    for (const r of rec.rows) {
      console.log(r.team_name + ': ' + r.wins + 'W-' + r.losses + 'L (' + r.status + ')');
    }

    const undefeatedCount = rec.rows.filter(r => r.losses === 0).length;
    console.log('\nUndefeated count: ' + undefeatedCount);
    if (undefeatedCount === 1) {
      console.log('=> Would declare champion: ' + rec.rows.find(r => r.losses === 0).team_name);
    } else {
      console.log('=> No champion declared (multiple or zero undefeated)');
    }

    // Also check: what conferences currently show champions?
    const champs = await pool.query(`
      WITH postseason_games AS (
        SELECT t.team_id, t.conference,
               CASE WHEN t.team_id = e.away_team_id THEN e.away_score ELSE e.home_score END as team_score,
               CASE WHEN t.team_id = e.away_team_id THEN e.home_score ELSE e.away_score END as opponent_score
        FROM exp_game_box_scores e
        JOIN teams t ON (t.team_id = e.away_team_id OR t.team_id = e.home_team_id) AND t.season = e.season
        WHERE t.league = 'mens'
          AND e.season = '2025-26'
          AND e.is_postseason = true
          AND COALESCE(e.is_national_tournament, false) = false
          AND e.away_score IS NOT NULL AND e.home_score IS NOT NULL
      ),
      team_records AS (
        SELECT team_id, conference,
               SUM(CASE WHEN team_score > opponent_score THEN 1 ELSE 0 END) as wins,
               SUM(CASE WHEN team_score < opponent_score THEN 1 ELSE 0 END) as losses
        FROM postseason_games
        GROUP BY team_id, conference
      ),
      undefeated AS (
        SELECT team_id, conference,
               COUNT(*) OVER (PARTITION BY conference) as alive_count
        FROM team_records
        WHERE losses = 0
      )
      SELECT u.conference, u.alive_count, t.name as team_name
      FROM undefeated u
      JOIN teams t ON u.team_id = t.team_id AND t.season = '2025-26'
      WHERE u.alive_count = 1
      ORDER BY u.conference
    `);

    console.log('\n=== Currently Declared Champions (mens) ===');
    for (const r of champs.rows) {
      console.log(r.conference + ': ' + r.team_name);
    }

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
})();
