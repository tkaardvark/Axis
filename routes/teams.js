const express = require('express');
const router = express.Router();
const { pool, DEFAULT_SEASON } = require('../db/pool');
const { calculateDynamicStats } = require('../utils/dynamicStats');
const { getConferenceChampions } = require('../utils/conferenceChampions');
const { getQuadrant } = require('../utils/quadrant');

// Get team stats with filters - always calculate dynamically from games
router.get('/api/teams', async (req, res) => {
  try {
    const {
      league = 'mens',
      conference,
      gameType = 'all',
      seasonType = 'all',
      seasonSegment = 'all',
      season = DEFAULT_SEASON,
    } = req.query;

    const result = await calculateDynamicStats(pool, { league, conference, gameType, seasonType, seasonSegment, season });
    let teams = result.rows;

    // Get total record (all games including non-NAIA, but only completed and non-exhibition)
    // Exclude national tournament games since this matches bracketcast behavior
    const totalRecordResult = await pool.query(`
      SELECT
        g.team_id,
        SUM(CASE WHEN g.team_score > g.opponent_score THEN 1 ELSE 0 END) as total_wins,
        SUM(CASE WHEN g.team_score < g.opponent_score THEN 1 ELSE 0 END) as total_losses
      FROM games g
      JOIN teams t ON g.team_id = t.team_id
      WHERE t.league = $1
        AND g.season = $2
        AND g.is_completed = TRUE
        AND g.is_exhibition = FALSE
        AND g.is_national_tournament = FALSE
      GROUP BY g.team_id
    `, [league, season]);

    const totalRecords = {};
    totalRecordResult.rows.forEach(row => {
      totalRecords[row.team_id] = {
        total_wins: parseInt(row.total_wins) || 0,
        total_losses: parseInt(row.total_losses) || 0,
      };
    });

    // Add total record to teams
    teams = teams.map(team => {
      const tr = totalRecords[team.team_id] || { total_wins: 0, total_losses: 0 };
      return {
        ...team,
        total_wins: tr.total_wins,
        total_losses: tr.total_losses,
      };
    });

    // Add QWI and Power Index when viewing full-season unfiltered data
    const usePreCalculated = gameType === 'all' && seasonSegment === 'all' && seasonType === 'all';
    if (usePreCalculated) {
      try {
        // Get RPI rankings for quadrant assignment
        const rpiResult = await pool.query(`
          SELECT t.team_id, tr.rpi
          FROM teams t
          LEFT JOIN team_ratings tr ON t.team_id = tr.team_id
            AND tr.season = t.season
            AND tr.date_calculated = (SELECT MAX(date_calculated) FROM team_ratings WHERE season = $2)
          WHERE t.league = $1
            AND t.season = $2
            AND t.is_excluded = FALSE
          ORDER BY tr.rpi DESC NULLS LAST
        `, [league, season]);

        const rpiRanks = {};
        rpiResult.rows.forEach((row, idx) => {
          rpiRanks[row.team_id] = row.rpi ? idx + 1 : null;
        });

        // Get all completed NAIA games for quadrant calculation
        const gamesResult = await pool.query(`
          SELECT g.team_id, g.opponent_id, g.location, g.team_score, g.opponent_score
          FROM games g
          JOIN teams t ON g.team_id = t.team_id
          WHERE t.league = $1
            AND g.season = $2
            AND g.is_naia_game = TRUE
            AND g.is_completed = TRUE
        `, [league, season]);

        // Tally quadrant records per team
        const quadrantRecords = {};
        teams.forEach(t => {
          quadrantRecords[t.team_id] = {
            q1_wins: 0, q1_losses: 0,
            q2_wins: 0, q2_losses: 0,
            q3_wins: 0, q3_losses: 0,
            q4_wins: 0, q4_losses: 0,
          };
        });

        gamesResult.rows.forEach(game => {
          if (!quadrantRecords[game.team_id]) return;
          const oppRpiRank = rpiRanks[game.opponent_id];
          const quadrant = getQuadrant(oppRpiRank, game.location);
          const isWin = game.team_score > game.opponent_score;
          const qKey = `q${quadrant}_${isWin ? 'wins' : 'losses'}`;
          quadrantRecords[game.team_id][qKey]++;
        });

        // Compute QWI and Power Index for each team
        teams = teams.map(team => {
          const qr = quadrantRecords[team.team_id];
          const rpiRank = rpiRanks[team.team_id] || null;
          if (!qr) return { ...team, qwi: null, power_index: null, rpi_rank: rpiRank };

          const qwi = (qr.q1_wins * 1.0) - (qr.q1_losses * 0.25)
                    + (qr.q2_wins * 0.6) - (qr.q2_losses * 0.5)
                    + (qr.q3_wins * 0.3) - (qr.q3_losses * 0.75)
                    + (qr.q4_wins * 0.1) - (qr.q4_losses * 1.0);

          const adjO = parseFloat(team.adjusted_offensive_rating);
          const adjD = parseFloat(team.adjusted_defensive_rating);
          const sos = parseFloat(team.strength_of_schedule);
          const winPct = parseFloat(team.naia_win_pct);

          let power_index = null;
          if (!isNaN(adjO) && !isNaN(adjD) && !isNaN(sos) && !isNaN(winPct)) {
            power_index = (0.35 * adjO)
                        + (0.35 * (200 - adjD))
                        + (0.15 * sos * 100)
                        + (0.075 * winPct * 100)
                        + (0.075 * qwi);
            power_index = Math.round(power_index * 100) / 100;
          }

          return {
            ...team,
            qwi: Math.round(qwi * 100) / 100,
            power_index,
            rpi_rank: rpiRank,
          };
        });
      } catch (qErr) {
        console.error('Error computing QWI/Power Index:', qErr);
        // Fall through with teams as-is (no QWI/PI)
      }
    }

    // Add conference champion flag
    try {
      const conferenceChampions = await getConferenceChampions(pool, league, season);
      teams = teams.map(team => ({
        ...team,
        is_conference_champion: conferenceChampions.has(team.team_id),
      }));
    } catch (champErr) {
      console.error('Error getting conference champions:', champErr);
      // Continue without champion flags
    }

    // Add conference records
    try {
      const confGamesResult = await pool.query(`
        SELECT g.team_id,
               SUM(CASE WHEN g.team_score > g.opponent_score THEN 1 ELSE 0 END) as conf_wins,
               SUM(CASE WHEN g.team_score < g.opponent_score THEN 1 ELSE 0 END) as conf_losses
        FROM games g
        JOIN teams t ON g.team_id = t.team_id
        WHERE t.league = $1
          AND g.season = $2
          AND g.is_conference = TRUE
          AND g.is_completed = TRUE
        GROUP BY g.team_id
      `, [league, season]);

      const confRecords = {};
      confGamesResult.rows.forEach(row => {
        confRecords[row.team_id] = {
          conf_wins: parseInt(row.conf_wins) || 0,
          conf_losses: parseInt(row.conf_losses) || 0,
        };
      });

      teams = teams.map(team => ({
        ...team,
        conf_wins: confRecords[team.team_id]?.conf_wins || 0,
        conf_losses: confRecords[team.team_id]?.conf_losses || 0,
      }));
    } catch (confErr) {
      console.error('Error getting conference records:', confErr);
      // Continue without conference records
    }

    // Add projected conference records (actual + predicted future games)
    try {
      // Build ratings lookup from teams array
      const ratingsMap = {};
      teams.forEach(t => {
        ratingsMap[t.team_id] = {
          adjO: parseFloat(t.adjusted_offensive_rating) || 100,
          adjD: parseFloat(t.adjusted_defensive_rating) || 100,
          pace: parseFloat(t.pace) || 70,
        };
      });

      // Get all conference games (completed and future)
      const allConfGames = await pool.query(`
        SELECT g.team_id, g.opponent_id, g.team_score, g.opponent_score,
               g.is_completed, g.location
        FROM games g
        JOIN teams t ON g.team_id = t.team_id AND t.season = $2
        WHERE g.season = $2 AND g.is_conference = TRUE AND g.is_naia_game = TRUE
          AND g.is_exhibition = FALSE AND t.league = $1 AND t.is_excluded = FALSE
      `, [league, season]);

      const projRecords = {};
      allConfGames.rows.forEach(g => {
        if (!projRecords[g.team_id]) projRecords[g.team_id] = { wins: 0, losses: 0 };

        if (g.is_completed && g.team_score != null && g.opponent_score != null) {
          if (g.team_score > g.opponent_score) projRecords[g.team_id].wins++;
          else projRecords[g.team_id].losses++;
        } else if (!g.is_completed && g.opponent_id && ratingsMap[g.team_id] && ratingsMap[g.opponent_id]) {
          const team = ratingsMap[g.team_id];
          const opp = ratingsMap[g.opponent_id];
          const homeAdv = g.location === 'home' ? 3.5 : (g.location === 'away' ? -3.5 : 0);
          const expectedMarginPer100 = (team.adjO - team.adjD) - (opp.adjO - opp.adjD);
          const paceFactor = ((team.pace + opp.pace) / 2) / 100;
          const predictedMargin = expectedMarginPer100 * paceFactor + homeAdv;
          if (predictedMargin > 0) projRecords[g.team_id].wins++;
          else projRecords[g.team_id].losses++;
        }
      });

      teams = teams.map(team => ({
        ...team,
        proj_conf_wins: projRecords[team.team_id]?.wins || 0,
        proj_conf_losses: projRecords[team.team_id]?.losses || 0,
      }));
    } catch (projErr) {
      console.error('Error computing projected conference records:', projErr);
      // Continue without projected records
    }

    res.json(teams);
  } catch (err) {
    console.error('Error fetching teams:', err);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

// Get single team details
router.get('/api/teams/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { season = DEFAULT_SEASON } = req.query;

    const teamResult = await pool.query(
      'SELECT * FROM teams WHERE team_id = $1 AND season = $2',
      [teamId, season]
    );

    if (teamResult.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const ratingsResult = await pool.query(
      `SELECT * FROM team_ratings
       WHERE team_id = $1 AND season = $2
       ORDER BY date_calculated DESC
       LIMIT 1`,
      [teamId, season]
    );

    const gamesResult = await pool.query(
      `SELECT g.*,
              opp.name as opponent_name,
              opp.logo_url as opponent_logo
       FROM games g
       LEFT JOIN teams opp ON g.opponent_id = opp.team_id AND opp.season = $2
       WHERE g.team_id = $1 AND g.season = $2
       ORDER BY g.game_date DESC`,
      [teamId, season]
    );

    res.json({
      team: teamResult.rows[0],
      ratings: ratingsResult.rows[0] || null,
      games: gamesResult.rows
    });
  } catch (err) {
    console.error('Error fetching team:', err);
    res.status(500).json({ error: 'Failed to fetch team' });
  }
});

// Get team splits (stats broken down by different filters)
router.get('/api/teams/:teamId/splits', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { season = DEFAULT_SEASON } = req.query;

    // Helper to calculate stats for a set of games
    const calculateSplitStats = (games) => {
      if (!games || games.length === 0) return null;

      const gamesPlayed = games.length;
      const wins = games.filter(g => g.team_score > g.opponent_score).length;
      const losses = games.filter(g => g.team_score < g.opponent_score).length;

      // Sum up all stats
      const totals = games.reduce((acc, g) => {
        acc.teamScore += g.team_score || 0;
        acc.oppScore += g.opponent_score || 0;
        acc.fgm += g.fgm || 0;
        acc.fga += g.fga || 0;
        acc.fgm3 += g.fgm3 || 0;
        acc.fga3 += g.fga3 || 0;
        acc.ftm += g.ftm || 0;
        acc.fta += g.fta || 0;
        acc.oreb += g.oreb || 0;
        acc.dreb += g.dreb || 0;
        acc.treb += g.treb || 0;
        acc.ast += g.ast || 0;
        acc.stl += g.stl || 0;
        acc.blk += g.blk || 0;
        acc.to += g.turnovers || 0;
        acc.pf += g.pf || 0;
        acc.oppFgm += g.opp_fgm || 0;
        acc.oppFga += g.opp_fga || 0;
        acc.oppFgm3 += g.opp_fgm3 || 0;
        acc.oppFga3 += g.opp_fga3 || 0;
        acc.oppOreb += g.opp_oreb || 0;
        acc.oppDreb += g.opp_dreb || 0;
        acc.oppTreb += g.opp_treb || 0;
        acc.oppTo += g.opp_turnovers || 0;
        acc.ptsPaint += g.pts_paint || 0;
        acc.ptsFastbreak += g.pts_fastbreak || 0;
        acc.ptsOffTo += g.pts_turnovers || 0;
        acc.ptsBench += g.pts_bench || 0;
        acc.oppPtsPaint += g.opp_pts_paint || 0;
        acc.oppPtsFastbreak += g.opp_pts_fastbreak || 0;
        acc.oppPtsOffTo += g.opp_pts_turnovers || 0;
        return acc;
      }, {
        teamScore: 0, oppScore: 0, fgm: 0, fga: 0, fgm3: 0, fga3: 0, ftm: 0, fta: 0,
        oreb: 0, dreb: 0, treb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0,
        oppFgm: 0, oppFga: 0, oppFgm3: 0, oppFga3: 0, oppOreb: 0, oppDreb: 0, oppTreb: 0, oppTo: 0,
        ptsPaint: 0, ptsFastbreak: 0, ptsOffTo: 0, ptsBench: 0,
        oppPtsPaint: 0, oppPtsFastbreak: 0, oppPtsOffTo: 0
      });

      // Calculate possessions
      const poss = totals.fga - totals.oreb + totals.to + 0.44 * totals.fta;
      const oppPoss = totals.oppFga - totals.oppOreb + totals.oppTo + 0.44 * (games.reduce((a,g) => a + (g.opp_fta||0), 0));

      return {
        games_played: gamesPlayed,
        wins,
        losses,
        win_pct: (wins / gamesPlayed).toFixed(3),
        points_per_game: (totals.teamScore / gamesPlayed).toFixed(1),
        points_allowed_per_game: (totals.oppScore / gamesPlayed).toFixed(1),
        offensive_rating: poss > 0 ? ((totals.teamScore / poss) * 100).toFixed(1) : null,
        defensive_rating: oppPoss > 0 ? ((totals.oppScore / oppPoss) * 100).toFixed(1) : null,
        net_rating: poss > 0 && oppPoss > 0 ? (((totals.teamScore / poss) - (totals.oppScore / oppPoss)) * 100).toFixed(1) : null,
        fg_pct: totals.fga > 0 ? (totals.fgm / totals.fga).toFixed(3) : null,
        fg3_pct: totals.fga3 > 0 ? (totals.fgm3 / totals.fga3).toFixed(3) : null,
        ft_pct: totals.fta > 0 ? (totals.ftm / totals.fta).toFixed(3) : null,
        efg_pct: totals.fga > 0 ? ((totals.fgm + 0.5 * totals.fgm3) / totals.fga).toFixed(3) : null,
        fg_pct_opp: totals.oppFga > 0 ? (totals.oppFgm / totals.oppFga).toFixed(3) : null,
        fg3_pct_opp: totals.oppFga3 > 0 ? (totals.oppFgm3 / totals.oppFga3).toFixed(3) : null,
        efg_pct_opp: totals.oppFga > 0 ? ((totals.oppFgm + 0.5 * totals.oppFgm3) / totals.oppFga).toFixed(3) : null,
        three_pt_rate: totals.fga > 0 ? (totals.fga3 / totals.fga).toFixed(3) : null,
        ft_rate: totals.fga > 0 ? (totals.fta / totals.fga).toFixed(3) : null,
        oreb_pct: (totals.oreb + totals.oppDreb) > 0 ? (totals.oreb / (totals.oreb + totals.oppDreb)).toFixed(3) : null,
        dreb_pct: (totals.dreb + totals.oppOreb) > 0 ? (totals.dreb / (totals.dreb + totals.oppOreb)).toFixed(3) : null,
        oreb_pct_opp: (totals.oppOreb + totals.dreb) > 0 ? (totals.oppOreb / (totals.oppOreb + totals.dreb)).toFixed(3) : null,
        turnover_pct: poss > 0 ? (totals.to / poss).toFixed(3) : null,
        turnover_pct_opp: oppPoss > 0 ? (totals.oppTo / oppPoss).toFixed(3) : null,
        pace: gamesPlayed > 0 ? (poss / gamesPlayed).toFixed(1) : null,
        ast_per_game: (totals.ast / gamesPlayed).toFixed(1),
        to_per_game: (totals.to / gamesPlayed).toFixed(1),
        reb_per_game: (totals.treb / gamesPlayed).toFixed(1),
        oreb_per_game: (totals.oreb / gamesPlayed).toFixed(1),
        dreb_per_game: (totals.dreb / gamesPlayed).toFixed(1),
        stl_per_game: (totals.stl / gamesPlayed).toFixed(1),
        blk_per_game: (totals.blk / gamesPlayed).toFixed(1),
        pf_per_game: (totals.pf / gamesPlayed).toFixed(1),
        pts_paint_per_game: (totals.ptsPaint / gamesPlayed).toFixed(1),
        pts_fastbreak_per_game: (totals.ptsFastbreak / gamesPlayed).toFixed(1),
        pts_off_to_per_game: (totals.ptsOffTo / gamesPlayed).toFixed(1),
        pts_bench_per_game: (totals.ptsBench / gamesPlayed).toFixed(1),
        opp_pts_paint_per_game: (totals.oppPtsPaint / gamesPlayed).toFixed(1),
        opp_pts_fastbreak_per_game: (totals.oppPtsFastbreak / gamesPlayed).toFixed(1),
        opp_pts_off_to_per_game: (totals.oppPtsOffTo / gamesPlayed).toFixed(1),
      };
    };

    // Get all completed games for this team (exclude future games)
    const gamesResult = await pool.query(
      `SELECT g.*
       FROM games g
       WHERE g.team_id = $1 AND g.season = $2 AND g.is_naia_game = true AND g.is_completed = true
       ORDER BY g.game_date DESC`,
      [teamId, season]
    );

    const allGames = gamesResult.rows;
    if (allGames.length === 0) {
      return res.json({ splits: [] });
    }

    // Get team info for conference record
    const teamResult = await pool.query('SELECT conference FROM teams WHERE team_id = $1 AND season = $2', [teamId, season]);
    const teamConference = teamResult.rows[0]?.conference;

    // Calculate different splits
    const splits = [];

    // Overall
    const overallStats = calculateSplitStats(allGames);
    if (overallStats) splits.push({ split_name: 'Overall', ...overallStats });

    // Conference games
    const confGames = allGames.filter(g => g.is_conference);
    const confStats = calculateSplitStats(confGames);
    if (confStats) splits.push({ split_name: 'Conference', ...confStats });

    // Last 5 games
    const last5 = allGames.slice(0, 5);
    const last5Stats = calculateSplitStats(last5);
    if (last5Stats) splits.push({ split_name: 'Last 5', ...last5Stats });

    // Last 10 games
    const last10 = allGames.slice(0, 10);
    const last10Stats = calculateSplitStats(last10);
    if (last10Stats) splits.push({ split_name: 'Last 10', ...last10Stats });

    // Home games
    const homeGames = allGames.filter(g => g.location === 'home');
    const homeStats = calculateSplitStats(homeGames);
    if (homeStats) splits.push({ split_name: 'Home', ...homeStats });

    // Away games
    const awayGames = allGames.filter(g => g.location === 'away');
    const awayStats = calculateSplitStats(awayGames);
    if (awayStats) splits.push({ split_name: 'Away', ...awayStats });

    // In Wins
    const winGames = allGames.filter(g => g.team_score > g.opponent_score);
    const winStats = calculateSplitStats(winGames);
    if (winStats) splits.push({ split_name: 'In Wins', ...winStats });

    // In Losses
    const lossGames = allGames.filter(g => g.team_score < g.opponent_score);
    const lossStats = calculateSplitStats(lossGames);
    if (lossStats) splits.push({ split_name: 'In Losses', ...lossStats });

    res.json({ splits });
  } catch (err) {
    console.error('Error fetching team splits:', err);
    res.status(500).json({ error: 'Failed to fetch team splits' });
  }
});

// Get team percentile ranks (national and conference)
router.get('/api/teams/:teamId/percentiles', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { season = DEFAULT_SEASON } = req.query;

    // Get the team's conference
    const teamResult = await pool.query(
      'SELECT conference, league FROM teams WHERE team_id = $1 AND season = $2',
      [teamId, season]
    );

    if (teamResult.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const { conference, league } = teamResult.rows[0];

    // Get all teams' stats for percentile calculation
    const result = await calculateDynamicStats(pool, {
      league,
      gameType: 'all',
      seasonType: 'all',
      seasonSegment: 'all',
      season,
    });

    const allTeams = result.rows;
    const conferenceTeams = allTeams.filter(t => t.conference === conference);
    const targetTeam = allTeams.find(t => t.team_id === teamId);

    if (!targetTeam) {
      return res.status(404).json({ error: 'Team stats not found' });
    }

    // Stats where HIGHER is better
    const higherIsBetter = [
      'offensive_rating', 'adjusted_offensive_rating', 'efg_pct', 'fg_pct', 'fg3_pct', 'ft_pct',
      'three_pt_rate', 'ft_rate', 'oreb_pct', 'dreb_pct', 'ast_per_game', 'stl_per_game',
      'blk_per_game', 'reb_per_game', 'oreb_per_game', 'dreb_per_game', 'points_per_game',
      'net_rating', 'adjusted_net_rating', 'win_pct', 'naia_win_pct',
      'pts_paint_per_game', 'pts_fastbreak_per_game', 'pts_off_to_per_game', 'pts_bench_per_game',
      'turnover_pct_opp', // forcing opponent turnovers is good
      'pace', // higher pace is generally neutral, but keep consistent
    ];

    // Stats where LOWER is better
    const lowerIsBetter = [
      'defensive_rating', 'adjusted_defensive_rating', 'points_allowed_per_game',
      'turnover_pct', 'to_per_game',
      'efg_pct_opp', 'fg_pct_opp', 'fg3_pct_opp', // lower opponent shooting is better
      'oreb_pct_opp', // lower opponent offensive rebounding is better
      'opp_pts_paint_per_game', // lower opponent paint points is better
    ];

    // Calculate percentile for a stat
    const calculatePercentile = (teamValue, allValues, higherBetter) => {
      if (teamValue === null || teamValue === undefined) return null;
      const validValues = allValues.filter(v => v !== null && v !== undefined && !isNaN(v));
      if (validValues.length === 0) return null;

      const val = parseFloat(teamValue);
      let countBelow;
      if (higherBetter) {
        countBelow = validValues.filter(v => parseFloat(v) < val).length;
      } else {
        countBelow = validValues.filter(v => parseFloat(v) > val).length;
      }
      return Math.round((countBelow / validValues.length) * 100);
    };

    // Build percentile data for all relevant stats
    const statKeys = [...higherIsBetter, ...lowerIsBetter];
    const nationalPercentiles = {};
    const conferencePercentiles = {};

    statKeys.forEach(key => {
      const higherBetter = higherIsBetter.includes(key);
      const nationalValues = allTeams.map(t => t[key]);
      const confValues = conferenceTeams.map(t => t[key]);

      nationalPercentiles[key] = calculatePercentile(targetTeam[key], nationalValues, higherBetter);
      conferencePercentiles[key] = calculatePercentile(targetTeam[key], confValues, higherBetter);
    });

    res.json({
      team_id: teamId,
      conference,
      national_count: allTeams.length,
      conference_count: conferenceTeams.length,
      national: nationalPercentiles,
      conference: conferencePercentiles,
    });
  } catch (err) {
    console.error('Error fetching team percentiles:', err);
    res.status(500).json({ error: 'Failed to fetch team percentiles' });
  }
});

// Get team schedule (all games - completed and future)
router.get('/api/teams/:teamId/schedule', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { season = DEFAULT_SEASON } = req.query;

    // First get the league for this team to find correct RPI rankings
    const teamInfo = await pool.query(
      `SELECT league FROM teams WHERE team_id = $1 AND season = $2`, [teamId, season]
    );
    const teamLeague = teamInfo.rows[0]?.league || 'mens';

    // Get RPI rankings for all teams in this league (use latest date_calculated)
    const rpiResult = await pool.query(
      `SELECT t.team_id, tr.rpi
       FROM teams t
       JOIN team_ratings tr ON t.team_id = tr.team_id
         AND tr.season = $2
         AND tr.date_calculated = (SELECT MAX(date_calculated) FROM team_ratings WHERE season = $2)
       WHERE t.league = $1 AND t.season = $2 AND tr.rpi IS NOT NULL
       ORDER BY tr.rpi DESC`,
      [teamLeague, season]
    );
    const rpiRanks = {};
    rpiResult.rows.forEach((r, i) => { rpiRanks[r.team_id] = i + 1; });

    // Get team ratings for predictions (adjusted offensive/defensive ratings)
    const ratingsResult = await pool.query(
      `SELECT t.team_id,
              tr.adjusted_offensive_rating,
              tr.adjusted_defensive_rating,
              tr.pace
       FROM teams t
       JOIN team_ratings tr ON t.team_id = tr.team_id
         AND tr.season = $2
         AND tr.date_calculated = (SELECT MAX(date_calculated) FROM team_ratings WHERE season = $2)
       WHERE t.league = $1 AND t.season = $2`,
      [teamLeague, season]
    );
    const teamRatings = {};
    ratingsResult.rows.forEach(r => {
      teamRatings[r.team_id] = {
        adjO: parseFloat(r.adjusted_offensive_rating) || 100,
        adjD: parseFloat(r.adjusted_defensive_rating) || 100,
        pace: parseFloat(r.pace) || 70
      };
    });

    const gamesResult = await pool.query(
      `SELECT
        g.game_id,
        g.game_date,
        g.location,
        g.opponent_name,
        g.opponent_id,
        g.team_score,
        g.opponent_score,
        g.is_conference,
        g.is_naia_game,
        g.is_exhibition,
        g.is_postseason,
        g.is_national_tournament,
        g.is_completed,
        g.fga, g.oreb, g.turnovers, g.fta,
        g.opp_fga, g.opp_oreb, g.opp_turnovers, g.opp_fta,
        t.name as opponent_team_name,
        t.logo_url as opponent_logo_url
       FROM games g
       LEFT JOIN teams t ON g.opponent_id = t.team_id AND t.season = $2
       WHERE g.team_id = $1 AND g.season = $2
       ORDER BY g.game_date ASC`,
      [teamId, season]
    );

    const games = gamesResult.rows.map(g => {
      // Determine game type for display
      let gameType = 'NAIA';
      if (g.is_exhibition) {
        gameType = 'Exhibition';
      } else if (g.is_national_tournament) {
        gameType = 'National Tournament';
      } else if (g.is_postseason) {
        gameType = 'Conference Tournament';
      } else if (!g.is_naia_game) {
        gameType = 'Non-NAIA';
      } else if (g.is_conference) {
        gameType = 'Conference';
      } else {
        gameType = 'Non-Conference';
      }

      // Calculate per-game net rating for completed games
      let netRating = null;
      if (g.is_completed && g.fga && g.opp_fga) {
        const poss = g.fga - g.oreb + g.turnovers + 0.475 * g.fta;
        const oppPoss = g.opp_fga - g.opp_oreb + g.opp_turnovers + 0.475 * g.opp_fta;
        if (poss > 0 && oppPoss > 0) {
          const ortg = (g.team_score * 100.0) / poss;
          const drtg = (g.opponent_score * 100.0) / oppPoss;
          netRating = Math.round((ortg - drtg) * 10) / 10;
        }
      }

      // Determine opponent quadrant
      const oppRpiRank = g.opponent_id ? rpiRanks[g.opponent_id] || null : null;
      const quadrant = (g.is_naia_game && !g.is_exhibition && oppRpiRank)
        ? getQuadrant(oppRpiRank, g.location)
        : null;

      // Calculate predictions for future games
      let prediction = null;
      if (!g.is_completed && g.opponent_id && teamRatings[teamId] && teamRatings[g.opponent_id]) {
        const team = teamRatings[teamId];
        const opp = teamRatings[g.opponent_id];

        const homeAdv = g.location === 'home' ? 3.5 : (g.location === 'away' ? -3.5 : 0);
        const teamNet = team.adjO - team.adjD;
        const oppNet = opp.adjO - opp.adjD;
        const expectedMarginPer100 = teamNet - oppNet;
        const expectedPace = (team.pace + opp.pace) / 2;
        const paceFactor = expectedPace / 100;
        const predictedMargin = Math.round((expectedMarginPer100 * paceFactor + homeAdv) * 10) / 10;
        const winProb = Math.round(100 / (1 + Math.exp(-predictedMargin / 5)));
        const avgScore = 75;
        const teamPredScore = Math.round(avgScore + predictedMargin / 2);
        const oppPredScore = Math.round(avgScore - predictedMargin / 2);

        prediction = {
          margin: predictedMargin,
          win_probability: winProb,
          team_score: teamPredScore,
          opponent_score: oppPredScore,
          predicted_result: predictedMargin > 0 ? 'W' : 'L'
        };
      }

      return {
        game_id: g.game_id,
        date: g.game_date,
        location: g.location,
        opponent_name: g.opponent_team_name || g.opponent_name,
        opponent_id: g.opponent_id,
        opponent_logo_url: g.opponent_logo_url,
        team_score: g.team_score,
        opponent_score: g.opponent_score,
        is_conference: g.is_conference,
        is_naia_game: g.is_naia_game,
        is_exhibition: g.is_exhibition,
        is_completed: g.is_completed,
        game_type: gameType,
        result: g.is_completed ? (g.team_score > g.opponent_score ? 'W' : 'L') : null,
        quadrant,
        opponent_rpi_rank: oppRpiRank,
        prediction
      };
    });

    // Deduplicate games - keep only one game per date + opponent combination
    const seenGames = new Set();
    const deduplicatedGames = games.filter(game => {
      const dateStr = new Date(game.date).toISOString().split('T')[0];
      const key = `${dateStr}_${game.opponent_name}`;
      if (seenGames.has(key)) {
        return false;
      }
      seenGames.add(key);
      return true;
    });

    res.json({ games: deduplicatedGames });
  } catch (err) {
    console.error('Error fetching team schedule:', err);
    res.status(500).json({ error: 'Failed to fetch team schedule' });
  }
});

// Get team roster
router.get('/api/teams/:teamId/roster', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { season = DEFAULT_SEASON } = req.query;

    const result = await pool.query(`
      SELECT
        p.*,
        t.name as team_name,
        t.conference
      FROM players p
      JOIN teams t ON p.team_id = t.team_id AND p.season = t.season
      WHERE p.team_id = $1 AND p.season = $2
      ORDER BY p.pts_pg DESC
    `, [teamId, season]);

    res.json({ roster: result.rows });
  } catch (err) {
    console.error('Error fetching team roster:', err);
    res.status(500).json({ error: 'Failed to fetch team roster' });
  }
});

module.exports = router;
