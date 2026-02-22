/**
 * NAIA Basketball Advanced Analytics Calculator
 *
 * Calculates all advanced metrics from team JSON data:
 * - Efficiency ratings (ORTG, DRTG, Net Rating)
 * - Adjusted ratings (KenPom-style with SOS adjustment)
 * - RPI and Strength of Schedule
 * - Shooting metrics (eFG%, FT Rate, 3PT Rate)
 * - Turnover and rebounding percentages
 *
 * Usage: node calculate-analytics.js [--season 2024-25]
 */

require('dotenv').config();
const { Client } = require('pg');
const https = require('https');
const fs = require('fs');
const excludedTeamsConfig = require('./config/excluded-teams');
const { refreshTeamStats } = require('./utils/refreshTeamStats');

// Parse --season argument (default: 2025-26)
const args = process.argv.slice(2);
const seasonIdx = args.indexOf('--season');
const SEASON = seasonIdx !== -1 && args[seasonIdx + 1] ? args[seasonIdx + 1] : '2025-26';

// ============================================================================
// CONFIGURATION
// ============================================================================

const TEAM_URLS_FILE = `team-urls-${SEASON}.json`;
const CONCURRENT_REQUESTS = 10;
const DELAY_BETWEEN_BATCHES = 200;

// Use the excludedTeamsConfig helper for league-specific exclusions
// (league will be passed when checking)

// Adjusted rating constants
const ADJUSTMENT_FACTOR = 0.4;
const HOME_COURT_ADVANTAGE = 3.5;
const ITERATIONS = 5;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${e.message}`));
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Parse "made-attempted" format (e.g., "36-67") into { made, attempted }
 */
function parseMadeAttempted(value) {
  if (!value || typeof value !== 'string') return { made: 0, attempted: 0 };
  const parts = value.split('-');
  if (parts.length !== 2) return { made: 0, attempted: 0 };
  return {
    made: parseInt(parts[0]) || 0,
    attempted: parseInt(parts[1]) || 0
  };
}

/**
 * Clean team name for matching
 */
function cleanTeamName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/\([^)]*\)/g, '')  // Remove parenthetical state abbreviations
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

/**
 * Check if team should be excluded (league-specific)
 */
function isExcludedTeam(name, league = null) {
  return excludedTeamsConfig.isExcluded(name, league);
}

// ============================================================================
// GAME FILTERING
// ============================================================================

/**
 * Check if a game should be included in calculations
 */
function isValidGame(eventData) {
  const event = eventData.event;
  const stats = eventData.stats;
  
  if (!event || !stats) return false;
  
  // Exclude exhibition and preseason
  const eventType = event.eventType?.code;
  if (eventType === 'exhibition' || eventType === 'preSeason') return false;
  
  // Exclude games where stats don't count
  if (event.eventType?.statsCount === false) return false;
  
  // Must have a result
  if (!event.resultAsObject?.hasScores) return false;
  
  // Must have actual stats
  if (!stats.pts || !stats.ptsopp) return false;
  
  return true;
}

// ============================================================================
// STATS EXTRACTION
// ============================================================================

/**
 * Extract all relevant stats from a game
 */
function extractGameStats(eventData, teamId) {
  const event = eventData.event;
  const stats = eventData.stats;
  
  // Determine if we won
  const isWin = event.resultAsObject?.winner?.teamId === teamId;
  
  // Determine location
  let location = 'neutral';
  if (event.neutralSite) {
    location = 'neutral';
  } else if (event.home === true) {
    location = 'home';
  } else if (event.home === false) {
    location = 'away';
  }
  
  // Get opponent info
  const opponent = event.opponent || event.teams?.find(t => t.teamId !== teamId);
  
  // Parse all stats
  const fg = parseMadeAttempted(stats.fgp);
  const fg3 = parseMadeAttempted(stats.fgp3);
  const ft = parseMadeAttempted(stats.ftp);
  const fgOpp = parseMadeAttempted(stats.fgpopp);
  const fg3Opp = parseMadeAttempted(stats.fgp3opp);
  const ftOpp = parseMadeAttempted(stats.ftpopp);
  
  return {
    date: new Date(event.date),
    opponentId: opponent?.teamId || null,
    opponentName: opponent?.name || 'Unknown',
    isWin,
    location,
    isConference: event.conference || false,
    
    // Our stats
    pts: parseInt(stats.pts) || 0,
    fgm: fg.made,
    fga: fg.attempted,
    fgm3: fg3.made,
    fga3: fg3.attempted,
    ftm: ft.made,
    fta: ft.attempted,
    oreb: parseInt(stats.oreb) || 0,
    dreb: parseInt(stats.dreb) || 0,
    to: parseInt(stats.to) || 0,
    
    // Opponent stats
    ptsOpp: parseInt(stats.ptsopp) || 0,
    fgmOpp: fgOpp.made,
    fgaOpp: fgOpp.attempted,
    fgm3Opp: fg3Opp.made,
    fga3Opp: fg3Opp.attempted,
    ftmOpp: ftOpp.made,
    ftaOpp: ftOpp.attempted,
    orebOpp: parseInt(stats.orebopp) || 0,
    drebOpp: parseInt(stats.drebopp) || 0,
    toOpp: parseInt(stats.toopp) || 0
  };
}

// ============================================================================
// TEAM STATS AGGREGATION
// ============================================================================

/**
 * Aggregate all game stats for a team
 */
function aggregateTeamStats(games) {
  const totals = {
    gamesPlayed: games.length,
    wins: 0,
    losses: 0,
    
    // Totals
    pts: 0, ptsOpp: 0,
    fgm: 0, fga: 0, fgmOpp: 0, fgaOpp: 0,
    fgm3: 0, fga3: 0, fgm3Opp: 0, fga3Opp: 0,
    ftm: 0, fta: 0, ftmOpp: 0, ftaOpp: 0,
    oreb: 0, dreb: 0, orebOpp: 0, drebOpp: 0,
    to: 0, toOpp: 0,
    
    // Track opponents for RPI
    opponents: [],
    homeGames: 0,
    awayGames: 0,
    neutralGames: 0
  };
  
  for (const game of games) {
    // Win/Loss
    if (game.isWin) totals.wins++;
    else totals.losses++;
    
    // Location counts
    if (game.location === 'home') totals.homeGames++;
    else if (game.location === 'away') totals.awayGames++;
    else totals.neutralGames++;
    
    // Aggregate stats
    totals.pts += game.pts;
    totals.ptsOpp += game.ptsOpp;
    totals.fgm += game.fgm;
    totals.fga += game.fga;
    totals.fgmOpp += game.fgmOpp;
    totals.fgaOpp += game.fgaOpp;
    totals.fgm3 += game.fgm3;
    totals.fga3 += game.fga3;
    totals.fgm3Opp += game.fgm3Opp;
    totals.fga3Opp += game.fga3Opp;
    totals.ftm += game.ftm;
    totals.fta += game.fta;
    totals.ftmOpp += game.ftmOpp;
    totals.ftaOpp += game.ftaOpp;
    totals.oreb += game.oreb;
    totals.dreb += game.dreb;
    totals.orebOpp += game.orebOpp;
    totals.drebOpp += game.drebOpp;
    totals.to += game.to;
    totals.toOpp += game.toOpp;
    
    // Track opponent
    if (game.opponentId) {
      totals.opponents.push({
        id: game.opponentId,
        name: game.opponentName,
        isWin: game.isWin,
        location: game.location
      });
    }
  }
  
  return totals;
}

// ============================================================================
// BASIC METRICS CALCULATIONS
// ============================================================================

/**
 * Calculate possessions (per game average based)
 */
function calculatePossessions(fga, oreb, to, fta) {
  return fga - oreb + to + (0.475 * fta);
}

/**
 * Calculate all basic metrics from aggregated stats
 */
function calculateBasicMetrics(totals) {
  const g = totals.gamesPlayed;
  if (g === 0) return null;
  
  // Per-game averages
  const ppg = totals.pts / g;
  const ppgOpp = totals.ptsOpp / g;
  const fgaPerGame = totals.fga / g;
  const orebPerGame = totals.oreb / g;
  const toPerGame = totals.to / g;
  const ftaPerGame = totals.fta / g;
  const fgaOppPerGame = totals.fgaOpp / g;
  const orebOppPerGame = totals.orebOpp / g;
  const toOppPerGame = totals.toOpp / g;
  const ftaOppPerGame = totals.ftaOpp / g;
  
  // Possessions (using per-game averages)
  const possessions = calculatePossessions(fgaPerGame, orebPerGame, toPerGame, ftaPerGame);
  const possessionsOpp = calculatePossessions(fgaOppPerGame, orebOppPerGame, toOppPerGame, ftaOppPerGame);
  
  // Efficiency ratings
  const ortg = possessions > 0 ? (ppg / possessions) * 100 : 0;
  const drtg = possessionsOpp > 0 ? (ppgOpp / possessionsOpp) * 100 : 0;
  const netRtg = ortg - drtg;
  
  // Shooting percentages (from totals)
  const fgPct = totals.fga > 0 ? (totals.fgm / totals.fga) * 100 : 0;
  const fg3Pct = totals.fga3 > 0 ? (totals.fgm3 / totals.fga3) * 100 : 0;
  const ftPct = totals.fta > 0 ? (totals.ftm / totals.fta) * 100 : 0;
  const fgPctOpp = totals.fgaOpp > 0 ? (totals.fgmOpp / totals.fgaOpp) * 100 : 0;
  const fg3PctOpp = totals.fga3Opp > 0 ? (totals.fgm3Opp / totals.fga3Opp) * 100 : 0;
  
  // Effective FG% (using per-game averages as per spec)
  const fgmPerGame = totals.fgm / g;
  const fgm3PerGame = totals.fgm3 / g;
  const efgPct = fgaPerGame > 0 ? ((fgmPerGame + 0.5 * fgm3PerGame) / fgaPerGame) * 100 : 0;
  const fgmOppPerGame = totals.fgmOpp / g;
  const fgm3OppPerGame = totals.fgm3Opp / g;
  const efgPctOpp = fgaOppPerGame > 0 ? ((fgmOppPerGame + 0.5 * fgm3OppPerGame) / fgaOppPerGame) * 100 : 0;
  
  // Turnover percentage
  const toPct = possessions > 0 ? (toPerGame / possessions) * 100 : 0;
  const toPctOpp = possessionsOpp > 0 ? (toOppPerGame / possessionsOpp) * 100 : 0;
  
  // Rebounding percentages
  const drebPerGame = totals.dreb / g;
  const drebOppPerGame = totals.drebOpp / g;
  const orebPct = (orebPerGame + drebOppPerGame) > 0 
    ? (orebPerGame / (orebPerGame + drebOppPerGame)) * 100 : 0;
  const drebPct = (drebPerGame + orebOppPerGame) > 0 
    ? (drebPerGame / (drebPerGame + orebOppPerGame)) * 100 : 0;
  const orebPctOpp = (orebOppPerGame + drebPerGame) > 0
    ? (orebOppPerGame / (orebOppPerGame + drebPerGame)) * 100 : 0;
  const drebPctOpp = (drebOppPerGame + orebPerGame) > 0
    ? (drebOppPerGame / (drebOppPerGame + orebPerGame)) * 100 : 0;
  
  // Attempt rates
  const ftRate = fgaPerGame > 0 ? (ftaPerGame / fgaPerGame) * 100 : 0;
  const threePtRate = fgaPerGame > 0 ? (totals.fga3 / g / fgaPerGame) * 100 : 0;
  
  return {
    gamesPlayed: g,
    wins: totals.wins,
    losses: totals.losses,
    winPct: g > 0 ? totals.wins / g : 0,
    
    // Points
    ppg,
    ppgOpp,
    
    // Possessions & Efficiency
    possessions,
    possessionsOpp,
    pace: possessions, // Pace = possessions per game (already per-game)
    ortg,
    drtg,
    netRtg,
    
    // Shooting
    fgPct,
    fg3Pct,
    ftPct,
    efgPct,
    fgPctOpp,
    fg3PctOpp,
    efgPctOpp,
    
    // Turnovers
    toPct,
    toPctOpp,
    
    // Rebounding
    orebPct,
    drebPct,
    orebPctOpp,
    drebPctOpp,
    
    // Attempt rates
    ftRate,
    threePtRate,
    
    // Raw data for RPI calculation
    opponents: totals.opponents
  };
}

// ============================================================================
// RPI & STRENGTH OF SCHEDULE
// ============================================================================

/**
 * Calculate RPI and SOS for all teams
 * This requires knowing all teams' records, so it's done after all teams are processed
 */
function calculateRPIandSOS(allTeamMetrics, naiaTeamIds) {
  // Step 1: Calculate each team's NAIA-only win percentage
  const teamRecords = {};
  
  for (const [teamId, data] of Object.entries(allTeamMetrics)) {
    // Filter to NAIA opponents only
    const naiaGames = data.opponents.filter(opp => naiaTeamIds.has(opp.id));
    const naiaWins = naiaGames.filter(g => g.isWin).length;
    const naiaLosses = naiaGames.filter(g => !g.isWin).length;
    const naiaGamesPlayed = naiaWins + naiaLosses;
    
    teamRecords[teamId] = {
      wins: naiaWins,
      losses: naiaLosses,
      gamesPlayed: naiaGamesPlayed,
      winPct: naiaGamesPlayed > 0 ? naiaWins / naiaGamesPlayed : 0,
      opponents: naiaGames  // Already filtered to NAIA
    };
  }
  
  // Step 2: Calculate OWP for each team
  // Using the CORRECT method: aggregate then subtract once
  const owpValues = {};
  
  for (const [teamId, record] of Object.entries(teamRecords)) {
    let totalOppWins = 0;
    let totalOppLosses = 0;
    let winsAgainstUs = 0;
    let lossesAgainstUs = 0;
    
    for (const opp of record.opponents) {
      const oppRecord = teamRecords[opp.id];
      if (!oppRecord) continue;
      
      // Add opponent's full record (weighted by games played against them)
      totalOppWins += oppRecord.wins;
      totalOppLosses += oppRecord.losses;
      
      // Track what happened in games against us
      if (opp.isWin) {
        // We won, so opponent got a loss
        lossesAgainstUs++;
      } else {
        // We lost, so opponent got a win
        winsAgainstUs++;
      }
    }
    
    // Subtract our record against them ONCE at the end
    const adjustedOppWins = totalOppWins - winsAgainstUs;
    const adjustedOppLosses = totalOppLosses - lossesAgainstUs;
    const adjustedTotal = adjustedOppWins + adjustedOppLosses;
    
    owpValues[teamId] = adjustedTotal > 0 ? adjustedOppWins / adjustedTotal : 0;
  }
  
  // Step 3: Calculate OOWP for each team
  const oowpValues = {};
  
  for (const [teamId, record] of Object.entries(teamRecords)) {
    let weightedOOWP = 0;
    let totalGamesVsOpps = 0;
    
    for (const opp of record.opponents) {
      const oppOWP = owpValues[opp.id];
      if (oppOWP !== undefined) {
        weightedOOWP += oppOWP;
        totalGamesVsOpps++;
      }
    }
    
    oowpValues[teamId] = totalGamesVsOpps > 0 ? weightedOOWP / totalGamesVsOpps : 0;
  }
  
  // Step 4: Calculate RPI and SOS
  const rpiResults = {};
  
  for (const [teamId, record] of Object.entries(teamRecords)) {
    const winPct = record.winPct;
    const owp = owpValues[teamId] || 0;
    const oowp = oowpValues[teamId] || 0;
    
    // RPI = 0.30*WinPct + 0.50*OWP + 0.20*OOWP
    const rpi = (0.30 * winPct) + (0.50 * owp) + (0.20 * oowp);
    
    // SOS = 0.67*OWP + 0.33*OOWP
    const sos = (0.67 * owp) + (0.33 * oowp);
    
    rpiResults[teamId] = {
      naiaWins: record.wins,
      naiaLosses: record.losses,
      naiaWinPct: winPct,
      owp,
      oowp,
      rpi,
      sos
    };
  }
  
  return rpiResults;
}

// ============================================================================
// ADJUSTED RATINGS (KENPOM-STYLE)
// ============================================================================

/**
 * Calculate adjusted ratings using iterative algorithm
 */
function calculateAdjustedRatings(allTeamMetrics, allTeamGames) {
  // Initialize with raw ratings
  let adjORTG = {};
  let adjDRTG = {};
  
  for (const [teamId, metrics] of Object.entries(allTeamMetrics)) {
    adjORTG[teamId] = metrics.ortg;
    adjDRTG[teamId] = metrics.drtg;
  }
  
  // Calculate league averages
  const allORTG = Object.values(allTeamMetrics).map(m => m.ortg).filter(v => v > 0);
  const allDRTG = Object.values(allTeamMetrics).map(m => m.drtg).filter(v => v > 0);
  const leagueAvgORTG = allORTG.reduce((a, b) => a + b, 0) / allORTG.length;
  const leagueAvgDRTG = allDRTG.reduce((a, b) => a + b, 0) / allDRTG.length;
  
  // Iterate
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const newAdjORTG = {};
    const newAdjDRTG = {};
    
    for (const [teamId, metrics] of Object.entries(allTeamMetrics)) {
      const games = allTeamGames[teamId] || [];
      
      if (games.length === 0) {
        newAdjORTG[teamId] = metrics.ortg;
        newAdjDRTG[teamId] = metrics.drtg;
        continue;
      }
      
      // Calculate opponent averages with home court adjustment
      let totalOppDRTG = 0;
      let totalOppORTG = 0;
      let oppCount = 0;
      
      for (const game of games) {
        const oppId = game.opponentId;
        if (!adjORTG[oppId] || !adjDRTG[oppId]) continue;
        
        let oppDRTG = adjDRTG[oppId];
        let oppORTG = adjORTG[oppId];
        
        // Apply home court adjustment
        if (game.location === 'home') {
          // We're home, opponent is away - their ratings are worse
          oppDRTG += HOME_COURT_ADVANTAGE / 2;
          oppORTG -= HOME_COURT_ADVANTAGE / 2;
        } else if (game.location === 'away') {
          // We're away, opponent is home - their ratings are better
          oppDRTG -= HOME_COURT_ADVANTAGE / 2;
          oppORTG += HOME_COURT_ADVANTAGE / 2;
        }
        
        totalOppDRTG += oppDRTG;
        totalOppORTG += oppORTG;
        oppCount++;
      }
      
      if (oppCount === 0) {
        newAdjORTG[teamId] = metrics.ortg;
        newAdjDRTG[teamId] = metrics.drtg;
        continue;
      }
      
      const avgOppDRTG = totalOppDRTG / oppCount;
      const avgOppORTG = totalOppORTG / oppCount;
      
      // Calculate adjusted ratings
      // adjORTG = ORTG + 0.4 * (leagueAvgDRTG - oppAvgDRTG)
      newAdjORTG[teamId] = metrics.ortg + ADJUSTMENT_FACTOR * (leagueAvgDRTG - avgOppDRTG);
      
      // adjDRTG = DRTG - 0.4 * (oppAvgORTG - leagueAvgORTG)
      newAdjDRTG[teamId] = metrics.drtg - ADJUSTMENT_FACTOR * (avgOppORTG - leagueAvgORTG);
    }
    
    adjORTG = newAdjORTG;
    adjDRTG = newAdjDRTG;
  }
  
  // Calculate OSOS, DSOS, NSOS and final adjusted ratings
  const results = {};
  
  for (const [teamId, metrics] of Object.entries(allTeamMetrics)) {
    const games = allTeamGames[teamId] || [];
    
    let totalOppORTG = 0;
    let totalOppDRTG = 0;
    let oppCount = 0;
    
    for (const game of games) {
      const oppId = game.opponentId;
      if (adjORTG[oppId] && adjDRTG[oppId]) {
        totalOppORTG += adjORTG[oppId];
        totalOppDRTG += adjDRTG[oppId];
        oppCount++;
      }
    }
    
    const osos = oppCount > 0 ? totalOppORTG / oppCount : leagueAvgORTG;
    const dsos = oppCount > 0 ? totalOppDRTG / oppCount : leagueAvgDRTG;
    const nsos = osos - dsos;
    
    results[teamId] = {
      adjORTG: adjORTG[teamId] || metrics.ortg,
      adjDRTG: adjDRTG[teamId] || metrics.drtg,
      adjNRTG: (adjORTG[teamId] || metrics.ortg) - (adjDRTG[teamId] || metrics.drtg),
      osos,
      dsos,
      nsos
    };
  }
  
  return results;
}

// ============================================================================
// MAIN PROCESSING
// ============================================================================

async function processTeam(url, league, naiaTeamIds = null) {
  try {
    const json = await fetchJson(url);
    
    const teamId = json.attributes?.teamId;
    const teamName = json.attributes?.school_name;
    
    if (!teamId || !teamName) return null;
    if (isExcludedTeam(teamName, league)) return null;
    
    // Filter and extract valid games
    const validEvents = (json.events || []).filter(isValidGame);
    let games = validEvents.map(e => extractGameStats(e, teamId));
    
    // If we have NAIA team IDs, filter to NAIA games only
    if (naiaTeamIds) {
      const totalGames = games.length;
      games = games.filter(g => g.opponentId && naiaTeamIds.has(g.opponentId));
      // Log if we filtered out non-NAIA games
      if (games.length < totalGames) {
        // Silently filter - non-NAIA games excluded
      }
    }
    
    if (games.length === 0) return null;
    
    // Aggregate and calculate basic metrics (now NAIA-only)
    const totals = aggregateTeamStats(games);
    const metrics = calculateBasicMetrics(totals);
    
    return {
      teamId,
      teamName,
      league,
      jsonUrl: url,
      games,
      metrics
    };
  } catch (err) {
    console.error(`Error processing ${url}: ${err.message}`);
    return null;
  }
}

async function processTeamsInBatches(urls, league) {
  const results = [];
  
  for (let i = 0; i < urls.length; i += CONCURRENT_REQUESTS) {
    const batch = urls.slice(i, i + CONCURRENT_REQUESTS);
    const batchNum = Math.floor(i / CONCURRENT_REQUESTS) + 1;
    const totalBatches = Math.ceil(urls.length / CONCURRENT_REQUESTS);
    
    process.stdout.write(`  Batch ${batchNum}/${totalBatches}...`);
    
    const promises = batch.map(url => processTeam(url, league));
    const batchResults = await Promise.all(promises);
    
    const valid = batchResults.filter(r => r !== null);
    results.push(...valid);
    
    console.log(` ${valid.length} teams processed`);
    
    if (i + CONCURRENT_REQUESTS < urls.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
    }
  }
  
  return results;
}

async function processTeamsInBatchesWithNAIAFilter(urls, league, naiaTeamIds) {
  const results = [];
  
  for (let i = 0; i < urls.length; i += CONCURRENT_REQUESTS) {
    const batch = urls.slice(i, i + CONCURRENT_REQUESTS);
    const batchNum = Math.floor(i / CONCURRENT_REQUESTS) + 1;
    const totalBatches = Math.ceil(urls.length / CONCURRENT_REQUESTS);
    
    process.stdout.write(`  Batch ${batchNum}/${totalBatches}...`);
    
    const promises = batch.map(url => processTeam(url, league, naiaTeamIds));
    const batchResults = await Promise.all(promises);
    
    const valid = batchResults.filter(r => r !== null);
    results.push(...valid);
    
    console.log(` ${valid.length} teams processed`);
    
    if (i + CONCURRENT_REQUESTS < urls.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
    }
  }
  
  return results;
}

async function saveToDatabase(client, teamData, rpiData, adjustedData) {
  const teamId = teamData.teamId;
  const metrics = teamData.metrics;
  const rpi = rpiData[teamId] || {};
  const adjusted = adjustedData[teamId] || {};
  
  // Update teams table with basic info (season-aware)
  await client.query(`
    UPDATE teams SET
      updated_at = CURRENT_TIMESTAMP
    WHERE team_id = $1 AND season = $2
  `, [teamId, SEASON]);

  // Insert or update team_ratings with ALL metrics
  const today = new Date().toISOString().split('T')[0];

  await client.query(`
    INSERT INTO team_ratings (
      team_id, date_calculated, season,
      games_played, wins, losses, win_pct,
      points_per_game, points_allowed_per_game,
      offensive_rating, defensive_rating, net_rating,
      adjusted_offensive_rating, adjusted_defensive_rating, adjusted_net_rating,
      fg_pct, fg3_pct, ft_pct, efg_pct,
      fg_pct_opp, fg3_pct_opp, efg_pct_opp,
      turnover_pct, turnover_pct_opp,
      oreb_pct, dreb_pct, oreb_pct_opp, dreb_pct_opp,
      pace,
      ft_rate, three_pt_rate,
      rpi, naia_wins, naia_losses, naia_win_pct,
      strength_of_schedule, opponent_win_pct, opponent_opponent_win_pct,
      osos, dsos, nsos
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
      $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
      $31, $32, $33, $34, $35, $36, $37, $38, $39, $40,
      $41
    )
    ON CONFLICT (team_id, date_calculated, season) DO UPDATE SET
      games_played = EXCLUDED.games_played,
      wins = EXCLUDED.wins,
      losses = EXCLUDED.losses,
      win_pct = EXCLUDED.win_pct,
      points_per_game = EXCLUDED.points_per_game,
      points_allowed_per_game = EXCLUDED.points_allowed_per_game,
      offensive_rating = EXCLUDED.offensive_rating,
      defensive_rating = EXCLUDED.defensive_rating,
      net_rating = EXCLUDED.net_rating,
      adjusted_offensive_rating = EXCLUDED.adjusted_offensive_rating,
      adjusted_defensive_rating = EXCLUDED.adjusted_defensive_rating,
      adjusted_net_rating = EXCLUDED.adjusted_net_rating,
      fg_pct = EXCLUDED.fg_pct,
      fg3_pct = EXCLUDED.fg3_pct,
      ft_pct = EXCLUDED.ft_pct,
      efg_pct = EXCLUDED.efg_pct,
      fg_pct_opp = EXCLUDED.fg_pct_opp,
      fg3_pct_opp = EXCLUDED.fg3_pct_opp,
      efg_pct_opp = EXCLUDED.efg_pct_opp,
      turnover_pct = EXCLUDED.turnover_pct,
      turnover_pct_opp = EXCLUDED.turnover_pct_opp,
      oreb_pct = EXCLUDED.oreb_pct,
      dreb_pct = EXCLUDED.dreb_pct,
      oreb_pct_opp = EXCLUDED.oreb_pct_opp,
      dreb_pct_opp = EXCLUDED.dreb_pct_opp,
      pace = EXCLUDED.pace,
      ft_rate = EXCLUDED.ft_rate,
      three_pt_rate = EXCLUDED.three_pt_rate,
      rpi = EXCLUDED.rpi,
      naia_wins = EXCLUDED.naia_wins,
      naia_losses = EXCLUDED.naia_losses,
      naia_win_pct = EXCLUDED.naia_win_pct,
      strength_of_schedule = EXCLUDED.strength_of_schedule,
      opponent_win_pct = EXCLUDED.opponent_win_pct,
      opponent_opponent_win_pct = EXCLUDED.opponent_opponent_win_pct,
      osos = EXCLUDED.osos,
      dsos = EXCLUDED.dsos,
      nsos = EXCLUDED.nsos
  `, [
    teamId,                                    // $1
    today,                                     // $2
    SEASON,                                    // $3
    metrics.gamesPlayed,                       // $4
    metrics.wins,                              // $5
    metrics.losses,                            // $6
    metrics.winPct,                            // $7
    metrics.ppg,                               // $8
    metrics.ppgOpp,                            // $9
    metrics.ortg,                              // $10
    metrics.drtg,                              // $11
    metrics.netRtg,                            // $12
    adjusted.adjORTG || metrics.ortg,          // $13
    adjusted.adjDRTG || metrics.drtg,          // $14
    adjusted.adjNRTG || metrics.netRtg,        // $15
    metrics.fgPct,                             // $16
    metrics.fg3Pct,                            // $17
    metrics.ftPct,                             // $18
    metrics.efgPct,                            // $19
    metrics.fgPctOpp,                          // $20
    metrics.fg3PctOpp,                         // $21
    metrics.efgPctOpp,                         // $22
    metrics.toPct,                             // $23
    metrics.toPctOpp,                          // $24
    metrics.orebPct,                           // $25
    metrics.drebPct,                           // $26
    metrics.orebPctOpp,                        // $27
    metrics.drebPctOpp,                        // $28
    metrics.pace,                              // $29
    metrics.ftRate,                            // $30
    metrics.threePtRate,                       // $31
    rpi.rpi || 0,                              // $32
    rpi.naiaWins || 0,                         // $33
    rpi.naiaLosses || 0,                       // $34
    rpi.naiaWinPct || 0,                       // $35
    rpi.sos || 0,                              // $36
    rpi.owp || 0,                              // $37
    rpi.oowp || 0,                             // $38
    adjusted.osos || 0,                        // $39
    adjusted.dsos || 0,                        // $40
    adjusted.nsos || 0                         // $41
  ]);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('NAIA Advanced Analytics Calculator');
  console.log(`Season: ${SEASON}`);
  console.log('='.repeat(60));
  
  // Load team URLs
  if (!fs.existsSync(TEAM_URLS_FILE)) {
    console.error(`\n❌ Error: ${TEAM_URLS_FILE} not found.`);
    process.exit(1);
  }
  
  const teamUrls = JSON.parse(fs.readFileSync(TEAM_URLS_FILE, 'utf8'));
  console.log(`\nLoaded ${teamUrls.mens.length} men's and ${teamUrls.womens.length} women's team URLs`);
  
  const startTime = Date.now();
  
  // PASS 1: Collect all NAIA team IDs first
  console.log('\n🔍 PASS 1: COLLECTING NAIA TEAM IDs');
  console.log('-'.repeat(40));
  
  const mensTeamIds = new Set();
  const womensTeamIds = new Set();
  
  console.log('  Fetching men\'s team IDs...');
  for (let i = 0; i < teamUrls.mens.length; i += CONCURRENT_REQUESTS) {
    const batch = teamUrls.mens.slice(i, i + CONCURRENT_REQUESTS);
    const results = await Promise.all(batch.map(async url => {
      try {
        const json = await fetchJson(url);
        const teamId = json.attributes?.teamId;
        const teamName = json.attributes?.school_name;
        if (teamId && teamName && !isExcludedTeam(teamName, 'mens')) {
          return teamId;
        }
      } catch (e) {}
      return null;
    }));
    results.filter(Boolean).forEach(id => mensTeamIds.add(id));
  }
  console.log(`  Found ${mensTeamIds.size} men's NAIA teams`);
  
  console.log('  Fetching women\'s team IDs...');
  for (let i = 0; i < teamUrls.womens.length; i += CONCURRENT_REQUESTS) {
    const batch = teamUrls.womens.slice(i, i + CONCURRENT_REQUESTS);
    const results = await Promise.all(batch.map(async url => {
      try {
        const json = await fetchJson(url);
        const teamId = json.attributes?.teamId;
        const teamName = json.attributes?.school_name;
        if (teamId && teamName && !isExcludedTeam(teamName, 'womens')) {
          return teamId;
        }
      } catch (e) {}
      return null;
    }));
    results.filter(Boolean).forEach(id => womensTeamIds.add(id));
  }
  console.log(`  Found ${womensTeamIds.size} women's NAIA teams`);
  
  // PASS 2: Process teams with NAIA filtering
  console.log('\n📊 PASS 2: PROCESSING MEN\'S TEAMS (NAIA games only)');
  console.log('-'.repeat(40));
  const mensTeams = await processTeamsInBatchesWithNAIAFilter(teamUrls.mens, 'mens', mensTeamIds);
  
  console.log('\n📊 PASS 2: PROCESSING WOMEN\'S TEAMS (NAIA games only)');
  console.log('-'.repeat(40));
  const womensTeams = await processTeamsInBatchesWithNAIAFilter(teamUrls.womens, 'womens', womensTeamIds);
  
  const allTeams = [...mensTeams, ...womensTeams];
  
  // Build lookup structures
  const allTeamMetrics = {};
  const allTeamGames = {};
  const naiaTeamIds = new Set([...mensTeamIds, ...womensTeamIds]);
  
  for (const team of allTeams) {
    allTeamMetrics[team.teamId] = team.metrics;
    allTeamGames[team.teamId] = team.games;
  }
  
  console.log('\n📈 CALCULATING RPI & STRENGTH OF SCHEDULE');
  console.log('-'.repeat(40));
  
  const mensMetrics = Object.fromEntries(
    Object.entries(allTeamMetrics).filter(([id]) => mensTeamIds.has(id))
  );
  const womensMetrics = Object.fromEntries(
    Object.entries(allTeamMetrics).filter(([id]) => womensTeamIds.has(id))
  );
  
  const mensRPI = calculateRPIandSOS(mensMetrics, mensTeamIds);
  const womensRPI = calculateRPIandSOS(womensMetrics, womensTeamIds);
  const allRPI = { ...mensRPI, ...womensRPI };
  
  console.log(`  Men's RPI calculated for ${Object.keys(mensRPI).length} teams`);
  console.log(`  Women's RPI calculated for ${Object.keys(womensRPI).length} teams`);
  
  console.log('\n📈 CALCULATING ADJUSTED RATINGS');
  console.log('-'.repeat(40));
  
  // Calculate adjusted ratings separately for each league
  const mensGames = Object.fromEntries(
    Object.entries(allTeamGames).filter(([id]) => mensTeamIds.has(id))
  );
  const womensGames = Object.fromEntries(
    Object.entries(allTeamGames).filter(([id]) => womensTeamIds.has(id))
  );
  
  const mensAdjusted = calculateAdjustedRatings(mensMetrics, mensGames);
  const womensAdjusted = calculateAdjustedRatings(womensMetrics, womensGames);
  const allAdjusted = { ...mensAdjusted, ...womensAdjusted };
  
  console.log(`  Men's adjusted ratings calculated for ${Object.keys(mensAdjusted).length} teams`);
  console.log(`  Women's adjusted ratings calculated for ${Object.keys(womensAdjusted).length} teams`);
  
  // Save to database
  console.log('\n💾 SAVING TO DATABASE');
  console.log('-'.repeat(40));
  
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('  Connected to database');
    
    let saved = 0;
    for (const team of allTeams) {
      await saveToDatabase(client, team, allRPI, allAdjusted);
      saved++;
    }
    
    console.log(`  Saved ${saved} team ratings`);
    
    // Show top 10 teams by adjusted net rating
    console.log('\n🏆 TOP 10 MEN\'S TEAMS BY ADJUSTED NET RATING');
    console.log('-'.repeat(40));
    
    const topMens = mensTeams
      .map(t => ({
        name: t.teamName,
        record: `${t.metrics.wins}-${t.metrics.losses}`,
        adjNRTG: mensAdjusted[t.teamId]?.adjNRTG || 0,
        rpi: mensRPI[t.teamId]?.rpi || 0
      }))
      .sort((a, b) => b.adjNRTG - a.adjNRTG)
      .slice(0, 10);
    
    topMens.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.name} (${t.record}) - adjNRTG: ${t.adjNRTG.toFixed(1)}, RPI: ${t.rpi.toFixed(3)}`);
    });
    
    console.log('\n🏆 TOP 10 WOMEN\'S TEAMS BY ADJUSTED NET RATING');
    console.log('-'.repeat(40));
    
    const topWomens = womensTeams
      .map(t => ({
        name: t.teamName,
        record: `${t.metrics.wins}-${t.metrics.losses}`,
        adjNRTG: womensAdjusted[t.teamId]?.adjNRTG || 0,
        rpi: womensRPI[t.teamId]?.rpi || 0
      }))
      .sort((a, b) => b.adjNRTG - a.adjNRTG)
      .slice(0, 10);
    
    topWomens.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.name} (${t.record}) - adjNRTG: ${t.adjNRTG.toFixed(1)}, RPI: ${t.rpi.toFixed(3)}`);
    });
    
  } finally {
    await client.end();
  }

  // Refresh box score derived stats for both leagues
  console.log('\nRefreshing box score derived stats...');
  await refreshTeamStats(SEASON, 'mens');
  await refreshTeamStats(SEASON, 'womens');
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log('\n' + '='.repeat(60));
  console.log('COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total teams processed: ${allTeams.length}`);
  console.log(`Time elapsed: ${elapsed} seconds`);
  console.log('\n✅ Analytics calculation complete!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
