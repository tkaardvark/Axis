const express = require('express');
const router = express.Router();
const { pool, DEFAULT_SEASON } = require('../db/pool');
const { calculateDynamicStats } = require('../utils/legacy/dynamicStats');
const { calculateDynamicStatsFromBoxScores } = require('../utils/dynamicStatsBoxScore');
const { resolveSource } = require('../utils/dataSource');

// Get matchup comparison data for two teams
router.get('/api/matchup', async (req, res) => {
  try {
    const { team1, team2, season = DEFAULT_SEASON, league = 'mens', source } = req.query;

    if (!team1 || !team2) {
      return res.status(400).json({ error: 'Both team1 and team2 parameters are required' });
    }

    const useBoxScore = resolveSource({ league, season, source }) === 'boxscore';
    const statsFunc = useBoxScore ? calculateDynamicStatsFromBoxScores : calculateDynamicStats;

    // Get all teams' stats for percentile calculations
    const allTeamsResult = await statsFunc(pool, {
      league,
      gameType: 'all',
      seasonType: 'all',
      seasonSegment: 'all',
      season,
    });

    const allTeams = allTeamsResult.rows;
    const team1Data = allTeams.find(t => t.team_id === team1);
    const team2Data = allTeams.find(t => t.team_id === team2);

    if (!team1Data || !team2Data) {
      return res.status(404).json({ error: 'One or both teams not found' });
    }

    // Get adjusted ratings for predictions
    const ratingsResult = await pool.query(
      `SELECT t.team_id,
              tr.adjusted_offensive_rating,
              tr.adjusted_defensive_rating,
              tr.pace
       FROM teams t
       JOIN team_ratings tr ON t.team_id = tr.team_id
         AND tr.season = $2
         AND tr.date_calculated = (SELECT MAX(date_calculated) FROM team_ratings WHERE season = $2)
       WHERE t.league = $1 AND t.season = $2 AND t.team_id IN ($3, $4)`,
      [league, season, team1, team2]
    );

    const ratings = {};
    ratingsResult.rows.forEach(r => {
      ratings[r.team_id] = {
        adjO: parseFloat(r.adjusted_offensive_rating) || 100,
        adjD: parseFloat(r.adjusted_defensive_rating) || 100,
        pace: parseFloat(r.pace) || 70
      };
    });

    // Calculate neutral court prediction
    let prediction = null;
    if (ratings[team1] && ratings[team2]) {
      const t1 = ratings[team1];
      const t2 = ratings[team2];

      const teamNet = t1.adjO - t1.adjD;
      const oppNet = t2.adjO - t2.adjD;
      const expectedMarginPer100 = teamNet - oppNet;
      const expectedPace = (t1.pace + t2.pace) / 2;
      const paceFactor = expectedPace / 100;
      const predictedMargin = Math.round(expectedMarginPer100 * paceFactor * 10) / 10;
      const winProb = Math.round(100 / (1 + Math.exp(-predictedMargin / 5)));
      const avgScore = 75;
      const team1Score = Math.round(avgScore + predictedMargin / 2);
      const team2Score = Math.round(avgScore - predictedMargin / 2);

      prediction = {
        team1_score: team1Score,
        team2_score: team2Score,
        margin: predictedMargin,
        team1_win_probability: winProb,
        expected_pace: Math.round(expectedPace * 10) / 10,
        expected_total: team1Score + team2Score
      };
    }

    // Calculate percentiles for both teams
    const higherIsBetter = [
      'offensive_rating', 'adjusted_offensive_rating', 'efg_pct', 'fg_pct', 'fg3_pct', 'ft_pct',
      'three_pt_rate', 'ft_rate', 'oreb_pct', 'dreb_pct', 'ast_per_game', 'stl_per_game',
      'blk_per_game', 'reb_per_game', 'oreb_per_game', 'dreb_per_game', 'points_per_game',
      'net_rating', 'adjusted_net_rating', 'win_pct', 'naia_win_pct',
      'pts_paint_per_game', 'pts_fastbreak_per_game', 'pts_off_to_per_game', 'pts_bench_per_game',
      'turnover_pct_opp', 'pace',
    ];
    const lowerIsBetter = [
      'defensive_rating', 'adjusted_defensive_rating', 'points_allowed_per_game',
      'turnover_pct', 'to_per_game',
      'efg_pct_opp', 'fg_pct_opp', 'fg3_pct_opp',
      'oreb_pct_opp',
      'opp_pts_paint_per_game',
    ];

    const calculatePercentile = (teamValue, allValues, higherBetter) => {
      if (teamValue === null || teamValue === undefined) return null;
      const validValues = allValues.filter(v => v !== null && v !== undefined && !isNaN(v));
      if (validValues.length === 0) return null;
      const val = parseFloat(teamValue);
      const countBelow = higherBetter
        ? validValues.filter(v => parseFloat(v) < val).length
        : validValues.filter(v => parseFloat(v) > val).length;
      return Math.round((countBelow / validValues.length) * 100);
    };

    const statKeys = [...higherIsBetter, ...lowerIsBetter];
    const buildPercentiles = (targetTeam) => {
      const pctiles = {};
      statKeys.forEach(key => {
        const higherBetter = higherIsBetter.includes(key);
        const nationalValues = allTeams.map(t => t[key]);
        pctiles[key] = calculatePercentile(targetTeam[key], nationalValues, higherBetter);
      });
      return pctiles;
    };

    // Get head-to-head games
    let h2hResult;
    if (useBoxScore) {
      h2hResult = await pool.query(
        `SELECT game_date, team_id, opponent_id, team_score, opponent_score, location, true as is_completed
         FROM (
           SELECT e.game_date, e.away_team_id as team_id, e.home_team_id as opponent_id,
             e.away_score as team_score, e.home_score as opponent_score,
             CASE WHEN e.is_neutral THEN 'neutral' ELSE 'away' END as location
           FROM exp_game_box_scores e
           WHERE e.season = $1
             AND e.away_score IS NOT NULL AND e.home_score IS NOT NULL
             AND ((e.away_team_id = $2 AND e.home_team_id = $3) OR (e.away_team_id = $3 AND e.home_team_id = $2))
           UNION ALL
           SELECT e.game_date, e.home_team_id as team_id, e.away_team_id as opponent_id,
             e.home_score as team_score, e.away_score as opponent_score,
             CASE WHEN e.is_neutral THEN 'neutral' ELSE 'home' END as location
           FROM exp_game_box_scores e
           WHERE e.season = $1
             AND e.away_score IS NOT NULL AND e.home_score IS NOT NULL
             AND ((e.away_team_id = $2 AND e.home_team_id = $3) OR (e.away_team_id = $3 AND e.home_team_id = $2))
         ) flat
         ORDER BY game_date ASC`,
        [season, team1, team2]
      );
    } else {
      h2hResult = await pool.query(
        `SELECT g.game_date, g.team_id, g.opponent_id, g.team_score, g.opponent_score, g.location, g.is_completed
         FROM games g
         WHERE g.season = $1 AND g.is_completed = true
           AND ((g.team_id = $2 AND g.opponent_id = $3) OR (g.team_id = $3 AND g.opponent_id = $2))
         ORDER BY g.game_date ASC`,
        [season, team1, team2]
      );
    }

    // Deduplicate H2H (keep from team1's perspective)
    const seenH2H = new Set();
    const headToHead = h2hResult.rows
      .filter(g => {
        const dateStr = new Date(g.game_date).toISOString().split('T')[0];
        if (seenH2H.has(dateStr)) return false;
        seenH2H.add(dateStr);
        return true;
      })
      .map(g => {
        const isTeam1Perspective = g.team_id === team1;
        return {
          date: g.game_date,
          team1_score: isTeam1Perspective ? g.team_score : g.opponent_score,
          team2_score: isTeam1Perspective ? g.opponent_score : g.team_score,
          location: isTeam1Perspective ? g.location : (g.location === 'home' ? 'away' : g.location === 'away' ? 'home' : 'neutral'),
        };
      });

    // Get top 3 players for each team
    const playersResult = await pool.query(
      `SELECT p.team_id, (p.first_name || ' ' || p.last_name) as name, p.pts_pg, p.reb_pg, p.ast_pg
       FROM players p
       WHERE p.season = $1 AND p.team_id IN ($2, $3)
       ORDER BY p.pts_pg DESC`,
      [season, team1, team2]
    );

    const team1Players = playersResult.rows.filter(p => p.team_id === team1).slice(0, 3);
    const team2Players = playersResult.rows.filter(p => p.team_id === team2).slice(0, 3);

    const buildTeamResponse = (teamData, teamRatings, percentiles, topPlayers) => ({
      team_id: teamData.team_id,
      name: teamData.name,
      conference: teamData.conference,
      logo_url: teamData.logo_url,
      record: { wins: teamData.wins, losses: teamData.losses },
      stats: teamData,
      percentiles,
      ratings: teamRatings || null,
      top_players: topPlayers.map(p => ({
        name: p.name,
        ppg: parseFloat(p.pts_pg) || 0,
        rpg: parseFloat(p.reb_pg) || 0,
        apg: parseFloat(p.ast_pg) || 0,
      })),
    });

    res.json({
      team1: buildTeamResponse(team1Data, ratings[team1], buildPercentiles(team1Data), team1Players),
      team2: buildTeamResponse(team2Data, ratings[team2], buildPercentiles(team2Data), team2Players),
      prediction,
      head_to_head: headToHead,
    });
  } catch (err) {
    console.error('Error fetching matchup data:', err);
    res.status(500).json({ error: 'Failed to fetch matchup data' });
  }
});

// Get box score for a specific game
router.get('/api/games/:gameId/boxscore', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { season = DEFAULT_SEASON, source, league } = req.query;
    const useBoxScore = resolveSource({ league, season, source }) === 'boxscore';

    if (useBoxScore) {
      // Fetch from exp_game_box_scores
      const result = await pool.query(
        `SELECT
          e.*,
          t1.team_id as away_tid, t1.logo_url as away_logo_url,
          t2.team_id as home_tid, t2.logo_url as home_logo_url
         FROM exp_game_box_scores e
         LEFT JOIN teams t1 ON t1.team_id = e.away_team_id AND t1.season = e.season
         LEFT JOIN teams t2 ON t2.team_id = e.home_team_id AND t2.season = e.season
         WHERE e.id = $1 AND e.season = $2`,
        [gameId, season]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Game not found' });
      }

      const g = result.rows[0];

      // Fetch player stats for this game
      const playerResult = await pool.query(
        `SELECT player_name, uniform_number, is_starter, is_home,
                minutes, fgm, fga, fgm3, fga3, ftm, fta,
                oreb, dreb, reb, ast, stl, blk, turnovers, pf, pts
         FROM exp_player_game_stats
         WHERE game_box_score_id = $1 AND season = $2
         ORDER BY is_home, is_starter DESC, pts DESC`,
        [gameId, season]
      );

      // Fetch scoring progression from play-by-play
      const pbpResult = await pool.query(
        `SELECT period, game_clock, sequence_number, away_score, home_score
         FROM exp_play_by_play
         WHERE game_box_score_id = $1 AND season = $2 AND is_scoring_play = true
         ORDER BY sequence_number`,
        [gameId, season]
      );

      const awayPlayers = playerResult.rows.filter(p => !p.is_home).map(p => ({
        name: p.player_name,
        uniform: p.uniform_number,
        starter: p.is_starter,
        min: p.minutes, fgm: p.fgm, fga: p.fga, fgm3: p.fgm3, fga3: p.fga3,
        ftm: p.ftm, fta: p.fta, oreb: p.oreb, dreb: p.dreb, reb: p.reb,
        ast: p.ast, stl: p.stl, blk: p.blk, to: p.turnovers, pf: p.pf, pts: p.pts,
      }));

      const homePlayers = playerResult.rows.filter(p => p.is_home).map(p => ({
        name: p.player_name,
        uniform: p.uniform_number,
        starter: p.is_starter,
        min: p.minutes, fgm: p.fgm, fga: p.fga, fgm3: p.fgm3, fga3: p.fga3,
        ftm: p.ftm, fta: p.fta, oreb: p.oreb, dreb: p.dreb, reb: p.reb,
        ast: p.ast, stl: p.stl, blk: p.blk, to: p.turnovers, pf: p.pf, pts: p.pts,
      }));

      // Build score progression array
      const scoreProgression = [
        { period: 1, clock: '20:00', sequence: 0, awayScore: 0, homeScore: 0 },
      ];
      for (const play of pbpResult.rows) {
        scoreProgression.push({
          period: play.period,
          clock: play.game_clock,
          sequence: play.sequence_number,
          awayScore: play.away_score,
          homeScore: play.home_score,
        });
      }

      return res.json({
        game_id: g.id,
        date: g.game_date,
        location: g.location_text,
        is_completed: true,
        period_scores: {
          away: g.away_period_scores,
          home: g.home_period_scores,
        },
        ties: g.ties,
        lead_changes: g.lead_changes,
        attendance: g.attendance,
        score_progression: scoreProgression,
        team: {
          team_id: g.away_tid,
          name: g.away_team_name,
          logo_url: g.away_logo_url,
          score: g.away_score,
          players: awayPlayers,
          stats: {
            fgm: g.away_fgm, fga: g.away_fga, fg_pct: g.away_fga > 0 ? (g.away_fgm / g.away_fga) : null,
            fgm3: g.away_fgm3, fga3: g.away_fga3, fg3_pct: g.away_fga3 > 0 ? (g.away_fgm3 / g.away_fga3) : null,
            ftm: g.away_ftm, fta: g.away_fta, ft_pct: g.away_fta > 0 ? (g.away_ftm / g.away_fta) : null,
            oreb: g.away_oreb, dreb: g.away_dreb, treb: g.away_reb,
            ast: g.away_ast, stl: g.away_stl, blk: g.away_blk,
            turnovers: g.away_to, pf: g.away_pf,
            pts_paint: g.away_points_in_paint, pts_fastbreak: g.away_fastbreak_points,
            pts_turnovers: g.away_points_off_turnovers, pts_bench: g.away_bench_points,
          },
        },
        opponent: {
          team_id: g.home_tid,
          name: g.home_team_name,
          logo_url: g.home_logo_url,
          score: g.home_score,
          players: homePlayers,
          stats: {
            fgm: g.home_fgm, fga: g.home_fga, fg_pct: g.home_fga > 0 ? (g.home_fgm / g.home_fga) : null,
            fgm3: g.home_fgm3, fga3: g.home_fga3, fg3_pct: g.home_fga3 > 0 ? (g.home_fgm3 / g.home_fga3) : null,
            ftm: g.home_ftm, fta: g.home_fta, ft_pct: g.home_fta > 0 ? (g.home_ftm / g.home_fta) : null,
            oreb: g.home_oreb, dreb: g.home_dreb, treb: g.home_reb,
            ast: g.home_ast, stl: g.home_stl, blk: g.home_blk,
            turnovers: g.home_to, pf: g.home_pf,
            pts_paint: g.home_points_in_paint, pts_fastbreak: g.home_fastbreak_points,
            pts_turnovers: g.home_points_off_turnovers, pts_bench: g.home_bench_points,
          },
        },
      });
    }

    const result = await pool.query(
      `SELECT
        g.game_id, g.game_date, g.location, g.is_completed,
        g.team_id, g.opponent_id, g.opponent_name,
        g.team_score, g.opponent_score,
        g.fgm, g.fga, g.fgm3, g.fga3, g.ftm, g.fta,
        g.oreb, g.dreb, g.treb, g.ast, g.stl, g.blk, g.turnovers, g.pf,
        g.pts_paint, g.pts_fastbreak, g.pts_turnovers, g.pts_bench,
        g.opp_fgm, g.opp_fga, g.opp_fgm3, g.opp_fga3, g.opp_ftm, g.opp_fta,
        g.opp_oreb, g.opp_dreb, g.opp_treb, g.opp_ast, g.opp_stl, g.opp_blk, g.opp_turnovers, g.opp_pf,
        g.opp_pts_paint, g.opp_pts_fastbreak, g.opp_pts_turnovers,
        t1.name as team_name, t1.logo_url as team_logo_url,
        t2.name as opponent_team_name, t2.logo_url as opponent_logo_url
       FROM games g
       LEFT JOIN teams t1 ON g.team_id = t1.team_id AND t1.season = $2
       LEFT JOIN teams t2 ON g.opponent_id = t2.team_id AND t2.season = $2
       WHERE g.game_id = $1 AND g.season = $2`,
      [gameId, season]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const g = result.rows[0];

    res.json({
      game_id: g.game_id,
      date: g.game_date,
      location: g.location,
      is_completed: g.is_completed,
      team: {
        team_id: g.team_id,
        name: g.team_name || g.team_id,
        logo_url: g.team_logo_url,
        score: g.team_score,
        stats: {
          fgm: g.fgm, fga: g.fga, fg_pct: g.fga > 0 ? (g.fgm / g.fga) : null,
          fgm3: g.fgm3, fga3: g.fga3, fg3_pct: g.fga3 > 0 ? (g.fgm3 / g.fga3) : null,
          ftm: g.ftm, fta: g.fta, ft_pct: g.fta > 0 ? (g.ftm / g.fta) : null,
          oreb: g.oreb, dreb: g.dreb, treb: g.treb || ((g.oreb || 0) + (g.dreb || 0)),
          ast: g.ast, stl: g.stl, blk: g.blk,
          turnovers: g.turnovers, pf: g.pf,
          pts_paint: g.pts_paint, pts_fastbreak: g.pts_fastbreak,
          pts_turnovers: g.pts_turnovers, pts_bench: g.pts_bench,
        },
      },
      opponent: {
        team_id: g.opponent_id,
        name: g.opponent_team_name || g.opponent_name || 'Opponent',
        logo_url: g.opponent_logo_url,
        score: g.opponent_score,
        stats: {
          fgm: g.opp_fgm, fga: g.opp_fga, fg_pct: g.opp_fga > 0 ? (g.opp_fgm / g.opp_fga) : null,
          fgm3: g.opp_fgm3, fga3: g.opp_fga3, fg3_pct: g.opp_fga3 > 0 ? (g.opp_fgm3 / g.opp_fga3) : null,
          ftm: g.opp_ftm, fta: g.opp_fta, ft_pct: g.opp_fta > 0 ? (g.opp_ftm / g.opp_fta) : null,
          oreb: g.opp_oreb, dreb: g.opp_dreb, treb: g.opp_treb || ((g.opp_oreb || 0) + (g.opp_dreb || 0)),
          ast: g.opp_ast, stl: g.opp_stl, blk: g.opp_blk,
          turnovers: g.opp_turnovers, pf: g.opp_pf,
          pts_paint: g.opp_pts_paint, pts_fastbreak: g.opp_pts_fastbreak,
          pts_turnovers: g.opp_pts_turnovers,
        },
      },
    });
  } catch (err) {
    console.error('Error fetching box score:', err);
    res.status(500).json({ error: 'Failed to fetch box score' });
  }
});

module.exports = router;
