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

    // Net Rating rankings
    const allNetRatingResult = await pool.query(`
      SELECT team_id, adjusted_net_rating
      FROM team_ratings
      WHERE season = $1
        AND date_calculated = (SELECT MAX(date_calculated) FROM team_ratings WHERE season = $1)
        AND adjusted_net_rating IS NOT NULL
      ORDER BY adjusted_net_rating DESC
    `, [season]);
    const netRatingRankMap = {};
    allNetRatingResult.rows.forEach((r, i) => { netRatingRankMap[r.team_id] = i + 1; });

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
            netRatingRank: netRatingRankMap[t.teamId] || null,
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

    // ── Actual Results: look up tournament games that have been played ──
    const actualQuery = await pool.query(`
      SELECT home_team_id, away_team_id, home_score, away_score, game_date
      FROM exp_game_box_scores
      WHERE season = $1 AND league = $2
        AND COALESCE(is_national_tournament, false) = true
        AND home_score IS NOT NULL AND away_score IS NOT NULL
    `, [season, league]);

    const actualResults = actualQuery.rows.map(r => ({
      homeTeamId: r.home_team_id,
      awayTeamId: r.away_team_id,
      homeScore: parseInt(r.home_score),
      awayScore: parseInt(r.away_score),
      gameDate: r.game_date,
      winnerId: parseInt(r.home_score) > parseInt(r.away_score) ? r.home_team_id : r.away_team_id,
      loserId: parseInt(r.home_score) > parseInt(r.away_score) ? r.away_team_id : r.home_team_id,
    }));

    // Build lookup: sorted team id pair → actual result
    const actualResultMap = {};
    actualResults.forEach(r => {
      const key = [r.homeTeamId, r.awayTeamId].sort().join('-');
      actualResultMap[key] = r;
    });

    // ── Predictions: simulate the entire bracket with multiple methods ──

    // Pick functions for each method
    const pickByRpi = (a, b) => {
      if (!a) return b;
      if (!b) return a;
      const aRank = a.rpiRank || 999;
      const bRank = b.rpiRank || 999;
      if (aRank !== bRank) return aRank < bRank ? a : b;
      return (a.netEfficiency || 0) >= (b.netEfficiency || 0) ? a : b;
    };

    const pickByNetRating = (a, b) => {
      if (!a) return b;
      if (!b) return a;
      const aEff = a.netEfficiency != null ? a.netEfficiency : -999;
      const bEff = b.netEfficiency != null ? b.netEfficiency : -999;
      if (aEff !== bEff) return aEff > bEff ? a : b;
      return (a.rpiRank || 999) <= (b.rpiRank || 999) ? a : b;
    };

    const pickByPowerIndex = (a, b) => {
      if (!a) return b;
      if (!b) return a;
      const aPI = ((a.rpiRank || 999) + (a.netRatingRank || 999)) / 2;
      const bPI = ((b.rpiRank || 999) + (b.netRatingRank || 999)) / 2;
      if (aPI !== bPI) return aPI < bPI ? a : b;
      return (a.rpiRank || 999) <= (b.rpiRank || 999) ? a : b;
    };

    // Project a score pair: center around 72, spread by net efficiency gap
    const projectScores = (pickFn) => (a, b, winner) => {
      const aEff = a.netEfficiency || 0;
      const bEff = b.netEfficiency || 0;
      const spread = (aEff - bEff) * 0.4;
      const base = 72;
      let aScore = Math.round(base + spread / 2);
      let bScore = Math.round(base - spread / 2);
      if (winner.teamId === a.teamId && aScore <= bScore) { aScore = bScore + 1; }
      if (winner.teamId === b.teamId && bScore <= aScore) { bScore = aScore + 1; }
      return { [a.teamId]: aScore, [b.teamId]: bScore };
    };

    // Generic bracket simulator. scoresFn(a, b, winner) receives the already-picked winner.
    const simulateBracket = (pickFn, scoresFn) => {
      const preds = {};
      enrichedQuadrants.forEach(q => {
        const qPred = { firstRound: [], secondRound: [], sweet16: [], quarterFinal: null };
        q.pods.forEach(pod => {
          const g1Top = pod.teams[0], g1Bot = pod.teams[3];
          const g2Top = pod.teams[1], g2Bot = pod.teams[2];
          const g1W = pickFn(g1Top, g1Bot);
          const g2W = pickFn(g2Top, g2Bot);
          qPred.firstRound.push({ winner: g1W, scores: scoresFn?.(g1Top, g1Bot, g1W) });
          qPred.firstRound.push({ winner: g2W, scores: scoresFn?.(g2Top, g2Bot, g2W) });
        });
        for (let i = 0; i < qPred.firstRound.length; i += 2) {
          const a = qPred.firstRound[i].winner;
          const b = qPred.firstRound[i + 1].winner;
          const w = pickFn(a, b);
          qPred.secondRound.push({ winner: w, top: a, bottom: b, scores: scoresFn?.(a, b, w) });
        }
        for (let i = 0; i < qPred.secondRound.length; i += 2) {
          const a = qPred.secondRound[i].winner;
          const b = qPred.secondRound[i + 1].winner;
          const w = pickFn(a, b);
          qPred.sweet16.push({ winner: w, top: a, bottom: b, scores: scoresFn?.(a, b, w) });
        }
        const qfA = qPred.sweet16[0].winner;
        const qfB = qPred.sweet16[1].winner;
        const qfW = pickFn(qfA, qfB);
        qPred.quarterFinal = { winner: qfW, top: qfA, bottom: qfB, scores: scoresFn?.(qfA, qfB, qfW) };
        preds[q.name] = qPred;
      });

      const qNames = enrichedQuadrants.map(q => q.name);
      const s1A = preds[qNames[0]]?.quarterFinal?.winner;
      const s1B = preds[qNames[1]]?.quarterFinal?.winner;
      const s2A = preds[qNames[2]]?.quarterFinal?.winner;
      const s2B = preds[qNames[3]]?.quarterFinal?.winner;
      const s1W = pickFn(s1A, s1B);
      const s2W = pickFn(s2A, s2B);
      preds.semiFinals = [
        { winner: s1W, top: s1A, bottom: s1B, scores: s1A && s1B ? scoresFn?.(s1A, s1B, s1W) : undefined },
        { winner: s2W, top: s2A, bottom: s2B, scores: s2A && s2B ? scoresFn?.(s2A, s2B, s2W) : undefined },
      ];
      const champW = pickFn(s1W, s2W);
      preds.championship = {
        winner: champW,
        top: s1W, bottom: s2W,
        scores: s1W && s2W ? scoresFn?.(s1W, s2W, champW) : undefined,
      };
      return preds;
    };

    const predictions = {
      score: simulateBracket(pickByRpi, projectScores(pickByRpi)),
      rpi: simulateBracket(pickByRpi, null),
      netRating: simulateBracket(pickByNetRating, null),
      powerIndex: simulateBracket(pickByPowerIndex, null),
    };

    // "Mayhem" method: uses actual results for completed games,
    // then seeded probability-based upsets for remaining games.
    // Fixed seed = tournament start date (March 13, 2026) so picks are stable all tournament.
    const mayhemSeed = 2026 * 10000 + 3 * 100 + 16; // 20260316
    let rngState = mayhemSeed;
    const seededRandom = () => {
      // Simple mulberry32 PRNG
      rngState |= 0; rngState = rngState + 0x6D2B79F5 | 0;
      let t = Math.imul(rngState ^ rngState >>> 15, 1 | rngState);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };

    // Look up actual result between two teams (if game has been played)
    const findActual = (a, b) => {
      if (!a || !b) return null;
      const key = [a.teamId, b.teamId].sort().join('-');
      return actualResultMap[key] || null;
    };

    // Mayhem pick: use actual result if available, otherwise randomize
    const pickMayhem = (a, b) => {
      if (!a) return b;
      if (!b) return a;
      const actual = findActual(a, b);
      if (actual) {
        // Consume a random number to keep RNG sequence consistent
        seededRandom();
        return actual.winnerId === a.teamId ? a : b;
      }
      const aEff = a.netEfficiency || 0;
      const bEff = b.netEfficiency || 0;
      const gap = Math.abs(aEff - bEff);
      const favoriteProb = 0.75 + Math.min(gap * 0.02, 0.20);
      const favorite = aEff >= bEff ? a : b;
      const underdog = aEff >= bEff ? b : a;
      return seededRandom() < favoriteProb ? favorite : underdog;
    };

    // Mayhem scores: use actual scores if available, otherwise generate
    const mayhemScores = (a, b, winner) => {
      const actual = findActual(a, b);
      if (actual) {
        // Consume a random number to keep RNG sequence consistent
        seededRandom();
        return { [actual.homeTeamId]: actual.homeScore, [actual.awayTeamId]: actual.awayScore };
      }
      const aEff = a.netEfficiency || 0;
      const bEff = b.netEfficiency || 0;
      const spread = (aEff - bEff) * 0.4;
      const base = 72;
      const noise = (seededRandom() - 0.5) * 8;
      let aScore = Math.round(base + spread / 2 + noise);
      let bScore = Math.round(base - spread / 2 - noise);
      if (winner.teamId === a.teamId && aScore <= bScore) { aScore = bScore + 1; }
      if (winner.teamId === b.teamId && bScore <= aScore) { bScore = aScore + 1; }
      return { [a.teamId]: aScore, [b.teamId]: bScore };
    };

    rngState = mayhemSeed;
    predictions.mayhem = simulateBracket(pickMayhem, mayhemScores);

    res.json({
      quadrants: enrichedQuadrants,
      podRankings,
      finalSite: bracket.finalSite,
      predictions,
      actualResults,
    });
  } catch (err) {
    console.error('Error in /api/tournament:', err);
    res.status(500).json({ error: 'Failed to fetch tournament data' });
  }
});

module.exports = router;
