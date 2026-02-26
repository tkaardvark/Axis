/**
 * Player Data Import Script
 *
 * This script fetches player data from the prestosports S3 bucket
 * and imports it into the PostgreSQL database.
 *
 * Usage: node import-players.js [--season 2024-25] [--league mens|womens]
 */

require('dotenv').config();
const https = require('https');

// Parse command line arguments
const args = process.argv.slice(2);
const seasonIdx = args.indexOf('--season');
const leagueIdx = args.indexOf('--league');
const SEASON = seasonIdx !== -1 && args[seasonIdx + 1] ? args[seasonIdx + 1] : '2025-26';
const LEAGUE = leagueIdx !== -1 && args[leagueIdx + 1] ? args[leagueIdx + 1] : 'mens';

// Player data URLs by season (discovered from NAIA stats pages)
const PLAYERS_DATA_IDS = {
  mens: {
    '2025-26': 'k2m8c8dep9kmwf35',
    '2024-25': 'i0h5m23yi9hlgxoq'
  },
  womens: {
    // TODO: Discover womens player data IDs
  }
};

const BASE_URL = 'https://prestosports-downloads.s3.us-west-2.amazonaws.com/playersData/';

/**
 * Fetch JSON from URL
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
          reject(new Error(`Failed to parse JSON: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Parse numeric value, handling strings and nulls
 */
function parseNum(value, defaultVal = 0) {
  if (value === null || value === undefined || value === '') return defaultVal;
  const num = parseFloat(value);
  return isNaN(num) ? defaultVal : num;
}

/**
 * Parse games started from "gp-gs" format like "7-0"
 */
function parseGamesStarted(gaValue) {
  if (!gaValue || typeof gaValue !== 'string') return 0;
  const parts = gaValue.split('-');
  return parts.length === 2 ? parseInt(parts[1]) || 0 : 0;
}

/**
 * Extract player data from JSON individual object
 */
function extractPlayerData(player, season, league) {
  const stats = player.stats || {};
  const dataMap = player.dataMap || {};
  
  // Calculate total rebounds if not provided
  const oreb = parseNum(stats.oreb);
  const dreb = parseNum(stats.dreb);
  const treb = parseNum(stats.treb) || (oreb + dreb);
  
  // Parse games started
  const gs = parseGamesStarted(stats.ga);
  
  return {
    player_id: player.playerId,
    team_id: player.teamId,
    season: season,
    league: league,
    
    // Player info
    first_name: player.firstName || '',
    last_name: player.lastName || '',
    position: player.position || '',
    year: player.year || '',
    uniform: player.uniform || '',
    height: dataMap.height || '',
    
    // Games
    gp: parseNum(stats.gp),
    gs: gs,
    min: parseNum(stats.min),
    min_pg: parseNum(stats.minpg),
    
    // Scoring
    pts: parseNum(stats.pts),
    pts_pg: parseNum(stats.ptspg),
    
    // Rebounds
    oreb: oreb,
    dreb: dreb,
    reb: treb,
    reb_pg: parseNum(stats.trebpg),
    
    // Assists & Turnovers
    ast: parseNum(stats.ast),
    ast_pg: parseNum(stats.astpg),
    turnovers: parseNum(stats.to),
    to_pg: parseNum(stats.topg),
    ast_to_ratio: parseNum(stats.ato),
    
    // Defense
    stl: parseNum(stats.stl),
    stl_pg: parseNum(stats.stlpg),
    blk: parseNum(stats.blk),
    blk_pg: parseNum(stats.blkpg),
    pf: parseNum(stats.pf),
    
    // Shooting
    fgm: parseNum(stats.fgm),
    fga: parseNum(stats.fga),
    fg_pct: parseNum(stats.fgpt),
    
    fg3m: parseNum(stats.fgm3),
    fg3a: parseNum(stats.fga3),
    fg3_pct: parseNum(stats.fgpt3),
    
    ftm: parseNum(stats.ftm),
    fta: parseNum(stats.fta),
    ft_pct: parseNum(stats.ftpt)
  };
}

/**
 * Main import function
 */
async function importPlayers() {
  console.log(`\n📊 Importing ${LEAGUE} player data for ${SEASON}...\n`);
  
  // Get player data ID for this season/league
  const dataId = PLAYERS_DATA_IDS[LEAGUE]?.[SEASON];
  if (!dataId) {
    console.error(`❌ No player data ID found for ${LEAGUE} ${SEASON}`);
    console.log('Available seasons:', Object.keys(PLAYERS_DATA_IDS[LEAGUE] || {}));
    process.exit(1);
  }
  
  const url = `${BASE_URL}${dataId}.json`;
  console.log(`Fetching data from: ${url}`);
  
  // Connect to database
  const { pool } = require('./db/pool');
  
  try {
    // Fetch player data
    const data = await fetchJson(url);
    const individuals = data.individuals || [];
    console.log(`Found ${individuals.length} players in data file\n`);
    
    // Get existing teams for this season to filter valid players
    const teamsResult = await pool.query(
      'SELECT team_id FROM teams WHERE season = $1 AND league = $2',
      [SEASON, LEAGUE]
    );
    const validTeamIds = new Set(teamsResult.rows.map(r => r.team_id));
    console.log(`Found ${validTeamIds.size} teams in database for ${SEASON} ${LEAGUE}\n`);
    
    // Filter to only players on teams we have
    const validPlayers = individuals.filter(p => validTeamIds.has(p.teamId));
    console.log(`${validPlayers.length} players match teams in database\n`);
    
    // Clear existing players for this season/league
    await pool.query(
      'DELETE FROM players WHERE season = $1 AND league = $2',
      [SEASON, LEAGUE]
    );
    console.log(`Cleared existing ${LEAGUE} players for ${SEASON}`);
    
    // Insert players in batches
    const BATCH_SIZE = 100;
    let imported = 0;
    let skipped = 0;
    
    for (let i = 0; i < validPlayers.length; i += BATCH_SIZE) {
      const batch = validPlayers.slice(i, i + BATCH_SIZE);
      
      for (const player of batch) {
        try {
          const data = extractPlayerData(player, SEASON, LEAGUE);
          
          // Skip players with no games played
          if (data.gp === 0) {
            skipped++;
            continue;
          }
          
          await pool.query(`
            INSERT INTO players (
              player_id, team_id, season, league,
              first_name, last_name, position, year, uniform, height,
              gp, gs, min, min_pg,
              pts, pts_pg,
              oreb, dreb, reb, reb_pg,
              ast, ast_pg, turnovers, to_pg, ast_to_ratio,
              stl, stl_pg, blk, blk_pg, pf,
              fgm, fga, fg_pct,
              fg3m, fg3a, fg3_pct,
              ftm, fta, ft_pct
            ) VALUES (
              $1, $2, $3, $4,
              $5, $6, $7, $8, $9, $10,
              $11, $12, $13, $14,
              $15, $16,
              $17, $18, $19, $20,
              $21, $22, $23, $24, $25,
              $26, $27, $28, $29, $30,
              $31, $32, $33,
              $34, $35, $36,
              $37, $38, $39
            )
            ON CONFLICT (player_id, season) DO UPDATE SET
              team_id = EXCLUDED.team_id,
              first_name = EXCLUDED.first_name,
              last_name = EXCLUDED.last_name,
              position = EXCLUDED.position,
              year = EXCLUDED.year,
              uniform = EXCLUDED.uniform,
              height = EXCLUDED.height,
              gp = EXCLUDED.gp,
              gs = EXCLUDED.gs,
              min = EXCLUDED.min,
              min_pg = EXCLUDED.min_pg,
              pts = EXCLUDED.pts,
              pts_pg = EXCLUDED.pts_pg,
              oreb = EXCLUDED.oreb,
              dreb = EXCLUDED.dreb,
              reb = EXCLUDED.reb,
              reb_pg = EXCLUDED.reb_pg,
              ast = EXCLUDED.ast,
              ast_pg = EXCLUDED.ast_pg,
              turnovers = EXCLUDED.turnovers,
              to_pg = EXCLUDED.to_pg,
              ast_to_ratio = EXCLUDED.ast_to_ratio,
              stl = EXCLUDED.stl,
              stl_pg = EXCLUDED.stl_pg,
              blk = EXCLUDED.blk,
              blk_pg = EXCLUDED.blk_pg,
              pf = EXCLUDED.pf,
              fgm = EXCLUDED.fgm,
              fga = EXCLUDED.fga,
              fg_pct = EXCLUDED.fg_pct,
              fg3m = EXCLUDED.fg3m,
              fg3a = EXCLUDED.fg3a,
              fg3_pct = EXCLUDED.fg3_pct,
              ftm = EXCLUDED.ftm,
              fta = EXCLUDED.fta,
              ft_pct = EXCLUDED.ft_pct,
              updated_at = CURRENT_TIMESTAMP
          `, [
            data.player_id, data.team_id, data.season, data.league,
            data.first_name, data.last_name, data.position, data.year, data.uniform, data.height,
            data.gp, data.gs, data.min, data.min_pg,
            data.pts, data.pts_pg,
            data.oreb, data.dreb, data.reb, data.reb_pg,
            data.ast, data.ast_pg, data.turnovers, data.to_pg, data.ast_to_ratio,
            data.stl, data.stl_pg, data.blk, data.blk_pg, data.pf,
            data.fgm, data.fga, data.fg_pct,
            data.fg3m, data.fg3a, data.fg3_pct,
            data.ftm, data.fta, data.ft_pct
          ]);
          
          imported++;
        } catch (err) {
          console.error(`Error importing ${player.firstName} ${player.lastName}:`, err.message);
        }
      }
      
      // Progress update
      process.stdout.write(`\rImported ${imported} players...`);
    }
    
    console.log(`\n\n✅ Import complete!`);
    console.log(`   Imported: ${imported} players`);
    console.log(`   Skipped (0 games): ${skipped} players`);
    
    // Show sample of imported data
    const sample = await pool.query(`
      SELECT first_name, last_name, position, year, pts_pg, reb_pg, ast_pg
      FROM players
      WHERE season = $1 AND league = $2
      ORDER BY pts_pg DESC
      LIMIT 5
    `, [SEASON, LEAGUE]);
    
    console.log('\nTop 5 scorers:');
    sample.rows.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.first_name} ${p.last_name} (${p.position}, ${p.year}) - ${p.pts_pg} PPG, ${p.reb_pg} RPG, ${p.ast_pg} APG`);
    });
    
  } catch (err) {
    console.error('Import failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

importPlayers();
