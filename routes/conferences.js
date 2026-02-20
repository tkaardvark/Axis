const express = require('express');
const router = express.Router();
const { pool, DEFAULT_SEASON } = require('../db/pool');
const { resolveSource } = require('../utils/dataSource');

// Get conference games for a specific date
router.get('/api/conferences/:conference/games', async (req, res) => {
  try {
    const { conference } = req.params;
    const { league = 'mens', season = DEFAULT_SEASON, date, startDate, endDate, completed, source } = req.query;
    const useBoxScore = resolveSource({ league, season, source }) === 'boxscore';

    // Get all teams in this conference
    const teamsResult = await pool.query(`
      SELECT team_id, name, logo_url
      FROM teams
      WHERE conference = $1 AND league = $2 AND season = $3 AND is_excluded = FALSE
    `, [decodeURIComponent(conference), league, season]);

    const teamIds = teamsResult.rows.map(t => t.team_id);
    const teamsMap = {};
    teamsResult.rows.forEach(t => {
      teamsMap[t.team_id] = { name: t.name, logo_url: t.logo_url };
    });

    if (teamIds.length === 0) {
      return res.json({ games: [] });
    }

    if (useBoxScore) {
      const games = [];

      // Completed games from box scores
      if (completed !== 'false') {
        const bsParams = [teamIds, season];
        let bsDateCond = '';
        if (date) { bsParams.push(date); bsDateCond = `AND DATE(e.game_date) = $${bsParams.length}::date`; }
        else if (startDate && endDate) { bsParams.push(startDate, endDate); bsDateCond = `AND DATE(e.game_date) >= $${bsParams.length - 1}::date AND DATE(e.game_date) <= $${bsParams.length}::date`; }

        const bsResult = await pool.query(`
          SELECT e.id as game_id, e.game_date,
            e.away_team_id, e.away_team_name, e.away_score,
            e.home_team_id, e.home_team_name, e.home_score,
            e.is_conference, e.is_neutral,
            t_away.name as away_name, t_away.logo_url as away_logo,
            t_away.conference as away_conference,
            t_home.name as home_name, t_home.logo_url as home_logo,
            t_home.conference as home_conference
          FROM exp_game_box_scores e
          LEFT JOIN teams t_away ON e.away_team_id = t_away.team_id AND t_away.season = e.season
          LEFT JOIN teams t_home ON e.home_team_id = t_home.team_id AND t_home.season = e.season
          WHERE (e.away_team_id = ANY($1) OR e.home_team_id = ANY($1))
            AND e.season = $2
            AND e.away_score IS NOT NULL AND e.home_score IS NOT NULL
            ${bsDateCond}
          ORDER BY e.game_date ASC
        `, bsParams);

        for (const row of bsResult.rows) {
          const awayInConf = teamIds.includes(row.away_team_id);
          const homeInConf = teamIds.includes(row.home_team_id);
          games.push({
            game_id: row.game_id,
            date: row.game_date,
            home_team: {
              team_id: row.home_team_id,
              name: row.home_name || row.home_team_name,
              logo_url: row.home_logo,
              score: row.home_score,
            },
            away_team: {
              team_id: row.away_team_id,
              name: row.away_name || row.away_team_name,
              logo_url: row.away_logo,
              score: row.away_score,
            },
            location: row.is_neutral ? 'neutral' : 'home',
            is_completed: true,
            is_conference_matchup: awayInConf && homeInConf,
            opponent_conference: awayInConf ? row.home_conference : row.away_conference,
          });
        }
      }

      // Future games
      if (completed !== 'true') {
        const fgParams = [teamIds, season];
        let fgDateCond = '';
        if (date) { fgParams.push(date); fgDateCond = `AND DATE(f.game_date) = $${fgParams.length}::date`; }
        else if (startDate && endDate) { fgParams.push(startDate, endDate); fgDateCond = `AND DATE(f.game_date) >= $${fgParams.length - 1}::date AND DATE(f.game_date) <= $${fgParams.length}::date`; }

        const fgResult = await pool.query(`
          SELECT f.id as game_id, f.team_id, f.opponent_id, f.opponent_name,
            f.game_date, f.location, f.is_conference,
            t_team.name as team_name, t_team.logo_url as team_logo,
            t_opp.name as opp_name, t_opp.logo_url as opp_logo,
            t_opp.conference as opp_conference
          FROM future_games f
          JOIN teams t_team ON f.team_id = t_team.team_id AND t_team.season = $2
          LEFT JOIN teams t_opp ON f.opponent_id = t_opp.team_id AND t_opp.season = $2
          WHERE f.team_id = ANY($1)
            AND f.season = $2
            ${fgDateCond}
          ORDER BY f.game_date ASC
        `, fgParams);

        // Deduplicate (each future game may appear from both teams' perspective)
        const seenFuture = new Set();
        for (const row of fgResult.rows) {
          const ids = [row.team_id, row.opponent_id].filter(Boolean).sort();
          const key = `${ids[0]}-${ids[1]}-${row.game_date}`;
          if (seenFuture.has(key)) continue;
          seenFuture.add(key);

          const isConfMatchup = teamIds.includes(row.opponent_id);
          games.push({
            game_id: `future_${row.game_id}`,
            date: row.game_date,
            home_team: row.location === 'home' ? {
              team_id: row.team_id,
              name: row.team_name,
              logo_url: row.team_logo,
              score: null,
            } : {
              team_id: row.opponent_id,
              name: row.opp_name || row.opponent_name,
              logo_url: row.opp_logo,
              score: null,
            },
            away_team: row.location === 'away' ? {
              team_id: row.team_id,
              name: row.team_name,
              logo_url: row.team_logo,
              score: null,
            } : {
              team_id: row.opponent_id,
              name: row.opp_name || row.opponent_name,
              logo_url: row.opp_logo,
              score: null,
            },
            location: row.location,
            is_completed: false,
            is_conference_matchup: isConfMatchup,
            opponent_conference: row.opp_conference,
          });
        }
      }

      return res.json({ games });
    }

    // Legacy path
    // Build date filter conditions
    const queryParams = [teamIds, season];
    let dateCondition = '';
    if (date) {
      queryParams.push(date);
      dateCondition = `AND DATE(g.game_date) = $${queryParams.length}::date`;
    } else if (startDate && endDate) {
      queryParams.push(startDate, endDate);
      dateCondition = `AND DATE(g.game_date) >= $${queryParams.length - 1}::date AND DATE(g.game_date) <= $${queryParams.length}::date`;
    }

    let completedCondition = '';
    if (completed === 'true') {
      completedCondition = 'AND g.is_completed = TRUE';
    } else if (completed === 'false') {
      completedCondition = 'AND g.is_completed = FALSE';
    }

    // Get games for these teams (optionally filtered by date)
    const gamesResult = await pool.query(`
      SELECT
        g.game_id,
        g.team_id,
        g.opponent_id,
        g.opponent_name,
        g.game_date,
        g.location,
        g.team_score,
        g.opponent_score,
        g.is_completed,
        g.is_conference,
        g.is_naia_game,
        t_home.name as team_name,
        t_home.logo_url as team_logo_url,
        t_opp.name as opponent_team_name,
        t_opp.logo_url as opponent_logo_url,
        t_opp.conference as opponent_conference
      FROM games g
      JOIN teams t_home ON g.team_id = t_home.team_id AND t_home.season = $2
      LEFT JOIN teams t_opp ON g.opponent_id = t_opp.team_id AND t_opp.season = $2
      WHERE g.team_id = ANY($1)
        AND g.season = $2
        ${dateCondition}
        ${completedCondition}
      ORDER BY g.game_date ASC, t_home.name ASC
    `, queryParams);

    // Deduplicate games (each game appears twice - once for each team)
    // Keep only one record per matchup
    const seenMatchups = new Set();
    const games = [];

    gamesResult.rows.forEach(game => {
      // Create a unique key for the matchup (sorted team IDs)
      const ids = [game.team_id, game.opponent_id].filter(Boolean).sort();
      const matchupKey = `${ids[0]}-${ids[1]}-${game.game_date}`;

      if (!seenMatchups.has(matchupKey)) {
        seenMatchups.add(matchupKey);

        // Determine if this is a conference game between two conference teams
        const isConferenceMatchup = teamIds.includes(game.opponent_id);

        games.push({
          game_id: game.game_id,
          date: game.game_date,
          home_team: game.location === 'home' ? {
            team_id: game.team_id,
            name: game.team_name,
            logo_url: game.team_logo_url,
            score: game.team_score,
          } : {
            team_id: game.opponent_id,
            name: game.opponent_team_name || game.opponent_name,
            logo_url: game.opponent_logo_url,
            score: game.opponent_score,
          },
          away_team: game.location === 'away' ? {
            team_id: game.team_id,
            name: game.team_name,
            logo_url: game.team_logo_url,
            score: game.team_score,
          } : {
            team_id: game.opponent_id,
            name: game.opponent_team_name || game.opponent_name,
            logo_url: game.opponent_logo_url,
            score: game.opponent_score,
          },
          location: game.location,
          is_completed: game.is_completed,
          is_conference_matchup: isConferenceMatchup,
          opponent_conference: game.opponent_conference,
        });
      }
    });

    res.json({ games });
  } catch (err) {
    console.error('Error fetching conference games:', err);
    res.status(500).json({ error: 'Failed to fetch conference games' });
  }
});

// Get conference summary/aggregate stats
router.get('/api/conferences/:conference/summary', async (req, res) => {
  try {
    const { conference } = req.params;
    const { league = 'mens', season = DEFAULT_SEASON, source } = req.query;
    const confName = decodeURIComponent(conference);
    const useBoxScore = resolveSource({ league, season, source }) === 'boxscore';

    // Build the non-conf record CTE based on data source
    const nonConfRecordCte = useBoxScore ? `
      non_conf_record AS (
        SELECT
          SUM(CASE WHEN team_score > opponent_score THEN 1 ELSE 0 END) as nc_wins,
          SUM(CASE WHEN team_score < opponent_score THEN 1 ELSE 0 END) as nc_losses
        FROM (
          SELECT e.away_score as team_score, e.home_score as opponent_score
          FROM exp_game_box_scores e
          JOIN conf_teams ct ON e.away_team_id = ct.team_id
          WHERE e.season = $3 AND COALESCE(e.is_naia_game, false) = true
            AND e.is_conference = false AND e.is_exhibition = false
            AND e.away_score IS NOT NULL AND e.home_score IS NOT NULL
          UNION ALL
          SELECT e.home_score as team_score, e.away_score as opponent_score
          FROM exp_game_box_scores e
          JOIN conf_teams ct ON e.home_team_id = ct.team_id
          WHERE e.season = $3 AND COALESCE(e.is_naia_game, false) = true
            AND e.is_conference = false AND e.is_exhibition = false
            AND e.away_score IS NOT NULL AND e.home_score IS NOT NULL
        ) sub
      )
    ` : `
      non_conf_record AS (
        SELECT
          SUM(CASE WHEN g.team_score > g.opponent_score THEN 1 ELSE 0 END) as nc_wins,
          SUM(CASE WHEN g.team_score < g.opponent_score THEN 1 ELSE 0 END) as nc_losses
        FROM games g
        JOIN conf_teams ct ON g.team_id = ct.team_id
        WHERE g.season = $3 AND g.is_completed = TRUE AND g.is_naia_game = TRUE AND g.is_conference = FALSE
      )
    `;

    // Get aggregate stats for all teams in this conference
    const result = await pool.query(`
      WITH conf_teams AS (
        SELECT t.team_id, t.name
        FROM teams t
        WHERE t.conference = $1 AND t.league = $2 AND t.season = $3 AND t.is_excluded = FALSE
      ),
      latest_ratings AS (
        SELECT tr.*
        FROM team_ratings tr
        INNER JOIN (
          SELECT team_id, MAX(date_calculated) as max_date
          FROM team_ratings
          WHERE season = $3
          GROUP BY team_id
        ) latest ON tr.team_id = latest.team_id AND tr.date_calculated = latest.max_date
        WHERE tr.season = $3
      ),
      ${nonConfRecordCte},
      all_teams_ranked AS (
        SELECT
          t.team_id,
          t.conference,
          lr.rpi,
          ROW_NUMBER() OVER (ORDER BY lr.rpi DESC) as rpi_rank
        FROM teams t
        JOIN latest_ratings lr ON t.team_id = lr.team_id
        WHERE t.league = $2 AND t.season = $3 AND t.is_excluded = FALSE AND lr.rpi IS NOT NULL
      )
      SELECT
        COUNT(ct.team_id) as team_count,
        ROUND(AVG(lr.rpi)::numeric, 4) as avg_rpi,
        ROUND(AVG(lr.adjusted_net_rating)::numeric, 2) as avg_adj_net,
        ROUND(AVG(lr.adjusted_offensive_rating)::numeric, 2) as avg_adj_ortg,
        ROUND(AVG(lr.adjusted_defensive_rating)::numeric, 2) as avg_adj_drtg,
        ROUND(AVG(lr.strength_of_schedule)::numeric, 4) as avg_sos,
        ROUND(AVG(lr.efg_pct)::numeric, 4) as avg_efg_pct,
        ROUND(AVG(lr.turnover_pct)::numeric, 4) as avg_to_rate,
        ROUND(AVG(lr.oreb_pct)::numeric, 4) as avg_oreb_pct,
        ROUND(AVG(lr.ft_rate)::numeric, 4) as avg_ft_rate,
        ROUND(AVG(lr.pace)::numeric, 1) as avg_pace,
        ROUND(AVG(lr.three_pt_rate)::numeric, 4) as avg_three_pt_rate,
        MIN(atr.rpi_rank) as best_rpi_rank,
        MAX(atr.rpi_rank) as worst_rpi_rank,
        nc.nc_wins,
        nc.nc_losses
      FROM conf_teams ct
      LEFT JOIN latest_ratings lr ON ct.team_id = lr.team_id
      LEFT JOIN all_teams_ranked atr ON ct.team_id = atr.team_id
      CROSS JOIN non_conf_record nc
      GROUP BY nc.nc_wins, nc.nc_losses
    `, [confName, league, season]);

    if (result.rows.length === 0) {
      return res.json({});
    }

    const row = result.rows[0];
    res.json({
      conference: confName,
      team_count: parseInt(row.team_count),
      avg_rpi: parseFloat(row.avg_rpi),
      avg_adj_net: parseFloat(row.avg_adj_net),
      avg_adj_ortg: parseFloat(row.avg_adj_ortg),
      avg_adj_drtg: parseFloat(row.avg_adj_drtg),
      avg_sos: parseFloat(row.avg_sos),
      avg_efg_pct: parseFloat(row.avg_efg_pct),
      avg_to_rate: parseFloat(row.avg_to_rate),
      avg_oreb_pct: parseFloat(row.avg_oreb_pct),
      avg_ft_rate: parseFloat(row.avg_ft_rate),
      avg_pace: parseFloat(row.avg_pace),
      avg_three_pt_rate: parseFloat(row.avg_three_pt_rate),
      best_rpi_rank: parseInt(row.best_rpi_rank),
      worst_rpi_rank: parseInt(row.worst_rpi_rank),
      non_conf_wins: parseInt(row.nc_wins) || 0,
      non_conf_losses: parseInt(row.nc_losses) || 0,
    });
  } catch (err) {
    console.error('Error fetching conference summary:', err);
    res.status(500).json({ error: 'Failed to fetch conference summary' });
  }
});

// Get head-to-head matrix for a conference
router.get('/api/conferences/:conference/head-to-head', async (req, res) => {
  try {
    const { conference } = req.params;
    const { league = 'mens', season = DEFAULT_SEASON, source } = req.query;
    const confName = decodeURIComponent(conference);
    const useBoxScore = resolveSource({ league, season, source }) === 'boxscore';

    // Get all conference games between teams in this conference
    let result;
    if (useBoxScore) {
      result = await pool.query(`
        SELECT team_id, opponent_id, team_score, opponent_score,
               true as is_completed, game_date, location,
               team_name, team_logo_url, opponent_name, opponent_logo_url
        FROM (
          SELECT e.away_team_id as team_id, e.home_team_id as opponent_id,
            e.away_score as team_score, e.home_score as opponent_score,
            e.game_date,
            CASE WHEN e.is_neutral THEN 'neutral' ELSE 'away' END as location,
            t1.name as team_name, t1.logo_url as team_logo_url,
            t2.name as opponent_name, t2.logo_url as opponent_logo_url
          FROM exp_game_box_scores e
          JOIN teams t1 ON e.away_team_id = t1.team_id AND t1.season = $3
          JOIN teams t2 ON e.home_team_id = t2.team_id AND t2.season = $3
          WHERE t1.conference = $1 AND t2.conference = $1
            AND t1.league = $2 AND t2.league = $2
            AND e.season = $3 AND e.is_conference = true
            AND e.away_score IS NOT NULL AND e.home_score IS NOT NULL
          UNION ALL
          SELECT e.home_team_id as team_id, e.away_team_id as opponent_id,
            e.home_score as team_score, e.away_score as opponent_score,
            e.game_date,
            CASE WHEN e.is_neutral THEN 'neutral' ELSE 'home' END as location,
            t2.name as team_name, t2.logo_url as team_logo_url,
            t1.name as opponent_name, t1.logo_url as opponent_logo_url
          FROM exp_game_box_scores e
          JOIN teams t1 ON e.away_team_id = t1.team_id AND t1.season = $3
          JOIN teams t2 ON e.home_team_id = t2.team_id AND t2.season = $3
          WHERE t1.conference = $1 AND t2.conference = $1
            AND t1.league = $2 AND t2.league = $2
            AND e.season = $3 AND e.is_conference = true
            AND e.away_score IS NOT NULL AND e.home_score IS NOT NULL
        ) flat
        ORDER BY game_date ASC
      `, [confName, league, season]);
    } else {
      result = await pool.query(`
      SELECT
        g.team_id,
        g.opponent_id,
        g.team_score,
        g.opponent_score,
        g.is_completed,
        g.game_date,
        g.location,
        t1.name as team_name,
        t1.logo_url as team_logo_url,
        t2.name as opponent_name,
        t2.logo_url as opponent_logo_url
      FROM games g
      JOIN teams t1 ON g.team_id = t1.team_id AND t1.season = $3
      JOIN teams t2 ON g.opponent_id = t2.team_id AND t2.season = $3
      WHERE t1.conference = $1 AND t2.conference = $1
        AND t1.league = $2 AND t2.league = $2
        AND g.season = $3
        AND g.is_conference = TRUE
        AND g.is_completed = TRUE
      ORDER BY g.game_date ASC
    `, [confName, league, season]);
    }

    // Get team list for the matrix
    const teamsResult = await pool.query(`
      SELECT team_id, name, logo_url
      FROM teams
      WHERE conference = $1 AND league = $2 AND season = $3 AND is_excluded = FALSE
      ORDER BY name
    `, [confName, league, season]);

    // Build head-to-head matrix
    // Key: "teamId-opponentId" -> array of game results
    const matrix = {};
    result.rows.forEach(game => {
      const key = `${game.team_id}-${game.opponent_id}`;
      if (!matrix[key]) matrix[key] = [];
      matrix[key].push({
        team_score: game.team_score,
        opponent_score: game.opponent_score,
        date: game.game_date,
        won: game.team_score > game.opponent_score,
      });
    });

    res.json({
      teams: teamsResult.rows,
      matrix,
    });
  } catch (err) {
    console.error('Error fetching head-to-head:', err);
    res.status(500).json({ error: 'Failed to fetch head-to-head data' });
  }
});

// Get all conference rankings for strength comparison
router.get('/api/conference-rankings', async (req, res) => {
  try {
    const { league = 'mens', season = DEFAULT_SEASON, source } = req.query;
    const useBoxScore = resolveSource({ league, season, source }) === 'boxscore';

    // Build non-conf CTE based on data source
    const nonConfCte = useBoxScore ? `
      non_conf AS (
        SELECT conference,
          SUM(CASE WHEN team_score > opponent_score THEN 1 ELSE 0 END) as nc_wins,
          SUM(CASE WHEN team_score < opponent_score THEN 1 ELSE 0 END) as nc_losses
        FROM (
          SELECT t.conference, e.away_score as team_score, e.home_score as opponent_score
          FROM exp_game_box_scores e
          JOIN teams t ON t.team_id = e.away_team_id AND t.season = e.season
          WHERE t.league = $1 AND t.season = $2 AND t.is_excluded = FALSE
            AND e.season = $2 AND COALESCE(e.is_naia_game, false) = true
            AND e.is_conference = false AND e.is_exhibition = false
            AND e.away_score IS NOT NULL AND e.home_score IS NOT NULL
          UNION ALL
          SELECT t.conference, e.home_score as team_score, e.away_score as opponent_score
          FROM exp_game_box_scores e
          JOIN teams t ON t.team_id = e.home_team_id AND t.season = e.season
          WHERE t.league = $1 AND t.season = $2 AND t.is_excluded = FALSE
            AND e.season = $2 AND COALESCE(e.is_naia_game, false) = true
            AND e.is_conference = false AND e.is_exhibition = false
            AND e.away_score IS NOT NULL AND e.home_score IS NOT NULL
        ) sub
        GROUP BY conference
      )
    ` : `
      non_conf AS (
        SELECT
          t.conference,
          SUM(CASE WHEN g.team_score > g.opponent_score THEN 1 ELSE 0 END) as nc_wins,
          SUM(CASE WHEN g.team_score < g.opponent_score THEN 1 ELSE 0 END) as nc_losses
        FROM games g
        JOIN teams t ON g.team_id = t.team_id
        WHERE t.league = $1 AND t.season = $2 AND t.is_excluded = FALSE
          AND g.season = $2 AND g.is_completed = TRUE AND g.is_naia_game = TRUE AND g.is_conference = FALSE
        GROUP BY t.conference
      )
    `;

    const result = await pool.query(`
      WITH latest_ratings AS (
        SELECT tr.*
        FROM team_ratings tr
        INNER JOIN (
          SELECT team_id, MAX(date_calculated) as max_date
          FROM team_ratings
          WHERE season = $2
          GROUP BY team_id
        ) latest ON tr.team_id = latest.team_id AND tr.date_calculated = latest.max_date
        WHERE tr.season = $2
      ),
      all_teams_ranked AS (
        SELECT
          t.team_id,
          t.conference,
          lr.rpi,
          ROW_NUMBER() OVER (ORDER BY lr.rpi DESC) as rpi_rank
        FROM teams t
        JOIN latest_ratings lr ON t.team_id = lr.team_id
        WHERE t.league = $1 AND t.season = $2 AND t.is_excluded = FALSE AND lr.rpi IS NOT NULL
      ),
      ${nonConfCte}
      SELECT
        t.conference,
        COUNT(t.team_id) as team_count,
        ROUND(AVG(lr.rpi)::numeric, 4) as avg_rpi,
        ROUND(AVG(lr.adjusted_net_rating)::numeric, 2) as avg_adj_net,
        ROUND(AVG(lr.adjusted_offensive_rating)::numeric, 2) as avg_adj_ortg,
        ROUND(AVG(lr.adjusted_defensive_rating)::numeric, 2) as avg_adj_drtg,
        ROUND(AVG(lr.strength_of_schedule)::numeric, 4) as avg_sos,
        ROUND(AVG(lr.efg_pct)::numeric, 4) as avg_efg_pct,
        ROUND(AVG(lr.turnover_pct)::numeric, 4) as avg_to_rate,
        ROUND(AVG(lr.oreb_pct)::numeric, 4) as avg_oreb_pct,
        ROUND(AVG(lr.ft_rate)::numeric, 4) as avg_ft_rate,
        ROUND(AVG(lr.pace)::numeric, 1) as avg_pace,
        ROUND(AVG(lr.three_pt_rate)::numeric, 4) as avg_three_pt_rate,
        MIN(atr.rpi_rank) as best_rpi_rank,
        MAX(atr.rpi_rank) as worst_rpi_rank,
        COALESCE(nc.nc_wins, 0) as nc_wins,
        COALESCE(nc.nc_losses, 0) as nc_losses
      FROM teams t
      JOIN latest_ratings lr ON t.team_id = lr.team_id
      LEFT JOIN all_teams_ranked atr ON t.team_id = atr.team_id
      LEFT JOIN non_conf nc ON t.conference = nc.conference
      WHERE t.league = $1 AND t.season = $2 AND t.is_excluded = FALSE AND t.conference IS NOT NULL
      GROUP BY t.conference, nc.nc_wins, nc.nc_losses
      ORDER BY AVG(lr.adjusted_net_rating) DESC
    `, [league, season]);

    // ── Projected top-half metric ──
    // For each conference: project every team's conference W/L, filter to
    // teams projected .500+, and average their adjusted net rating.

    // 1. Get all teams with their conference and adjusted ratings
    const teamsWithRatings = await pool.query(`
      SELECT t.team_id, t.conference,
             lr.adjusted_net_rating,
             lr.adjusted_offensive_rating,
             lr.adjusted_defensive_rating,
             lr.pace
      FROM teams t
      JOIN (
        SELECT tr.*
        FROM team_ratings tr
        INNER JOIN (
          SELECT team_id, MAX(date_calculated) as max_date
          FROM team_ratings WHERE season = $2 GROUP BY team_id
        ) latest ON tr.team_id = latest.team_id AND tr.date_calculated = latest.max_date
        WHERE tr.season = $2
      ) lr ON t.team_id = lr.team_id
      WHERE t.league = $1 AND t.season = $2 AND t.is_excluded = FALSE AND t.conference IS NOT NULL
    `, [league, season]);

    // Build a ratings lookup
    const ratingsMap = {};
    teamsWithRatings.rows.forEach(r => {
      ratingsMap[r.team_id] = {
        conference: r.conference,
        adjNet: parseFloat(r.adjusted_net_rating) || 0,
        adjO: parseFloat(r.adjusted_offensive_rating) || 100,
        adjD: parseFloat(r.adjusted_defensive_rating) || 100,
        pace: parseFloat(r.pace) || 70,
      };
    });

    // 2. Get all conference games (completed and future)
    let confGames;
    if (useBoxScore) {
      // Completed conference games from box scores
      const completedConf = await pool.query(`
        SELECT team_id, opponent_id, team_score, opponent_score,
               true as is_completed, location
        FROM (
          SELECT e.away_team_id as team_id, e.home_team_id as opponent_id,
            e.away_score as team_score, e.home_score as opponent_score,
            CASE WHEN e.is_neutral THEN 'neutral' ELSE 'away' END as location
          FROM exp_game_box_scores e
          JOIN teams t ON t.team_id = e.away_team_id AND t.season = e.season
          WHERE e.season = $2 AND e.is_conference = true
            AND COALESCE(e.is_naia_game, false) = true AND e.is_exhibition = false
            AND t.league = $1 AND t.is_excluded = false
            AND e.away_score IS NOT NULL AND e.home_score IS NOT NULL
          UNION ALL
          SELECT e.home_team_id as team_id, e.away_team_id as opponent_id,
            e.home_score as team_score, e.away_score as opponent_score,
            CASE WHEN e.is_neutral THEN 'neutral' ELSE 'home' END as location
          FROM exp_game_box_scores e
          JOIN teams t ON t.team_id = e.home_team_id AND t.season = e.season
          WHERE e.season = $2 AND e.is_conference = true
            AND COALESCE(e.is_naia_game, false) = true AND e.is_exhibition = false
            AND t.league = $1 AND t.is_excluded = false
            AND e.away_score IS NOT NULL AND e.home_score IS NOT NULL
        ) sub
      `, [league, season]);

      // Future conference games
      const futureConf = await pool.query(`
        SELECT f.team_id, f.opponent_id, NULL as team_score, NULL as opponent_score,
               false as is_completed, f.location
        FROM future_games f
        JOIN teams t ON f.team_id = t.team_id AND t.season = $2
        WHERE f.season = $2 AND f.is_conference = true
          AND f.is_naia_game = true AND f.is_exhibition = false
          AND t.league = $1 AND t.is_excluded = false
      `, [league, season]);

      confGames = { rows: [...completedConf.rows, ...futureConf.rows] };
    } else {
      confGames = await pool.query(`
      SELECT g.team_id, g.opponent_id, g.team_score, g.opponent_score,
             g.is_completed, g.location
      FROM games g
      JOIN teams t ON g.team_id = t.team_id AND t.season = $2
      WHERE g.season = $2 AND g.is_conference = TRUE AND g.is_naia_game = TRUE
        AND g.is_exhibition = FALSE AND t.league = $1 AND t.is_excluded = FALSE
    `, [league, season]);
    }

    // 3. Project each team's conference record
    // teamConfRecords: { teamId: { wins, losses } }
    const teamConfRecords = {};
    confGames.rows.forEach(g => {
      if (!teamConfRecords[g.team_id]) teamConfRecords[g.team_id] = { wins: 0, losses: 0 };

      if (g.is_completed && g.team_score != null && g.opponent_score != null) {
        // Actual result
        if (g.team_score > g.opponent_score) teamConfRecords[g.team_id].wins++;
        else teamConfRecords[g.team_id].losses++;
      } else if (!g.is_completed && g.opponent_id && ratingsMap[g.team_id] && ratingsMap[g.opponent_id]) {
        // Predict future game
        const team = ratingsMap[g.team_id];
        const opp = ratingsMap[g.opponent_id];
        const homeAdv = g.location === 'home' ? 3.5 : (g.location === 'away' ? -3.5 : 0);
        const expectedMarginPer100 = (team.adjO - team.adjD) - (opp.adjO - opp.adjD);
        const paceFactor = ((team.pace + opp.pace) / 2) / 100;
        const predictedMargin = expectedMarginPer100 * paceFactor + homeAdv;
        if (predictedMargin > 0) teamConfRecords[g.team_id].wins++;
        else teamConfRecords[g.team_id].losses++;
      }
    });

    // 4. For each conference, filter teams to .500+ and average their adj net
    const confTopHalf = {};
    Object.entries(ratingsMap).forEach(([teamId, info]) => {
      const rec = teamConfRecords[teamId];
      if (!rec) return;
      const totalGames = rec.wins + rec.losses;
      if (totalGames === 0) return;
      const winPct = rec.wins / totalGames;
      if (winPct < 0.5) return;

      if (!confTopHalf[info.conference]) confTopHalf[info.conference] = { sum: 0, count: 0 };
      confTopHalf[info.conference].sum += info.adjNet;
      confTopHalf[info.conference].count++;
    });

    // Add rank numbers
    const rankings = result.rows.map((row, idx) => {
      const th = confTopHalf[row.conference];
      return {
        conference: row.conference,
        team_count: parseInt(row.team_count),
        avg_rpi: parseFloat(row.avg_rpi),
        avg_adj_net: parseFloat(row.avg_adj_net),
        avg_adj_ortg: parseFloat(row.avg_adj_ortg),
        avg_adj_drtg: parseFloat(row.avg_adj_drtg),
        avg_sos: parseFloat(row.avg_sos),
        avg_efg_pct: parseFloat(row.avg_efg_pct),
        avg_to_rate: parseFloat(row.avg_to_rate),
        avg_oreb_pct: parseFloat(row.avg_oreb_pct),
        avg_ft_rate: parseFloat(row.avg_ft_rate),
        avg_pace: parseFloat(row.avg_pace),
        avg_three_pt_rate: parseFloat(row.avg_three_pt_rate),
        best_rpi_rank: parseInt(row.best_rpi_rank),
        worst_rpi_rank: parseInt(row.worst_rpi_rank),
        non_conf_wins: parseInt(row.nc_wins) || 0,
        non_conf_losses: parseInt(row.nc_losses) || 0,
        non_conf_win_pct: (parseInt(row.nc_wins) + parseInt(row.nc_losses)) > 0
          ? parseFloat((parseInt(row.nc_wins) / (parseInt(row.nc_wins) + parseInt(row.nc_losses))).toFixed(3))
          : 0,
        adj_net_rank: idx + 1,
        top_half_adj_net: th && th.count > 0 ? parseFloat((th.sum / th.count).toFixed(2)) : null,
        top_half_count: th ? th.count : 0,
      };
    });

    res.json(rankings);
  } catch (err) {
    console.error('Error fetching conference rankings:', err);
    res.status(500).json({ error: 'Failed to fetch conference rankings' });
  }
});

// Get all teams with Adj NET rank grouped by conference (for conference scatter chart)
router.get('/api/conference-rpi-scatter', async (req, res) => {
  try {
    const { league = 'mens', season = DEFAULT_SEASON } = req.query;

    const result = await pool.query(`
      WITH latest_ratings AS (
        SELECT tr.*
        FROM team_ratings tr
        INNER JOIN (
          SELECT team_id, MAX(date_calculated) as max_date
          FROM team_ratings
          WHERE season = $2
          GROUP BY team_id
        ) latest ON tr.team_id = latest.team_id AND tr.date_calculated = latest.max_date
        WHERE tr.season = $2
      ),
      all_teams_ranked AS (
        SELECT
          t.team_id,
          t.name,
          t.conference,
          t.logo_url,
          lr.adjusted_net_rating,
          ROW_NUMBER() OVER (ORDER BY lr.adjusted_net_rating DESC) as adj_net_rank
        FROM teams t
        JOIN latest_ratings lr ON t.team_id = lr.team_id
        WHERE t.league = $1 AND t.season = $2 AND t.is_excluded = FALSE AND lr.adjusted_net_rating IS NOT NULL
      )
      SELECT
        team_id, name, conference, logo_url, adjusted_net_rating, adj_net_rank
      FROM all_teams_ranked
      ORDER BY adjusted_net_rating DESC
    `, [league, season]);

    res.json(result.rows.map(row => ({
      team_id: row.team_id,
      name: row.name,
      conference: row.conference,
      logo_url: row.logo_url,
      adj_net: parseFloat(row.adjusted_net_rating),
      adj_net_rank: parseInt(row.adj_net_rank),
    })));
  } catch (err) {
    console.error('Error fetching conference scatter:', err);
    res.status(500).json({ error: 'Failed to fetch conference scatter data' });
  }
});

module.exports = router;
