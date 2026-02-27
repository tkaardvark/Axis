const { resolveSource } = require('./dataSource');

/**
 * Get conference champions for a given league and season.
 * 
 * Uses an undefeated-team approach: in a single-elimination conference tournament,
 * the champion is the last team standing with zero postseason losses. A conference
 * champion is only declared when exactly ONE team in that conference's tournament
 * has no losses — meaning every other participant has been eliminated.
 * 
 * This avoids false positives from early rounds (quarterfinals/semis) or
 * tournaments with staggered bye structures.
 *
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {string} league - 'mens' or 'womens'
 * @param {string} season - Season identifier (e.g., '2025-26')
 * @param {string} [source] - Optional explicit data source override
 * @returns {Promise<Set<string>>} - Set of team_ids that are conference champions
 */
async function getConferenceChampions(pool, league, season, source) {
  try {
    const useBoxScore = resolveSource({ league, season, source }) === 'boxscore';

    let result;
    if (useBoxScore) {
      result = await pool.query(`
        WITH postseason_games AS (
          SELECT t.team_id, t.conference,
                 CASE WHEN t.team_id = e.away_team_id THEN e.away_score ELSE e.home_score END as team_score,
                 CASE WHEN t.team_id = e.away_team_id THEN e.home_score ELSE e.away_score END as opponent_score
          FROM exp_game_box_scores e
          JOIN teams t ON (t.team_id = e.away_team_id OR t.team_id = e.home_team_id) AND t.season = e.season
          WHERE t.league = $1
            AND e.season = $2
            AND e.is_postseason = true
            AND COALESCE(e.is_national_tournament, false) = false
            AND e.away_score IS NOT NULL AND e.home_score IS NOT NULL
        ),
        team_records AS (
          -- Win/loss record for each team in their conference tournament
          SELECT team_id, conference,
                 SUM(CASE WHEN team_score > opponent_score THEN 1 ELSE 0 END) as wins,
                 SUM(CASE WHEN team_score < opponent_score THEN 1 ELSE 0 END) as losses
          FROM postseason_games
          GROUP BY team_id, conference
        ),
        undefeated AS (
          -- Teams still alive (no tournament losses)
          -- Count how many undefeated teams remain per conference
          SELECT team_id, conference,
                 COUNT(*) OVER (PARTITION BY conference) as alive_count
          FROM team_records
          WHERE losses = 0
        )
        -- Champion = the sole undefeated team in a conference
        SELECT team_id FROM undefeated WHERE alive_count = 1
      `, [league, season]);
    } else {
      result = await pool.query(`
        WITH postseason_games AS (
          SELECT t.team_id, t.conference,
                 g.team_score, g.opponent_score
          FROM games g
          JOIN teams t ON g.team_id = t.team_id AND g.season = t.season
          WHERE t.league = $1
            AND g.season = $2
            AND g.is_postseason = true
            AND g.is_national_tournament = false
            AND g.is_completed = true
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
        SELECT team_id FROM undefeated WHERE alive_count = 1
      `, [league, season]);
    }

    return new Set(result.rows.map(r => r.team_id));
  } catch (error) {
    console.error('Error getting conference champions:', error);
    return new Set();
  }
}

module.exports = { getConferenceChampions };
