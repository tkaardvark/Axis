/**
 * NAIA Data Import Script
 *
 * This script fetches team JSON data from the URLs collected by the scraper
 * and imports the data into PostgreSQL.
 *
 * Tables populated:
 * - teams: Team information (name, conference, etc.)
 * - games: Individual game results
 * - team_ratings: Calculated team statistics (to be computed separately)
 *
 * Usage: node import-data.js [--season 2024-25]
 */

require('dotenv').config();
const { Client } = require('pg');
const https = require('https');
const fs = require('fs');
const { exhibitionOverrides } = require('./config/exhibition-overrides');

// Build a Set of game IDs that should be forced to exhibition
const EXHIBITION_OVERRIDE_IDS = new Set(exhibitionOverrides.map(o => o.gameId));

// Parse --season argument (default: 2025-26)
const args = process.argv.slice(2);
const seasonIdx = args.indexOf('--season');
const SEASON = seasonIdx !== -1 && args[seasonIdx + 1] ? args[seasonIdx + 1] : '2025-26';

// Configuration
const TEAM_URLS_FILE = `team-urls-${SEASON}.json`;
const CONCURRENT_REQUESTS = 5;  // Fetch 5 teams at a time
const DELAY_BETWEEN_BATCHES = 300;  // ms

/**
 * EXCLUDED TEAMS - Teams to skip during import
 * These are non-NAIA members or teams not in the official RPI list.
 * Match is case-insensitive and checks if team name contains the string.
 */
const EXCLUDED_TEAMS = [
  'Antelope Valley',      // Not an NAIA member - NAIA-independent/non-member school
  'Point Park',           // Not in the NAIA men's basketball RPI list
  'Saint Katherine',      // Not in the NAIA men's basketball RPI list (CA)
];

/**
 * Make an HTTPS GET request and return JSON
 */
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Extract team data from JSON
 */
function extractTeamData(json, jsonUrl, league) {
  const attrs = json.attributes || {};
  
  return {
    team_id: attrs.teamId || null,
    name: attrs.school_name || 'Unknown',
    league: league,
    conference: null,  // Not directly in this JSON, would need separate lookup
    json_url: jsonUrl,
    primary_color: null,
    secondary_color: null,
    logo_url: null
  };
}

/**
 * Parse "made-attempted" format (e.g., "36-67") into { made, attempted }
 */
function parseMadeAttempted(value) {
  if (!value || typeof value !== 'string') return { made: null, attempted: null };
  const parts = value.split('-');
  if (parts.length !== 2) return { made: null, attempted: null };
  return {
    made: parseInt(parts[0]) || null,
    attempted: parseInt(parts[1]) || null
  };
}

/**
 * Parse a numeric stat value
 */
function parseStatNum(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

/**
 * Extract all box score stats from a game's stats object
 */
function extractGameStats(stats) {
  if (!stats) return {};
  
  // Parse shooting stats
  const fg = parseMadeAttempted(stats.fgp);
  const fg3 = parseMadeAttempted(stats.fgp3);
  const ft = parseMadeAttempted(stats.ftp);
  const fgOpp = parseMadeAttempted(stats.fgpopp);
  const fg3Opp = parseMadeAttempted(stats.fgp3opp);
  const ftOpp = parseMadeAttempted(stats.ftpopp);
  
  return {
    // Team shooting
    fgm: fg.made,
    fga: fg.attempted,
    fg_pct: parseStatNum(stats.fgptpct),
    fgm3: fg3.made,
    fga3: fg3.attempted,
    fg3_pct: parseStatNum(stats.fgpt3pct),
    ftm: ft.made,
    fta: ft.attempted,
    ft_pct: parseStatNum(stats.ftppct),
    
    // Team rebounding
    oreb: parseStatNum(stats.oreb),
    dreb: parseStatNum(stats.dreb),
    treb: parseStatNum(stats.treb),
    
    // Team other
    ast: parseStatNum(stats.ast),
    stl: parseStatNum(stats.stl),
    blk: parseStatNum(stats.blk),
    turnovers: parseStatNum(stats.to),
    pf: parseStatNum(stats.pf),
    
    // Team advanced
    pts_paint: parseStatNum(stats.ptspaint),
    pts_fastbreak: parseStatNum(stats.ptsfastb),
    pts_bench: parseStatNum(stats.ptsbench),
    pts_turnovers: parseStatNum(stats.ptsto),
    possessions: parseStatNum(stats.tposs),
    
    // Opponent shooting
    opp_fgm: fgOpp.made,
    opp_fga: fgOpp.attempted,
    opp_fg_pct: parseStatNum(stats.fgptpctopp),
    opp_fgm3: fg3Opp.made,
    opp_fga3: fg3Opp.attempted,
    opp_fg3_pct: parseStatNum(stats.fgpt3pctopp),
    opp_ftm: ftOpp.made,
    opp_fta: ftOpp.attempted,
    opp_ft_pct: parseStatNum(stats.ftppctopp),
    
    // Opponent rebounding
    opp_oreb: parseStatNum(stats.orebopp),
    opp_dreb: parseStatNum(stats.drebopp),
    opp_treb: parseStatNum(stats.trebopp),
    
    // Opponent other
    opp_ast: parseStatNum(stats.astopp),
    opp_stl: parseStatNum(stats.stlopp),
    opp_blk: parseStatNum(stats.blkopp),
    opp_turnovers: parseStatNum(stats.toopp),
    opp_pf: parseStatNum(stats.pfopp),
    
    // Opponent advanced
    opp_pts_paint: parseStatNum(stats.ptspaintopp),
    opp_pts_fastbreak: parseStatNum(stats.ptsfastbopp),
    opp_pts_bench: parseStatNum(stats.ptsbenchopp),
    opp_pts_turnovers: parseStatNum(stats.ptstoopp),
    opp_possessions: parseStatNum(stats.tpossopp),
    
    // Halftime scores
    first_half_score: parseStatNum(stats.g1),
    second_half_score: parseStatNum(stats.g2),
    opp_first_half_score: parseStatNum(stats.g1opp),
    opp_second_half_score: parseStatNum(stats.g2opp),
  };
}

/**
 * Extract game data from a team's events
 */
function extractGames(json, teamId) {
  const events = json.events || [];
  const games = [];
  
  for (const eventData of events) {
    const event = eventData.event;
    const stats = eventData.stats;
    if (!event) continue;
    
    // Check if game has been played (has scores)
    const hasScores = event.resultAsObject && event.resultAsObject.hasScores;
    
    // Find our team and opponent
    const teams = event.teams || [];
    const usTeam = teams.find(t => t.teamId === teamId);
    const opponent = teams.find(t => t.teamId !== teamId);
    
    if (!opponent) continue;  // Need at least an opponent
    
    // Determine location
    let location = 'neutral';
    if (event.home === true) {
      location = 'home';
    } else if (event.home === false && !event.neutralSite) {
      location = 'away';
    }
    
    // Parse date - use eventDateFormatted (e.g., "Feb 6") to avoid timezone issues
    // The timestamp in event.date is UTC and can shift to the next day for evening games
    // NOTE: eventDateFormatted is on eventData, not on event!
    //
    // Derive year from the SEASON string, not from the timestamp.
    // Season "2025-26" means Aug-Dec = 2025, Jan-Jul = 2026.
    // This avoids bugs where a late-night game's UTC timestamp crosses
    // into the next calendar year (e.g., Dec 31 at 8pm ET = Jan 1 UTC).
    const seasonYears = SEASON.split('-');
    const seasonStartYear = parseInt(seasonYears[0]);           // e.g., 2025
    const seasonEndYear = seasonStartYear + 1;                  // e.g., 2026

    let gameDate;
    if (eventData.eventDateFormatted) {
      // eventDateFormatted is like "Feb 6" or "Jan 31" - determine year from month
      const monthMap = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };
      const monthAbbr = eventData.eventDateFormatted.split(' ')[0];
      const monthNum = monthMap[monthAbbr];
      // Months Aug(7)-Dec(11) belong to the start year; Jan(0)-Jul(6) to the end year
      const year = (monthNum !== undefined && monthNum >= 7) ? seasonStartYear : seasonEndYear;
      gameDate = new Date(`${eventData.eventDateFormatted}, ${year}`);
      if (isNaN(gameDate.getTime())) {
        // Fallback: use UTC date from timestamp
        const ts = new Date(event.date);
        gameDate = new Date(Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate()));
      }
    } else {
      // No formatted date available - use UTC date from timestamp to avoid local TZ shift
      const ts = new Date(event.date);
      gameDate = new Date(Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate()));
    }
    
    // Extract all box score stats (only if game has been played)
    const gameStats = hasScores ? extractGameStats(stats) : {};
    
    // Check if exhibition or scrimmage
    const eventTypeCode = event.eventType?.code?.toLowerCase() || '';
    const isExhibition = eventTypeCode === 'exhibition' || eventTypeCode === 'scrimmage';
    
    // Determine if this is a national tournament game (vs conference tournament)
    // National tournament typically starts mid-March (around March 12-14)
    const isPostseason = event.postseason || false;
    const isNationalTournament = isPostseason && gameDate.getMonth() === 2 && gameDate.getDate() >= 12;
    
    // Get scores (null for future games)
    let teamScore = hasScores && usTeam ? parseInt(usTeam.result) || null : null;
    let opponentScore = hasScores && opponent ? parseInt(opponent.result) || null : null;
    
    // Detect forfeit games: 1-0 or 0-1 with one null score
    // Forfeit win: teamScore=1, opponentScore=null -> set opponentScore=0
    // Forfeit loss: teamScore=null, opponentScore=1 -> set teamScore=0
    const isForfeitWin = teamScore === 1 && opponentScore === null;
    const isForfeitLoss = teamScore === null && opponentScore === 1;
    
    if (isForfeitWin) {
      opponentScore = 0;
    } else if (isForfeitLoss) {
      teamScore = 0;
    }
    
    // Game is completed if it has scores (regardless of status field)
    // Forfeit games are also considered completed
    const isCompleted = hasScores && teamScore !== null && opponentScore !== null;
    
    games.push({
      game_id: `${teamId}_${event.eventId}`,
      team_id: teamId,
      opponent_id: opponent.teamId,
      opponent_name: opponent.name,
      game_date: gameDate.toISOString().split('T')[0],
      location: location,
      team_score: teamScore,
      opponent_score: opponentScore,
      is_completed: isCompleted,
      is_conference: event.conference || false,
      is_postseason: isPostseason,
      is_national_tournament: isNationalTournament,
      is_exhibition: isExhibition,
      event_id: event.eventId,
      ...gameStats
    });
  }
  
  return games;
}

/**
 * Insert or update a team in the database
 */
async function upsertTeam(client, team) {
  if (!team.team_id) return null;

  const query = `
    INSERT INTO teams (team_id, name, league, conference, json_url, primary_color, secondary_color, logo_url, season, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
    ON CONFLICT (team_id, season)
    DO UPDATE SET
      name = EXCLUDED.name,
      league = EXCLUDED.league,
      json_url = EXCLUDED.json_url,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id
  `;

  const result = await client.query(query, [
    team.team_id,
    team.name,
    team.league,
    team.conference,
    team.json_url,
    team.primary_color,
    team.secondary_color,
    team.logo_url,
    SEASON
  ]);

  return result.rows[0]?.id;
}

/**
 * Insert or update games in the database
 */
async function upsertGames(client, games) {
  let inserted = 0;
  let updated = 0;
  
  for (const game of games) {
    const query = `
      INSERT INTO games (
        game_id, team_id, opponent_id, opponent_name, game_date, location,
        team_score, opponent_score, is_completed, is_conference, is_postseason, is_national_tournament, is_exhibition, event_id,
        fgm, fga, fg_pct, fgm3, fga3, fg3_pct, ftm, fta, ft_pct,
        oreb, dreb, treb, ast, stl, blk, turnovers, pf,
        pts_paint, pts_fastbreak, pts_bench, pts_turnovers, possessions,
        opp_fgm, opp_fga, opp_fg_pct, opp_fgm3, opp_fga3, opp_fg3_pct, opp_ftm, opp_fta, opp_ft_pct,
        opp_oreb, opp_dreb, opp_treb, opp_ast, opp_stl, opp_blk, opp_turnovers, opp_pf,
        opp_pts_paint, opp_pts_fastbreak, opp_pts_bench, opp_pts_turnovers, opp_possessions,
        first_half_score, second_half_score, opp_first_half_score, opp_second_half_score,
        season, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20, $21, $22, $23,
        $24, $25, $26, $27, $28, $29, $30, $31,
        $32, $33, $34, $35, $36,
        $37, $38, $39, $40, $41, $42, $43, $44, $45,
        $46, $47, $48, $49, $50, $51, $52, $53,
        $54, $55, $56, $57, $58,
        $59, $60, $61, $62,
        $63, CURRENT_TIMESTAMP
      )
      ON CONFLICT (game_id, season)
      DO UPDATE SET
        game_date = EXCLUDED.game_date,
        location = EXCLUDED.location,
        team_score = EXCLUDED.team_score,
        opponent_score = EXCLUDED.opponent_score,
        is_completed = EXCLUDED.is_completed,
        is_conference = EXCLUDED.is_conference,
        is_postseason = EXCLUDED.is_postseason,
        is_national_tournament = EXCLUDED.is_national_tournament,
        is_exhibition = EXCLUDED.is_exhibition,
        opponent_name = EXCLUDED.opponent_name,
        fgm = EXCLUDED.fgm, fga = EXCLUDED.fga, fg_pct = EXCLUDED.fg_pct,
        fgm3 = EXCLUDED.fgm3, fga3 = EXCLUDED.fga3, fg3_pct = EXCLUDED.fg3_pct,
        ftm = EXCLUDED.ftm, fta = EXCLUDED.fta, ft_pct = EXCLUDED.ft_pct,
        oreb = EXCLUDED.oreb, dreb = EXCLUDED.dreb, treb = EXCLUDED.treb,
        ast = EXCLUDED.ast, stl = EXCLUDED.stl, blk = EXCLUDED.blk,
        turnovers = EXCLUDED.turnovers, pf = EXCLUDED.pf,
        pts_paint = EXCLUDED.pts_paint, pts_fastbreak = EXCLUDED.pts_fastbreak,
        pts_bench = EXCLUDED.pts_bench, pts_turnovers = EXCLUDED.pts_turnovers,
        possessions = EXCLUDED.possessions,
        opp_fgm = EXCLUDED.opp_fgm, opp_fga = EXCLUDED.opp_fga, opp_fg_pct = EXCLUDED.opp_fg_pct,
        opp_fgm3 = EXCLUDED.opp_fgm3, opp_fga3 = EXCLUDED.opp_fga3, opp_fg3_pct = EXCLUDED.opp_fg3_pct,
        opp_ftm = EXCLUDED.opp_ftm, opp_fta = EXCLUDED.opp_fta, opp_ft_pct = EXCLUDED.opp_ft_pct,
        opp_oreb = EXCLUDED.opp_oreb, opp_dreb = EXCLUDED.opp_dreb, opp_treb = EXCLUDED.opp_treb,
        opp_ast = EXCLUDED.opp_ast, opp_stl = EXCLUDED.opp_stl, opp_blk = EXCLUDED.opp_blk,
        opp_turnovers = EXCLUDED.opp_turnovers, opp_pf = EXCLUDED.opp_pf,
        opp_pts_paint = EXCLUDED.opp_pts_paint, opp_pts_fastbreak = EXCLUDED.opp_pts_fastbreak,
        opp_pts_bench = EXCLUDED.opp_pts_bench, opp_pts_turnovers = EXCLUDED.opp_pts_turnovers,
        opp_possessions = EXCLUDED.opp_possessions,
        first_half_score = EXCLUDED.first_half_score, second_half_score = EXCLUDED.second_half_score,
        opp_first_half_score = EXCLUDED.opp_first_half_score, opp_second_half_score = EXCLUDED.opp_second_half_score,
        updated_at = CURRENT_TIMESTAMP
      RETURNING (xmax = 0) as inserted
    `;
    
    try {
      const result = await client.query(query, [
        game.game_id, game.team_id, game.opponent_id, game.opponent_name,
        game.game_date, game.location, game.team_score, game.opponent_score,
        game.is_completed, game.is_conference, game.is_postseason, game.is_national_tournament, game.is_exhibition, game.event_id,
        game.fgm, game.fga, game.fg_pct, game.fgm3, game.fga3, game.fg3_pct,
        game.ftm, game.fta, game.ft_pct,
        game.oreb, game.dreb, game.treb, game.ast, game.stl, game.blk,
        game.turnovers, game.pf,
        game.pts_paint, game.pts_fastbreak, game.pts_bench, game.pts_turnovers, game.possessions,
        game.opp_fgm, game.opp_fga, game.opp_fg_pct, game.opp_fgm3, game.opp_fga3, game.opp_fg3_pct,
        game.opp_ftm, game.opp_fta, game.opp_ft_pct,
        game.opp_oreb, game.opp_dreb, game.opp_treb, game.opp_ast, game.opp_stl, game.opp_blk,
        game.opp_turnovers, game.opp_pf,
        game.opp_pts_paint, game.opp_pts_fastbreak, game.opp_pts_bench, game.opp_pts_turnovers, game.opp_possessions,
        game.first_half_score, game.second_half_score, game.opp_first_half_score, game.opp_second_half_score,
        SEASON
      ]);
      
      if (result.rows[0]?.inserted) {
        inserted++;
      } else {
        updated++;
      }
    } catch (err) {
      // opponent_id might not exist as a team yet - skip foreign key errors
      if (err.code !== '23503') {
        console.error(`  Error inserting game ${game.game_id}: ${err.message}`);
      }
    }
  }
  
  return { inserted, updated };
}

/**
 * Check if a team should be excluded from import
 */
function isExcludedTeam(teamName) {
  if (!teamName) return false;
  const lowerName = teamName.toLowerCase();
  return EXCLUDED_TEAMS.some(excluded => lowerName.includes(excluded.toLowerCase()));
}

/**
 * Process a single team URL
 */
async function processTeamUrl(client, url, league) {
  try {
    const json = await fetchJson(url);
    
    // Extract and save team data
    const teamData = extractTeamData(json, url, league);
    if (!teamData.team_id) {
      return { success: false, error: 'No team ID found' };
    }
    
    // Check if team should be excluded
    if (isExcludedTeam(teamData.name)) {
      return { success: true, skipped: true, teamName: teamData.name, reason: 'Excluded team' };
    }
    
    await upsertTeam(client, teamData);
    
    // Extract and save games
    const games = extractGames(json, teamData.team_id);

    // Apply manual exhibition overrides
    for (const game of games) {
      if (EXHIBITION_OVERRIDE_IDS.has(game.game_id)) {
        game.is_exhibition = true;
      }
    }

    const gameStats = await upsertGames(client, games);
    
    return {
      success: true,
      teamId: teamData.team_id,
      teamName: teamData.name,
      gamesProcessed: games.length,
      gamesInserted: gameStats.inserted,
      gamesUpdated: gameStats.updated
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Process teams in batches
 */
async function processTeamsInBatches(client, urls, league) {
  const results = {
    success: 0,
    failed: 0,
    skipped: 0,
    totalGames: 0
  };
  
  console.log(`\nProcessing ${urls.length} ${league} teams...`);
  
  for (let i = 0; i < urls.length; i += CONCURRENT_REQUESTS) {
    const batch = urls.slice(i, i + CONCURRENT_REQUESTS);
    const batchNum = Math.floor(i / CONCURRENT_REQUESTS) + 1;
    const totalBatches = Math.ceil(urls.length / CONCURRENT_REQUESTS);
    
    process.stdout.write(`  Batch ${batchNum}/${totalBatches}...`);
    
    const promises = batch.map(url => processTeamUrl(client, url, league));
    const batchResults = await Promise.all(promises);
    
    let batchSuccess = 0;
    let batchGames = 0;
    
    for (const result of batchResults) {
      if (result.skipped) {
        results.skipped++;
        console.log(`\n    ⏭ Skipped: ${result.teamName} (${result.reason})`);
      } else if (result.success) {
        results.success++;
        batchSuccess++;
        results.totalGames += result.gamesProcessed;
        batchGames += result.gamesProcessed;
      } else {
        results.failed++;
      }
    }
    
    console.log(` ${batchSuccess} teams, ${batchGames} games`);
    
    // Small delay between batches
    if (i + CONCURRENT_REQUESTS < urls.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
    }
  }
  
  return results;
}

/**
 * Main function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('NAIA Data Import');
  console.log(`Season: ${SEASON}`);
  console.log('='.repeat(60));
  
  // Load team URLs
  if (!fs.existsSync(TEAM_URLS_FILE)) {
    console.error(`\n❌ Error: ${TEAM_URLS_FILE} not found.`);
    console.error('Run "npm run scrape" first to generate the team URLs.');
    process.exit(1);
  }
  
  const teamUrls = JSON.parse(fs.readFileSync(TEAM_URLS_FILE, 'utf8'));
  console.log(`\nLoaded ${teamUrls.mens.length} men's and ${teamUrls.womens.length} women's team URLs`);
  
  // Connect to database
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('✓ Connected to database');
    
    const startTime = Date.now();
    
    // Process men's teams
    console.log('\n📊 MEN\'S BASKETBALL');
    console.log('-'.repeat(40));
    const mensResults = await processTeamsInBatches(client, teamUrls.mens, 'mens');
    
    // Process women's teams
    console.log('\n📊 WOMEN\'S BASKETBALL');
    console.log('-'.repeat(40));
    const womensResults = await processTeamsInBatches(client, teamUrls.womens, 'womens');
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('IMPORT SUMMARY');
    console.log('='.repeat(60));
    console.log(`Men's teams:     ${mensResults.success} imported, ${mensResults.skipped} skipped, ${mensResults.failed} failed`);
    console.log(`Men's games:     ${mensResults.totalGames}`);
    console.log(`Women's teams:   ${womensResults.success} imported, ${womensResults.skipped} skipped, ${womensResults.failed} failed`);
    console.log(`Women's games:   ${womensResults.totalGames}`);
    console.log(`Total time:      ${elapsed} seconds`);
    
    // Get database counts
    const teamCount = await client.query('SELECT COUNT(*) FROM teams');
    const gameCount = await client.query('SELECT COUNT(*) FROM games');
    
    console.log('\n📊 DATABASE TOTALS');
    console.log('-'.repeat(40));
    console.log(`Total teams in DB: ${teamCount.rows[0].count}`);
    console.log(`Total games in DB: ${gameCount.rows[0].count}`);
    
    // Mark NAIA games (opponent exists in teams table and is not excluded) for this season only
    console.log('\n🏀 MARKING NAIA GAMES');
    console.log('-'.repeat(40));

    // First set all games for this season to non-NAIA
    await client.query(`UPDATE games SET is_naia_game = FALSE WHERE season = $1`, [SEASON]);

    // Then mark games where opponent is a valid NAIA team (same season)
    const naiaResult = await client.query(`
      UPDATE games g
      SET is_naia_game = TRUE
      FROM teams t
      WHERE g.opponent_id = t.team_id
        AND t.is_excluded = FALSE
        AND g.season = $1
        AND t.season = $1
    `, [SEASON]);

    const naiaCounts = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE is_naia_game = TRUE) as naia,
        COUNT(*) FILTER (WHERE is_naia_game = FALSE) as non_naia
      FROM games
      WHERE season = $1
    `, [SEASON]);
    
    console.log(`NAIA games: ${naiaCounts.rows[0].naia}`);
    console.log(`Non-NAIA games: ${naiaCounts.rows[0].non_naia}`);
    
    console.log('\n✅ Import complete!');
    
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run the import
main();
