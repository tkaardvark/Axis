/**
 * Get conference champions for a given league and season
 * A conference champion is the team that won the latest conference tournament game
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {string} league - 'mens' or 'womens'
 * @param {string} season - Season identifier (e.g., '2025-26')
 * @returns {Promise<Set<string>>} - Set of team_ids that are conference champions
 */
async function getConferenceChampions(pool, league, season) {
  try {
    // Find the conference championship by identifying the main conference tournament.
    // The main tournament is identified by finding the date with the most teams playing,
    // then including all dates within a 10-day window that have continuous activity
    // (gaps of 5+ days indicate a separate tournament like a play-in).
    const result = await pool.query(`
      WITH postseason_games AS (
        SELECT t.team_id, t.name, t.conference, g.game_date, g.game_id,
               g.team_score, g.opponent_score
        FROM games g
        JOIN teams t ON g.team_id = t.team_id AND g.season = t.season
        WHERE t.league = $1
          AND g.season = $2
          AND g.is_postseason = true
          AND g.is_national_tournament = false
          AND g.is_completed = true
      ),
      conf_game_dates AS (
        -- Count how many teams from each conference played on each date
        SELECT conference, game_date, COUNT(DISTINCT team_id) as teams_playing
        FROM postseason_games
        GROUP BY conference, game_date
      ),
      tournament_peak AS (
        -- Find the date with the MOST teams playing (start of main tournament bracket)
        SELECT conference, game_date as peak_date, teams_playing,
               ROW_NUMBER() OVER (PARTITION BY conference ORDER BY teams_playing DESC, game_date ASC) as rn
        FROM conf_game_dates
      ),
      main_tournament_dates AS (
        -- Get dates within 10 days of peak
        SELECT cd.conference, cd.game_date, cd.teams_playing,
               LAG(cd.game_date) OVER (PARTITION BY cd.conference ORDER BY cd.game_date) as prev_date
        FROM conf_game_dates cd
        JOIN tournament_peak tp ON cd.conference = tp.conference AND tp.rn = 1
        WHERE cd.game_date >= tp.peak_date - INTERVAL '1 day'
          AND cd.game_date <= tp.peak_date + INTERVAL '10 days'
      ),
      continuous_tournament AS (
        -- Filter to only include dates that are within 4 days of the previous date (continuous tournament)
        SELECT conference, game_date, teams_playing
        FROM main_tournament_dates
        WHERE prev_date IS NULL OR (game_date - prev_date) <= 4
      ),
      championship_dates AS (
        -- Find the last date with 2+ teams within the continuous main tournament
        SELECT conference, MAX(game_date) as champ_date
        FROM continuous_tournament
        WHERE teams_playing >= 2
        GROUP BY conference
      ),
      championship_winners AS (
        -- Find the team that won on the championship date for each conference
        SELECT pg.team_id, pg.conference,
               ROW_NUMBER() OVER (PARTITION BY pg.conference ORDER BY pg.game_id DESC) as rn
        FROM postseason_games pg
        JOIN championship_dates cd ON pg.conference = cd.conference AND pg.game_date = cd.champ_date
        WHERE pg.team_score > pg.opponent_score
      )
      SELECT team_id FROM championship_winners WHERE rn = 1
    `, [league, season]);

    return new Set(result.rows.map(r => r.team_id));
  } catch (error) {
    console.error('Error getting conference champions:', error);
    return new Set();
  }
}

module.exports = { getConferenceChampions };
