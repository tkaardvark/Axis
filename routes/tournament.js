const express = require('express');
const router = express.Router();
const { pool, DEFAULT_SEASON } = require('../db/pool');
const { TOURNAMENT_BRACKET_2026 } = require('../config/tournament-bracket-2026');
const { resolveSource } = require('../utils/dataSource');
const { getQuadrant } = require('../utils/quadrant');

// Conference to Area mapping (same as bracketcast)
const CONFERENCE_AREAS = {
  'Appalachian Athletic Conference': 'East',
  'Mid-South Conference': 'East',
  'Southern States Athletic Conference': 'East',
  'The Sun Conference': 'East',
  'American Midwest Conference': 'Midwest',
  'Great Plains Athletic Conference': 'Midwest',
  'Heart of America Athletic Conference': 'Midwest',
  'Kansas Collegiate Athletic Conference': 'Midwest',
  'Chicagoland Collegiate Athletic Conference': 'North',
  'Crossroads League': 'North',
  'River States Conference': 'North',
  'Wolverine-Hoosier Athletic Conference': 'North',
  'Continental Athletic Conference': 'South',
  'HBCU Athletic Conference': 'South',
  'Red River Athletic Conference': 'South',
  'Sooner Athletic Conference': 'South',
  'California Pacific Conference': 'West',
  'Cascade Collegiate Conference': 'West',
  'Frontier Conference': 'West',
  'Great Southwest Athletic Conference': 'West',
};

// Haversine distance in miles
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3959; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

router.get('/api/tournament', async (req, res) => {
  try {
    const { league = 'mens', season = DEFAULT_SEASON, source } = req.query;
    const bracket = TOURNAMENT_BRACKET_2026;

    if (league !== bracket.league || season !== bracket.season) {
      return res.json({ error: 'Tournament bracket not available for this league/season', quadrants: [], podRankings: [] });
    }

    const useBoxScore = resolveSource({ league, season, source }) === 'boxscore';

    // Collect all team_ids from the bracket
    const allTeamIds = [];
    bracket.quadrants.forEach(q => q.pods.forEach(p => p.teams.forEach(t => allTeamIds.push(t.teamId))));

    // Get team info
    const teamsResult = await pool.query(`
      SELECT team_id, name, conference, logo_url, city, state, latitude, longitude
      FROM teams
      WHERE team_id = ANY($1) AND season = $2
    `, [allTeamIds, season]);

    const teamInfoMap = {};
    teamsResult.rows.forEach(t => { teamInfoMap[t.team_id] = t; });

    // Get team ratings (pre-calculated)
    const ratingsResult = await pool.query(`
      SELECT team_id, wins, losses, naia_wins, naia_losses,
        rpi, strength_of_schedule, adjusted_net_rating
      FROM team_ratings
      WHERE team_id = ANY($1) AND season = $2
        AND date_calculated = (SELECT MAX(date_calculated) FROM team_ratings WHERE season = $2)
    `, [allTeamIds, season]);

    const ratingsMap = {};
    ratingsResult.rows.forEach(r => { ratingsMap[r.team_id] = r; });

    // Get RPI rankings for all teams to compute relative rank
    const allRpiResult = await pool.query(`
      SELECT team_id, rpi
      FROM team_ratings
      WHERE season = $1
        AND date_calculated = (SELECT MAX(date_calculated) FROM team_ratings WHERE season = $1)
      ORDER BY rpi DESC
    `, [season]);

    const rpiRankMap = {};
    const sosRankMap = {};
    allRpiResult.rows.forEach((r, i) => { rpiRankMap[r.team_id] = i + 1; });

    // SOS rankings
    const allSosResult = await pool.query(`
      SELECT team_id, strength_of_schedule
      FROM team_ratings
      WHERE season = $1
        AND date_calculated = (SELECT MAX(date_calculated) FROM team_ratings WHERE season = $1)
        AND strength_of_schedule IS NOT NULL
      ORDER BY strength_of_schedule DESC
    `, [season]);
    allSosResult.rows.forEach((r, i) => { sosRankMap[r.team_id] = i + 1; });

    // Compute quadrant records from game data for tournament teams
    const gamesResult = await pool.query(`
      WITH flat AS (
        SELECT t.team_id,
          e.home_team_id as opponent_id,
          CASE WHEN e.is_neutral THEN 'neutral' ELSE 'away' END as location,
          e.away_score as team_score, e.home_score as opponent_score, e.forfeit_team_id
        FROM exp_game_box_scores e
        JOIN teams t ON t.team_id = e.away_team_id AND t.season = e.season
        WHERE t.league = $1 AND e.season = $2 AND e.is_exhibition = false
          AND COALESCE(e.is_naia_game, false) = true
          AND COALESCE(e.is_national_tournament, false) = false
          AND e.away_score IS NOT NULL AND e.home_score IS NOT NULL
          AND e.away_team_id = ANY($3)
        UNION ALL
        SELECT t.team_id,
          e.away_team_id as opponent_id,
          CASE WHEN e.is_neutral THEN 'neutral' ELSE 'home' END as location,
          e.home_score as team_score, e.away_score as opponent_score, e.forfeit_team_id
        FROM exp_game_box_scores e
        JOIN teams t ON t.team_id = e.home_team_id AND t.season = e.season
        WHERE t.league = $1 AND e.season = $2 AND e.is_exhibition = false
          AND COALESCE(e.is_naia_game, false) = true
          AND COALESCE(e.is_national_tournament, false) = false
          AND e.away_score IS NOT NULL AND e.home_score IS NOT NULL
          AND e.home_team_id = ANY($3)
      )
      SELECT team_id, opponent_id, location, team_score, opponent_score, forfeit_team_id
      FROM flat
    `, [league, season, allTeamIds]);

    const quadrantRecords = {};
    allTeamIds.forEach(id => {
      quadrantRecords[id] = { q1_wins: 0, q1_losses: 0, q2_wins: 0, q2_losses: 0, q3_wins: 0, q3_losses: 0, q4_wins: 0, q4_losses: 0 };
    });
    gamesResult.rows.forEach(game => {
      const oppRpiRank = rpiRankMap[game.opponent_id];
      const quadrant = getQuadrant(oppRpiRank, game.location);
      const isWin = game.forfeit_team_id
        ? game.forfeit_team_id !== game.team_id
        : game.team_score > game.opponent_score;
      if (quadrantRecords[game.team_id]) {
        quadrantRecords[game.team_id][`q${quadrant}_${isWin ? 'wins' : 'losses'}`]++;
      }
    });

    // Build enriched bracket data
    const enrichedQuadrants = bracket.quadrants.map(quadrant => {
      const enrichedPods = quadrant.pods.map(pod => {
        const hostTeam = pod.teams.find(t => t.isHost);
        const hostInfo = hostTeam ? teamInfoMap[hostTeam.teamId] : null;
        const hostLat = hostInfo ? parseFloat(hostInfo.latitude) : null;
        const hostLon = hostInfo ? parseFloat(hostInfo.longitude) : null;

        const enrichedTeams = pod.teams.map(t => {
          const info = teamInfoMap[t.teamId] || {};
          const ratings = ratingsMap[t.teamId] || {};
          const qr = quadrantRecords[t.teamId] || {};
          const rpi = ratings.rpi ? parseFloat(ratings.rpi) : null;
          const sos = ratings.strength_of_schedule ? parseFloat(ratings.strength_of_schedule) : null;
          const wins = parseInt(ratings.wins) || 0;
          const losses = parseInt(ratings.losses) || 0;
          const naiaWins = parseInt(ratings.naia_wins) || 0;
          const naiaLosses = parseInt(ratings.naia_losses) || 0;
          const teamLat = info.latitude ? parseFloat(info.latitude) : null;
          const teamLon = info.longitude ? parseFloat(info.longitude) : null;
          let distance = null;
          if (hostLat && hostLon && teamLat && teamLon) {
            distance = Math.round(haversineDistance(teamLat, teamLon, hostLat, hostLon));
          }

          return {
            seed: t.seed,
            teamId: t.teamId,
            name: info.name || t.name,
            conference: info.conference || '',
            area: CONFERENCE_AREAS[info.conference] || 'Unknown',
            logoUrl: info.logo_url || null,
            isHost: !!t.isHost,
            city: info.city || null,
            state: info.state || null,
            record: `${wins}-${losses}`,
            wins, losses,
            naiaRecord: `${naiaWins}-${naiaLosses}`,
            naiaWins, naiaLosses,
            rpi,
            rpiRank: rpiRankMap[t.teamId] || null,
            sos,
            sosRank: sosRankMap[t.teamId] || null,
            netEfficiency: ratings.adjusted_net_rating ? parseFloat(ratings.adjusted_net_rating) : null,
            q1: `${qr.q1_wins || 0}-${qr.q1_losses || 0}`,
            q2: `${qr.q2_wins || 0}-${qr.q2_losses || 0}`,
            q3: `${qr.q3_wins || 0}-${qr.q3_losses || 0}`,
            q4: `${qr.q4_wins || 0}-${qr.q4_losses || 0}`,
            q1Wins: qr.q1_wins || 0,
            q1Losses: qr.q1_losses || 0,
            distance,
          };
        });

        // Pod strength metrics
        const teamRpis = enrichedTeams.map(t => t.rpi).filter(Boolean);
        const teamSos = enrichedTeams.map(t => t.sos).filter(Boolean);
        const totalWins = enrichedTeams.reduce((s, t) => s + t.wins, 0);
        const totalLosses = enrichedTeams.reduce((s, t) => s + t.losses, 0);
        const avgRpi = teamRpis.length > 0 ? teamRpis.reduce((s, v) => s + v, 0) / teamRpis.length : 0;
        const avgSos = teamSos.length > 0 ? teamSos.reduce((s, v) => s + v, 0) / teamSos.length : 0;
        const seedSum = enrichedTeams.reduce((s, t) => s + t.seed, 0);
        const avgRpiRank = enrichedTeams.reduce((s, t) => s + (t.rpiRank || 999), 0) / enrichedTeams.length;
        const totalQ1Wins = enrichedTeams.reduce((s, t) => s + t.q1Wins, 0);

        return {
          quadrant: quadrant.name,
          hostCity: pod.hostCity,
          hostState: pod.hostState,
          teams: enrichedTeams,
          strength: {
            avgRpi: Math.round(avgRpi * 10000) / 10000,
            avgSos: Math.round(avgSos * 10000) / 10000,
            avgRpiRank: Math.round(avgRpiRank * 10) / 10,
            combinedRecord: `${totalWins}-${totalLosses}`,
            totalWins, totalLosses,
            winPct: totalWins + totalLosses > 0 ? Math.round((totalWins / (totalWins + totalLosses)) * 1000) / 1000 : 0,
            seedSum,
            totalQ1Wins,
          },
        };
      });

      return {
        name: quadrant.name,
        pods: enrichedPods,
      };
    });

    // Flatten pods and rank by strength
    const allPods = enrichedQuadrants.flatMap(q => q.pods);
    const podRankings = [...allPods]
      .sort((a, b) => b.strength.avgRpi - a.strength.avgRpi)
      .map((pod, i) => ({ ...pod, strengthRank: i + 1 }));

    res.json({
      quadrants: enrichedQuadrants,
      podRankings,
      finalSite: bracket.finalSite,
    });
  } catch (err) {
    console.error('Error in /api/tournament:', err);
    res.status(500).json({ error: 'Failed to fetch tournament data' });
  }
});

module.exports = router;
