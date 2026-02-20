/**
 * Import Future Games
 *
 * Fetches each team's Presto Sports JSON schedule and extracts
 * unplayed/scheduled games into the `future_games` table.
 *
 * This replaces the need for `import-data.js` to populate the
 * legacy `games` table with future game schedule data.
 *
 * Usage:
 *   node import-future-games.js [--season 2025-26] [--league mens]
 */

require('dotenv').config();
const { Pool } = require('pg');
const https = require('https');
const fs = require('fs');

const args = process.argv.slice(2);
const seasonIdx = args.indexOf('--season');
const SEASON = seasonIdx !== -1 && args[seasonIdx + 1] ? args[seasonIdx + 1] : '2025-26';
const leagueIdx = args.indexOf('--league');
const LEAGUE = leagueIdx !== -1 && args[leagueIdx + 1] ? args[leagueIdx + 1] : 'mens';

const TEAM_URLS_FILE = `team-urls-${SEASON}.json`;
const CONCURRENT_REQUESTS = 5;
const DELAY_BETWEEN_BATCHES = 300;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('render.com')
    ? { rejectUnauthorized: false }
    : false,
});

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse failed: ${url}`)); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Parse a date from the Presto Sports JSON event.
 * Reuses the same logic as import-data.js.
 */
function parseGameDate(eventData, season) {
  const event = eventData.event;

  // Derive year from the SEASON string
  const [startYear, endSuffix] = season.split('-');
  const fullEndYear = parseInt(startYear.substring(0, 2) + endSuffix);
  const fullStartYear = parseInt(startYear);

  if (eventData.eventDateFormatted) {
    const formatted = eventData.eventDateFormatted.trim();
    const monthDay = formatted.match(/^(\w+)\s+(\d+)/);
    if (monthDay) {
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const monthIndex = monthNames.findIndex(m => formatted.startsWith(m));
      if (monthIndex !== -1) {
        const day = parseInt(monthDay[2]);
        const year = monthIndex >= 7 ? fullStartYear : fullEndYear; // Aug-Dec = start year
        return new Date(Date.UTC(year, monthIndex, day)).toISOString().split('T')[0];
      }
    }
  }

  // Fallback: use UTC date from timestamp
  const ts = new Date(event.date);
  return new Date(Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate()))
    .toISOString().split('T')[0];
}

/**
 * Extract future (unplayed) games from a team's JSON schedule.
 */
function extractFutureGames(json, teamId, season) {
  const events = json.events || [];
  const futureGames = [];

  for (const eventData of events) {
    const event = eventData.event;
    if (!event) continue;

    const teams = event.teams || [];
    const usTeam = teams.find(t => t.teamId === teamId);
    const opponent = teams.find(t => t.teamId !== teamId);
    if (!opponent) continue;

    // Check if game has been played (has scores)
    const hasScores = usTeam && opponent &&
      usTeam.result !== null && usTeam.result !== undefined && usTeam.result !== '' &&
      opponent.result !== null && opponent.result !== undefined && opponent.result !== '';

    if (hasScores) continue; // Skip completed games

    // Check if exhibition or scrimmage
    const eventTypeCode = event.eventType?.code?.toLowerCase() || '';
    const isExhibition = eventTypeCode === 'exhibition' || eventTypeCode === 'scrimmage';

    // Determine location
    let location = 'neutral';
    if (event.home === true) {
      location = 'home';
    } else if (event.home === false && !event.neutralSite) {
      location = 'away';
    }

    const gameDate = parseGameDate(eventData, season);

    futureGames.push({
      season,
      league: LEAGUE,
      team_id: teamId,
      opponent_id: opponent.teamId || null,
      opponent_name: opponent.name || 'Unknown',
      game_date: gameDate,
      location,
      is_conference: event.conference || false,
      is_exhibition: isExhibition,
      is_postseason: event.postseason || false,
    });
  }

  return futureGames;
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Future Games Importer');
  console.log(`  Season: ${SEASON} | League: ${LEAGUE}`);
  console.log('═══════════════════════════════════════════════════\n');

  // Load team URLs
  if (!fs.existsSync(TEAM_URLS_FILE)) {
    console.error(`Team URLs file not found: ${TEAM_URLS_FILE}`);
    console.error('Run scrape-team-urls.js first');
    process.exit(1);
  }

  const teamUrlsData = JSON.parse(fs.readFileSync(TEAM_URLS_FILE, 'utf8'));
  const leagueUrls = teamUrlsData[LEAGUE] || [];
  console.log(`Loaded ${leagueUrls.length} team URLs for ${LEAGUE}\n`);

  // Get all NAIA team IDs for is_naia_game determination
  const naiaTeamsResult = await pool.query(
    'SELECT team_id FROM teams WHERE season = $1 AND league = $2 AND is_excluded = false',
    [SEASON, LEAGUE]
  );
  const naiaTeamIds = new Set(naiaTeamsResult.rows.map(r => r.team_id));

  // Clear existing future games for this season+league
  const deleted = await pool.query(
    'DELETE FROM future_games WHERE season = $1 AND league = $2',
    [SEASON, LEAGUE]
  );
  console.log(`Cleared ${deleted.rowCount} existing future games\n`);

  let totalFuture = 0;
  let errors = 0;

  // Process teams in batches
  for (let i = 0; i < leagueUrls.length; i += CONCURRENT_REQUESTS) {
    const batch = leagueUrls.slice(i, i + CONCURRENT_REQUESTS);

    const results = await Promise.allSettled(
      batch.map(async (jsonUrl) => {
        try {
          const json = await fetchJson(jsonUrl);
          const teamId = json.attributes?.teamId;
          if (!teamId) return 0;
          const futureGames = extractFutureGames(json, teamId, SEASON);

          for (const game of futureGames) {
            // Determine is_naia_game: opponent must be a known NAIA team
            const isNaia = !game.is_exhibition && game.opponent_id && naiaTeamIds.has(game.opponent_id);

            await pool.query(`
              INSERT INTO future_games (
                season, league, team_id, opponent_id, opponent_name,
                game_date, location, is_conference, is_exhibition,
                is_postseason, is_naia_game
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
              ON CONFLICT (team_id, opponent_name, game_date, season)
              DO UPDATE SET
                opponent_id = EXCLUDED.opponent_id,
                location = EXCLUDED.location,
                is_conference = EXCLUDED.is_conference,
                is_naia_game = EXCLUDED.is_naia_game,
                updated_at = NOW()
            `, [
              game.season, game.league, game.team_id,
              game.opponent_id, game.opponent_name,
              game.game_date, game.location,
              game.is_conference, game.is_exhibition,
              game.is_postseason, isNaia,
            ]);
          }

          return futureGames.length;
        } catch (err) {
          console.error(`  ❌ ${teamId}: ${err.message}`);
          return 0;
        }
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled') totalFuture += r.value;
      else errors++;
    }

    if (i + CONCURRENT_REQUESTS < leagueUrls.length) {
      await sleep(DELAY_BETWEEN_BATCHES);
    }
  }

  // Summary
  const finalCount = await pool.query(
    'SELECT COUNT(*) as cnt FROM future_games WHERE season = $1 AND league = $2',
    [SEASON, LEAGUE]
  );

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Import Complete');
  console.log(`  Future games inserted: ${finalCount.rows[0].cnt}`);
  if (errors) console.log(`  Errors: ${errors}`);
  console.log('═══════════════════════════════════════════════════');

  await pool.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
