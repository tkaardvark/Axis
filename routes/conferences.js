const express = require('express');
const router = express.Router();
const { pool, DEFAULT_SEASON } = require('../db/pool');

// Get conference games for a specific date
router.get('/api/conferences/:conference/games', async (req, res) => {
  try {
    const { conference } = req.params;
    const { league = 'mens', season = DEFAULT_SEASON, date, startDate, endDate, completed } = req.query;

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
    const { league = 'mens', season = DEFAULT_SEASON } = req.query;
    const confName = decodeURIComponent(conference);

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
      non_conf_record AS (
        SELECT
          SUM(CASE WHEN g.team_score > g.opponent_score THEN 1 ELSE 0 END) as nc_wins,
          SUM(CASE WHEN g.team_score < g.opponent_score THEN 1 ELSE 0 END) as nc_losses
        FROM games g
        JOIN conf_teams ct ON g.team_id = ct.team_id
        WHERE g.season = $3 AND g.is_completed = TRUE AND g.is_naia_game = TRUE AND g.is_conference = FALSE
      ),
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
    const { league = 'mens', season = DEFAULT_SEASON } = req.query;
    const confName = decodeURIComponent(conference);

    // Get all conference games between teams in this conference
    const result = await pool.query(`
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
          t.conference,
          lr.rpi,
          ROW_NUMBER() OVER (ORDER BY lr.rpi DESC) as rpi_rank
        FROM teams t
        JOIN latest_ratings lr ON t.team_id = lr.team_id
        WHERE t.league = $1 AND t.season = $2 AND t.is_excluded = FALSE AND lr.rpi IS NOT NULL
      ),
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
    const confGames = await pool.query(`
      SELECT g.team_id, g.opponent_id, g.team_score, g.opponent_score,
             g.is_completed, g.location
      FROM games g
      JOIN teams t ON g.team_id = t.team_id AND t.season = $2
      WHERE g.season = $2 AND g.is_conference = TRUE AND g.is_naia_game = TRUE
        AND g.is_exhibition = FALSE AND t.league = $1 AND t.is_excluded = FALSE
    `, [league, season]);

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
