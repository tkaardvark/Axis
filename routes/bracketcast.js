const express = require('express');
const router = express.Router();
const { pool, DEFAULT_SEASON } = require('../db/pool');
const { getConferenceChampions } = require('../utils/conferenceChampions');
const { getQuadrant } = require('../utils/quadrant');

// Conference to Area mapping based on NAIA Selection Committee Policy
const CONFERENCE_AREAS = {
  // East
  'Appalachian Athletic Conference': 'East',
  'Mid-South Conference': 'East',
  'Southern States Athletic Conference': 'East',
  'The Sun Conference': 'East',
  // Midwest
  'American Midwest Conference': 'Midwest',
  'Great Plains Athletic Conference': 'Midwest',
  'Heart of America Athletic Conference': 'Midwest',
  'Kansas Collegiate Athletic Conference': 'Midwest',
  // North
  'Chicagoland Collegiate Athletic Conference': 'North',
  'Crossroads League': 'North',
  'River States Conference': 'North',
  'Wolverine-Hoosier Athletic Conference': 'North',
  // South
  'Continental Athletic Conference': 'South',
  'HBCU Athletic Conference': 'South',
  'Red River Athletic Conference': 'South',
  'Sooner Athletic Conference': 'South',
  // West
  'California Pacific Conference': 'West',
  'Cascade Collegiate Conference': 'West',
  'Frontier Conference': 'West',
  'Great Southwest Athletic Conference': 'West',
};

// Get bracketcast data with quadrant records and seed projections
router.get('/api/bracketcast', async (req, res) => {
  try {
    const { league = 'mens', season = DEFAULT_SEASON, asOfDate: userAsOfDate } = req.query;

    // If user provides an asOfDate, use it; otherwise get the latest game date
    let asOfDate;
    if (userAsOfDate) {
      // User-provided date - use end of that day (games on that date are included)
      asOfDate = userAsOfDate;
    } else {
      // Get the latest completed game date
      const asOfResult = await pool.query(`
        SELECT MAX(game_date) as as_of_date
        FROM games g
        JOIN teams t ON g.team_id = t.team_id
        WHERE t.league = $1
          AND g.season = $2
          AND g.is_completed = TRUE
      `, [league, season]);
      asOfDate = asOfResult.rows[0].as_of_date;
    }

    // Step 1: Get all teams with their RPI and create RPI rankings
    // Note: RPI from team_ratings is pre-calculated, but records will be filtered by date
    const teamsResult = await pool.query(`
      SELECT
        t.team_id,
        t.name,
        t.conference,
        t.logo_url,
        t.city,
        t.state,
        t.latitude,
        t.longitude,
        tr.rpi,
        tr.strength_of_schedule,
        tr.naia_wins,
        tr.naia_losses,
        tr.naia_win_pct,
        tr.opponent_win_pct,
        tr.opponent_opponent_win_pct,
        tr.adjusted_net_rating as net_efficiency
      FROM teams t
      LEFT JOIN team_ratings tr ON t.team_id = tr.team_id
        AND tr.season = $2
        AND tr.date_calculated = (SELECT MAX(date_calculated) FROM team_ratings WHERE season = $2)
      WHERE t.league = $1
        AND t.season = $2
        AND t.is_excluded = FALSE
      ORDER BY tr.rpi DESC NULLS LAST
    `, [league, season]);

    const teams = teamsResult.rows;

    // Step 1a: Get conference champions
    const conferenceChampions = await getConferenceChampions(pool, league, season);

    // Step 1b: Get total record (all games including non-NAIA, but only completed and non-exhibition)
    // Exclude national tournament games since bracketcast is for projecting seeds
    // Filter by asOfDate if provided
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
        AND ($3::date IS NULL OR g.game_date <= $3::date)
      GROUP BY g.team_id
    `, [league, season, asOfDate]);

    const totalRecords = {};
    totalRecordResult.rows.forEach(row => {
      totalRecords[row.team_id] = {
        total_wins: parseInt(row.total_wins) || 0,
        total_losses: parseInt(row.total_losses) || 0,
      };
    });

    // Step 1c: Get NAIA record from games table (using is_naia_game flag for consistency)
    // Exclude national tournament games since bracketcast is for projecting seeds
    // Filter by asOfDate if provided
    const naiaRecordResult = await pool.query(`
      SELECT
        g.team_id,
        SUM(CASE WHEN g.team_score > g.opponent_score THEN 1 ELSE 0 END) as naia_wins,
        SUM(CASE WHEN g.team_score < g.opponent_score THEN 1 ELSE 0 END) as naia_losses
      FROM games g
      JOIN teams t ON g.team_id = t.team_id
      WHERE t.league = $1
        AND g.season = $2
        AND g.is_completed = TRUE
        AND g.is_exhibition = FALSE
        AND g.is_naia_game = TRUE
        AND g.is_national_tournament = FALSE
        AND ($3::date IS NULL OR g.game_date <= $3::date)
      GROUP BY g.team_id
    `, [league, season, asOfDate]);

    const naiaRecords = {};
    naiaRecordResult.rows.forEach(row => {
      const wins = parseInt(row.naia_wins) || 0;
      const losses = parseInt(row.naia_losses) || 0;
      const total = wins + losses;
      naiaRecords[row.team_id] = {
        naia_wins: wins,
        naia_losses: losses,
        naia_win_pct: total > 0 ? wins / total : 0,
      };
    });

    // Create RPI rank lookup (1-indexed)
    const rpiRanks = {};
    teams.forEach((team, idx) => {
      rpiRanks[team.team_id] = team.rpi ? idx + 1 : null;
    });

    // Step 2: Get all NAIA games for quadrant calculation
    // Exclude national tournament games since bracketcast is for projecting seeds
    // Filter by asOfDate if provided
    const gamesResult = await pool.query(`
      SELECT
        g.team_id,
        g.opponent_id,
        g.location,
        g.team_score,
        g.opponent_score,
        g.is_conference
      FROM games g
      JOIN teams t ON g.team_id = t.team_id
      WHERE t.league = $1
        AND g.season = $2
        AND g.is_naia_game = TRUE
        AND g.is_completed = TRUE
        AND g.is_national_tournament = FALSE
        AND ($3::date IS NULL OR g.game_date <= $3::date)
    `, [league, season, asOfDate]);

    // Step 3: Calculate quadrant records for each team
    const quadrantRecords = {};
    const conferenceRecords = {};

    // Initialize records for all teams
    teams.forEach(team => {
      quadrantRecords[team.team_id] = {
        q1_wins: 0, q1_losses: 0,
        q2_wins: 0, q2_losses: 0,
        q3_wins: 0, q3_losses: 0,
        q4_wins: 0, q4_losses: 0,
      };
      conferenceRecords[team.team_id] = {
        conf_wins: 0, conf_losses: 0
      };
    });

    // Process each game
    gamesResult.rows.forEach(game => {
      const oppRpiRank = rpiRanks[game.opponent_id];
      const quadrant = getQuadrant(oppRpiRank, game.location);
      const isWin = game.team_score > game.opponent_score;

      if (quadrantRecords[game.team_id]) {
        const qKey = `q${quadrant}_${isWin ? 'wins' : 'losses'}`;
        quadrantRecords[game.team_id][qKey]++;

        // Conference record
        if (game.is_conference) {
          if (isWin) {
            conferenceRecords[game.team_id].conf_wins++;
          } else {
            conferenceRecords[game.team_id].conf_losses++;
          }
        }
      }
    });

    // Step 4: Calculate SOS rankings (higher SOS = better = lower rank number)
    const teamsWithSos = teams
      .filter(t => t.strength_of_schedule != null)
      .sort((a, b) => parseFloat(b.strength_of_schedule) - parseFloat(a.strength_of_schedule));
    const sosRanks = {};
    teamsWithSos.forEach((team, idx) => {
      sosRanks[team.team_id] = idx + 1;
    });

    // Step 5: Build final team data with all fields
    let bracketcastTeams = teams.map((team, idx) => {
      const qr = quadrantRecords[team.team_id] || {};
      const cr = conferenceRecords[team.team_id] || {};
      const tr = totalRecords[team.team_id] || { total_wins: 0, total_losses: 0 };
      const nr = naiaRecords[team.team_id] || { naia_wins: 0, naia_losses: 0, naia_win_pct: 0 };
      const rpiRank = rpiRanks[team.team_id];

      // Calculate total win percentage
      const totalGames = tr.total_wins + tr.total_losses;
      const totalWinPct = totalGames > 0 ? tr.total_wins / totalGames : 0;

      return {
        team_id: team.team_id,
        name: team.name,
        conference: team.conference,
        logo_url: team.logo_url,
        city: team.city,
        state: team.state,
        latitude: team.latitude ? parseFloat(team.latitude) : null,
        longitude: team.longitude ? parseFloat(team.longitude) : null,
        area: CONFERENCE_AREAS[team.conference] || 'Unknown',
        // Total record (all games including non-NAIA)
        total_wins: tr.total_wins,
        total_losses: tr.total_losses,
        total_win_pct: totalWinPct,
        // NAIA record (calculated from games table using is_naia_game flag)
        naia_wins: nr.naia_wins,
        naia_losses: nr.naia_losses,
        naia_win_pct: nr.naia_win_pct,
        // Legacy fields for backwards compatibility
        wins: tr.total_wins,
        losses: tr.total_losses,
        win_pct: totalWinPct,
        rpi: team.rpi ? parseFloat(team.rpi) : null,
        rpi_rank: rpiRank,
        q1_wins: qr.q1_wins || 0,
        q1_losses: qr.q1_losses || 0,
        q2_wins: qr.q2_wins || 0,
        q2_losses: qr.q2_losses || 0,
        q3_wins: qr.q3_wins || 0,
        q3_losses: qr.q3_losses || 0,
        q4_wins: qr.q4_wins || 0,
        q4_losses: qr.q4_losses || 0,
        conf_wins: cr.conf_wins || 0,
        conf_losses: cr.conf_losses || 0,
        net_efficiency: team.net_efficiency ? parseFloat(team.net_efficiency) : null,
        sos: team.strength_of_schedule ? parseFloat(team.strength_of_schedule) : null,
        sos_rank: sosRanks[team.team_id] || null,
        owp: team.opponent_win_pct ? parseFloat(team.opponent_win_pct) : null,
        oowp: team.opponent_opponent_win_pct ? parseFloat(team.opponent_opponent_win_pct) : null,
        projected_seed: rpiRank && rpiRank <= 64 ? rpiRank : null,
        is_conference_champion: conferenceChampions.has(team.team_id),
      };
    });

    // Step 6: Calculate PCR (Primary Criteria Ranking) for each team
    // PCR = average of ranks in: Total Win %, RPI, and QWP
    const calcQWP = (team) =>
      (team.q1_wins || 0) * 4 +
      (team.q2_wins || 0) * 2 +
      (team.q3_wins || 0) * 1 +
      (team.q4_wins || 0) * 0.5;

    // Add QWP to each team
    const teamsWithQWP = bracketcastTeams.map(t => ({ ...t, qwp: calcQWP(t) }));

    // Rank by each criteria (descending - higher is better)
    const rankDesc = (arr, key) => {
      const sorted = [...arr].sort((a, b) => (b[key] || 0) - (a[key] || 0));
      const ranks = {};
      sorted.forEach((t, i) => { ranks[t.team_id] = i + 1; });
      return ranks;
    };

    const winPctRanks = rankDesc(teamsWithQWP, 'total_win_pct');
    const rpiValueRanks = rankDesc(teamsWithQWP, 'rpi');
    const qwpRanks = rankDesc(teamsWithQWP, 'qwp');

    // Compute average rank for each team
    const teamsWithAvg = teamsWithQWP.map(t => ({
      ...t,
      pcr_avg: (winPctRanks[t.team_id] + rpiValueRanks[t.team_id] + qwpRanks[t.team_id]) / 3,
    }));

    // Sort by average rank to assign final PCR position
    const byAvg = [...teamsWithAvg].sort((a, b) => a.pcr_avg - b.pcr_avg);
    const pcrMap = {};
    byAvg.forEach((t, i) => { pcrMap[t.team_id] = i + 1; });

    // Add PCR to bracketcast teams
    bracketcastTeams = teamsWithAvg.map(t => ({ ...t, pcr: pcrMap[t.team_id] }));

    // Step 6b: Calculate PR (Projected Rank)
    // PR = PCR, but conference champions are forced to be ranked at least in the top 64
    // This simulates the automatic qualification for conference tournament winners
    const championsOutsideTop64 = bracketcastTeams
      .filter(t => t.is_conference_champion && t.pcr > 64)
      .sort((a, b) => a.pcr - b.pcr); // Sort by PCR ascending (best first)

    const nonChampionsInTop64 = bracketcastTeams
      .filter(t => !t.is_conference_champion && t.pcr <= 64)
      .sort((a, b) => b.pcr - a.pcr); // Sort by PCR descending (worst first, to be bumped)

    // Build PR map - start with PCR values
    const prMap = {};
    bracketcastTeams.forEach(t => { prMap[t.team_id] = t.pcr; });

    // For each champion outside top 64, bump out a non-champion from top 64
    const bumpsNeeded = Math.min(championsOutsideTop64.length, nonChampionsInTop64.length);
    for (let i = 0; i < bumpsNeeded; i++) {
      const championIn = championsOutsideTop64[i];
      const nonChampionOut = nonChampionsInTop64[i];
      // Swap their PR ranks
      prMap[championIn.team_id] = nonChampionOut.pcr;
      prMap[nonChampionOut.team_id] = championIn.pcr;
    }

    // Add PR to bracketcast teams
    bracketcastTeams = bracketcastTeams.map(t => ({ ...t, pr: prMap[t.team_id] }));

    // Step 7: Build bracket projection (top 64 teams by PR)
    const qualifiedTeams = bracketcastTeams
      .filter(t => t.pr && t.pr <= 64)
      .sort((a, b) => a.pr - b.pr);

    // Step 8: Build pod assignments (16 pods of 4 teams each)
    // Helper function to calculate distance between two points (Haversine formula)
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
      if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
      const R = 3959; // Earth's radius in miles
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return Math.round(R * c);
    };

    // Get teams by seed tier
    const seed1Teams = qualifiedTeams.slice(0, 16);  // #1 seeds (hosts)
    const seed2Teams = qualifiedTeams.slice(16, 32); // #2 seeds
    const seed3Teams = qualifiedTeams.slice(32, 48); // #3 seeds
    const seed4Teams = qualifiedTeams.slice(48, 64); // #4 seeds

    // Function to get potential hosts for a team (closest 4 host sites)
    const getPotentialHosts = (team, hostTeams) => {
      // If team is a host (#1 seed), they host themselves
      const isHost = hostTeams.some(h => h.team_id === team.team_id);
      if (isHost) {
        return { isHost: true, potentialHosts: [] };
      }

      // Calculate distance to each host
      const hostsWithDistance = hostTeams.map(host => ({
        team_id: host.team_id,
        name: host.name,
        city: host.city,
        state: host.state,
        conference: host.conference,
        rpi_rank: host.rpi_rank,
        distance: calculateDistance(
          team.latitude, team.longitude,
          host.latitude, host.longitude
        ),
        hasConferenceConflict: host.conference === team.conference,
      }));

      // Sort by distance and take closest 4
      hostsWithDistance.sort((a, b) => a.distance - b.distance);
      return {
        isHost: false,
        potentialHosts: hostsWithDistance.slice(0, 4),
      };
    };

    // Build bracket with potential hosts for each team
    const buildBracketQuad = (teams, hostTeams) => {
      return teams.map((t, i) => {
        const hostInfo = getPotentialHosts(t, hostTeams);
        return {
          seed: i + 1,
          team_id: t.team_id,
          name: t.name,
          conference: t.conference,
          city: t.city,
          state: t.state,
          record: `${t.wins}-${t.losses}`,
          rpi_rank: t.rpi_rank,
          isHost: hostInfo.isHost,
          potentialHosts: hostInfo.potentialHosts,
        };
      });
    };

    // Legacy quad structure (for backward compatibility) - now with potential hosts
    const bracket = {
      quad1: buildBracketQuad(qualifiedTeams.slice(0, 16), seed1Teams),
      quad2: buildBracketQuad(qualifiedTeams.slice(16, 32), seed1Teams),
      quad3: buildBracketQuad(qualifiedTeams.slice(32, 48), seed1Teams),
      quad4: buildBracketQuad(qualifiedTeams.slice(48, 64), seed1Teams),
    };

    // Initialize 16 pods with #1 seeds as hosts
    const pods = seed1Teams.map((host, index) => ({
      podNumber: index + 1,
      host: {
        seed: 1,
        team_id: host.team_id,
        name: host.name,
        conference: host.conference,
        city: host.city,
        state: host.state,
        latitude: host.latitude,
        longitude: host.longitude,
        record: `${host.wins}-${host.losses}`,
        rpi_rank: host.rpi_rank,
        distance: 0, // Host travels 0 miles
      },
      teams: [], // Will hold #2, #3, #4 seeds
    }));

    // Function to assign a team to the best available pod
    const assignTeamToPod = (team, seedNumber, pods) => {
      // Calculate distance to each pod host
      const podDistances = pods.map((pod, index) => ({
        podIndex: index,
        distance: calculateDistance(
          team.latitude, team.longitude,
          pod.host.latitude, pod.host.longitude
        ),
        hasConferenceConflict: pod.host.conference === team.conference ||
          pod.teams.some(t => t.conference === team.conference),
        currentTeamCount: pod.teams.length,
      }));

      // Sort by:
      // 1. Pods with fewer teams (balance distribution)
      // 2. No conference conflict preferred
      // 3. Shortest distance
      podDistances.sort((a, b) => {
        // First, prefer pods that need more teams
        if (a.currentTeamCount !== b.currentTeamCount) {
          return a.currentTeamCount - b.currentTeamCount;
        }
        // Then, prefer no conference conflict
        if (a.hasConferenceConflict !== b.hasConferenceConflict) {
          return a.hasConferenceConflict ? 1 : -1;
        }
        // Finally, prefer shorter distance
        return a.distance - b.distance;
      });

      // Assign to best pod
      const bestPod = podDistances[0];
      pods[bestPod.podIndex].teams.push({
        seed: seedNumber,
        team_id: team.team_id,
        name: team.name,
        conference: team.conference,
        city: team.city,
        state: team.state,
        record: `${team.wins}-${team.losses}`,
        rpi_rank: team.rpi_rank,
        distance: bestPod.distance,
      });
    };

    // Assign #2 seeds first (they have more flexibility)
    seed2Teams.forEach(team => assignTeamToPod(team, 2, pods));

    // Then assign #3 seeds
    seed3Teams.forEach(team => assignTeamToPod(team, 3, pods));

    // Finally assign #4 seeds
    seed4Teams.forEach(team => assignTeamToPod(team, 4, pods));

    // Sort teams within each pod by seed
    pods.forEach(pod => {
      pod.teams.sort((a, b) => a.seed - b.seed);
    });

    res.json({
      teams: bracketcastTeams,
      bracket,
      pods,
      asOfDate,
    });
  } catch (err) {
    console.error('Error fetching bracketcast:', err);
    res.status(500).json({ error: 'Failed to fetch bracketcast data' });
  }
});

module.exports = router;
