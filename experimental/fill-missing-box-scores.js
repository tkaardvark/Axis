/**
 * Experimental: Fill Missing Box Scores
 *
 * Discovers box score URLs from team game log pages that were missed by
 * the scoreboard scraper (some games on the scoreboard lack box score XML
 * links even though the XML exists on team pages).
 *
 * Strategy:
 *   1. Scrape the stats page to get all team slugs
 *   2. For each team, fetch their game log page and extract box score URLs
 *   3. Deduplicate across all teams
 *   4. Compare against existing DB records
 *   5. Import any missing box scores
 *   6. Log discoveries to box_score_import_log table
 *
 * Usage:
 *   node experimental/fill-missing-box-scores.js
 *   node experimental/fill-missing-box-scores.js --league womens
 *   node experimental/fill-missing-box-scores.js --dry-run
 *   node experimental/fill-missing-box-scores.js --lookback 3          # only games from last 3 days
 *   node experimental/fill-missing-box-scores.js --lookback 14         # weekly deep scan
 *   node experimental/fill-missing-box-scores.js --job-name gap-fill-nightly
 *   node experimental/fill-missing-box-scores.js --concurrency 3 --delay 500
 */

require('dotenv').config();
const { Pool } = require('pg');
const {
  fetchPage,
  fetchBoxScoreHtml,
  BASE_URL,
  LEAGUE_PATHS,
} = require('./scrape-scoreboard');
const { parseBoxScore } = require('./parse-box-score');
const { insertBoxScore, markNaiaGames } = require('./import-box-scores');
const { refreshTeamStats } = require('../utils/refreshTeamStats');

// Parse CLI args
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal;
}
const hasFlag = (name) => args.includes(`--${name}`);

const CLI_SEASON = getArg('season', '2025-26');
const CLI_LEAGUE = getArg('league', 'mens');
const CLI_CONCURRENCY = parseInt(getArg('concurrency', '3'));
const CLI_DELAY = parseInt(getArg('delay', '500'));
const CLI_DRY_RUN = hasFlag('dry-run');
const CLI_LOOKBACK = getArg('lookback', null);
const CLI_JOB_NAME = getArg('job-name', 'cli');

function createPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('render.com')
      ? { rejectUnauthorized: false }
      : false,
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get an ISO date string in US Eastern time with an offset in days
 */
function getDateStringET(offsetDays = 0) {
  const d = new Date();
  d.setHours(d.getHours() - 5); // Approximate US Eastern: UTC-5
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Get all team slugs from the stats page
 */
async function getTeamSlugs(league, season) {
  const sport = LEAGUE_PATHS[league];
  const url = `${BASE_URL}/sports/${sport}/${season}/teams?sort=won`;
  console.log(`Fetching team list from ${url}...`);

  const html = await fetchPage(url);

  const slugs = new Set();
  const regex = new RegExp(
    `href="/sports/${sport}/${season}/teams/([^"?#/]+)"`,
    'g',
  );
  let match;
  while ((match = regex.exec(html)) !== null) {
    slugs.add(match[1]);
  }

  return Array.from(slugs).sort();
}

/**
 * Get all box score URLs from a team's game log page.
 * Returns array of filenames like "20251115_8vaz.xml".
 */
async function getBoxScoreUrlsFromTeamPage(teamSlug, league, season) {
  const sport = LEAGUE_PATHS[league];
  const url = `${BASE_URL}/sports/${sport}/${season}/teams/${teamSlug}?view=gamelog`;

  const html = await fetchPage(url);

  const urls = new Set();
  // Pattern: href="../boxscores/20251115_8vaz.xml"
  const regex = /href="\.\.\/boxscores\/([^"]+\.xml)"/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    urls.add(match[1]);
  }

  return Array.from(urls);
}

/**
 * Extract a game date from a box score filename
 * e.g. "20251115_8vaz.xml" -> "2025-11-15"
 */
function dateFromFilename(filename) {
  const m = filename.match(/^(\d{4})(\d{2})(\d{2})_/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Log an import event to the box_score_import_log table
 */
async function logImport(pool, entry) {
  try {
    await pool.query(`
      INSERT INTO box_score_import_log (
        box_score_url, season, league, game_date,
        away_team_name, home_team_name, away_score, home_score,
        source, job_name, lookback_days,
        player_count, play_count, status, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    `, [
      entry.boxScoreUrl, entry.season, entry.league, entry.gameDate,
      entry.awayTeamName, entry.homeTeamName, entry.awayScore, entry.homeScore,
      entry.source || 'gap-fill', entry.jobName, entry.lookbackDays,
      entry.playerCount || 0, entry.playCount || 0,
      entry.status || 'imported', entry.errorMessage || null,
    ]);
  } catch (err) {
    // Don't let logging failures break the import
    console.log(`  ⚠️  Failed to log import: ${err.message}`);
  }
}

/**
 * Fetch, parse, and import a single box score URL (gap-fill version)
 */
async function processGapFillBoxScore(boxScoreUrl, season, league, opts = {}) {
  const { dryRun = false, pool: extPool, jobName, lookbackDays } = opts;
  const gameDate = dateFromFilename(boxScoreUrl.split('/').pop());
  const fullUrl = boxScoreUrl.startsWith('http')
    ? boxScoreUrl
    : `${BASE_URL}/sports/${LEAGUE_PATHS[league]}/${season}/boxscores/${boxScoreUrl}`;

  const html = await fetchBoxScoreHtml(fullUrl);
  const parsed = parseBoxScore(html, fullUrl, season, league, gameDate);

  if (!parsed.game.away.name || !parsed.game.home.name) {
    console.log(`  ⚠️  Skipping ${boxScoreUrl} — couldn't parse team names`);
    // Log the skip
    if (extPool && !dryRun) {
      await logImport(extPool, {
        boxScoreUrl: fullUrl, season, league, gameDate,
        awayTeamName: null, homeTeamName: null,
        source: 'gap-fill', jobName, lookbackDays,
        status: 'skipped', errorMessage: 'Could not parse team names',
      });
    }
    return null;
  }

  // We don't have scoreboard metadata for game type, so default everything to false.
  // The markNaiaGames() post-step will fix is_naia_game and is_neutral.
  // Conference/exhibition/postseason flags will remain false — the scoreboard
  // importer will overwrite them if/when the game gets linked on the scoreboard.
  parsed.game.isConference = false;
  parsed.game.isDivision = false;
  parsed.game.isExhibition = false;
  parsed.game.isPostseason = false;
  parsed.game.isNeutral = false;

  // Derive is_national_tournament for late-March games
  const gd = new Date(gameDate + 'T00:00:00Z');
  parsed.game.isNationalTournament = gd.getUTCMonth() === 2 && gd.getUTCDate() >= 12;

  if (dryRun) {
    console.log(`  📋 ${parsed.game.away.name} ${parsed.game.away.score} @ ${parsed.game.home.name} ${parsed.game.home.score}`);
    console.log(`     Players: ${parsed.players.length} | Plays: ${parsed.plays.length}`);
    return parsed;
  }

  const result = await insertBoxScore(parsed);
  console.log(`  ✅ [gap-fill] ${parsed.game.away.name} ${parsed.game.away.score} @ ${parsed.game.home.name} ${parsed.game.home.score} (${result.players} players, ${result.plays} plays)`);

  // Log successful import
  if (extPool) {
    await logImport(extPool, {
      boxScoreUrl: fullUrl, season, league, gameDate,
      awayTeamName: parsed.game.away.name, homeTeamName: parsed.game.home.name,
      awayScore: parsed.game.away.score, homeScore: parsed.game.home.score,
      source: 'gap-fill', jobName, lookbackDays,
      playerCount: result.players, playCount: result.plays,
      status: 'imported',
    });
  }

  return result;
}

/**
 * Main gap-fill orchestrator — can be called programmatically or from CLI.
 *
 * @param {object} options
 * @param {string} options.season - Season string (e.g. '2025-26')
 * @param {string} options.league - 'mens' or 'womens'
 * @param {number} options.concurrency - Concurrent fetches (default 3)
 * @param {number} options.delay - Delay between batches in ms (default 500)
 * @param {boolean} options.dryRun - If true, parse but don't write to DB
 * @param {number|null} options.lookbackDays - Only process games from last N days (null = all)
 * @param {string} options.jobName - Job name for logging (default 'cli')
 * @param {Pool} options.pool - External pool (if null, creates its own)
 * @returns {object} Summary of { teamsScraped, totalOnPages, alreadyInDb, missingFound, imported, errors }
 */
async function fillMissingBoxScores(options = {}) {
  const {
    season = '2025-26',
    league = 'mens',
    concurrency = 3,
    delay = 500,
    dryRun = false,
    lookbackDays = null,
    jobName = 'cli',
  } = options;

  // Use provided pool or create a new one
  const ownPool = !options.pool;
  const pool = options.pool || createPool();

  const summary = {
    teamsScraped: 0,
    totalOnPages: 0,
    alreadyInDb: 0,
    missingFound: 0,
    imported: 0,
    errors: 0,
    totalPlayers: 0,
    totalPlays: 0,
  };

  // Compute lookback cutoff date if specified
  let cutoffDate = null;
  if (lookbackDays) {
    cutoffDate = getDateStringET(-lookbackDays);
    console.log(`  Lookback: ${lookbackDays} days (cutoff: ${cutoffDate})`);
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('  Fill Missing Box Scores (Team Page Discovery)');
  console.log(`  Season: ${season} | League: ${league}`);
  if (lookbackDays) console.log(`  Lookback: last ${lookbackDays} days (since ${cutoffDate})`);
  if (dryRun) console.log('  🔍 DRY RUN — no database writes');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Step 1: Get all team slugs
    const teamSlugs = await getTeamSlugs(league, season);
    console.log(`Found ${teamSlugs.length} teams\n`);

    // Step 2: Scrape all team game logs for box score URLs
    console.log('Scraping team game logs for box score URLs...');
    const allBoxScoreFiles = new Set();

    for (let i = 0; i < teamSlugs.length; i += concurrency) {
      const batch = teamSlugs.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        batch.map(slug => getBoxScoreUrlsFromTeamPage(slug, league, season))
      );

      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.status === 'fulfilled') {
          for (const file of r.value) {
            // If lookback is set, filter by date
            if (cutoffDate) {
              const fileDate = dateFromFilename(file);
              if (!fileDate || fileDate < cutoffDate) continue;
            }
            allBoxScoreFiles.add(file);
          }
          summary.teamsScraped++;
        } else {
          console.log(`  ⚠️  Failed to scrape ${batch[j]}: ${r.reason?.message}`);
        }
      }

      // Progress update every 30 teams
      if ((i + concurrency) % 30 < concurrency) {
        console.log(`  ${summary.teamsScraped}/${teamSlugs.length} teams scraped, ${allBoxScoreFiles.size} unique box scores found...`);
      }

      if (i + concurrency < teamSlugs.length) {
        await sleep(delay);
      }
    }

    summary.totalOnPages = allBoxScoreFiles.size;
    console.log(`\nScraped ${summary.teamsScraped} teams → ${allBoxScoreFiles.size} unique box score files\n`);

    // Step 3: Get existing box score URLs from DB
    console.log('Querying database for existing box scores...');
    const existingResult = await pool.query(
      `SELECT box_score_url FROM exp_game_box_scores WHERE season = $1 AND league = $2`,
      [season, league]
    );

    const existingFiles = new Set();
    for (const row of existingResult.rows) {
      const fileMatch = row.box_score_url.match(/boxscores\/([^/]+\.xml)$/);
      if (fileMatch) {
        existingFiles.add(fileMatch[1]);
      }
    }

    summary.alreadyInDb = existingFiles.size;
    console.log(`  DB has ${existingFiles.size} existing box scores for ${league} ${season}\n`);

    // Step 4: Find missing
    const missingFiles = [];
    for (const file of allBoxScoreFiles) {
      if (!existingFiles.has(file)) {
        missingFiles.push(file);
      }
    }

    missingFiles.sort();
    summary.missingFound = missingFiles.length;

    if (missingFiles.length === 0) {
      console.log('✅ No missing box scores found! Database is complete.\n');
      return summary;
    }

    console.log(`Found ${missingFiles.length} missing box scores:\n`);
    for (const file of missingFiles) {
      const date = dateFromFilename(file);
      console.log(`  ${date}  ${file}`);
    }
    console.log('');

    // Step 5: Import missing box scores
    if (dryRun) {
      console.log('🔍 DRY RUN — Fetching and parsing without importing...\n');
    } else {
      console.log('Importing missing box scores...\n');
    }

    for (let i = 0; i < missingFiles.length; i += concurrency) {
      const batch = missingFiles.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        batch.map(file => {
          const sport = LEAGUE_PATHS[league];
          const fullUrl = `${BASE_URL}/sports/${sport}/${season}/boxscores/${file}`;
          return processGapFillBoxScore(fullUrl, season, league, {
            dryRun, pool, jobName, lookbackDays,
          });
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          summary.imported++;
          if (r.value.players) summary.totalPlayers += typeof r.value.players === 'number' ? r.value.players : (Array.isArray(r.value.players) ? r.value.players.length : 0);
          if (r.value.plays) summary.totalPlays += typeof r.value.plays === 'number' ? r.value.plays : (Array.isArray(r.value.plays) ? r.value.plays.length : 0);
        } else if (r.status === 'rejected') {
          summary.errors++;
          console.log(`  ❌ Error: ${r.reason?.message}`);
          // Log the error
          if (!dryRun) {
            await logImport(pool, {
              boxScoreUrl: batch[results.indexOf(r)] || 'unknown',
              season, league, gameDate: null,
              source: 'gap-fill', jobName, lookbackDays,
              status: 'error', errorMessage: r.reason?.message,
            });
          }
        }
      }

      if (i + concurrency < missingFiles.length) {
        await sleep(delay);
      }
    }

    // Summary
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  Gap Fill Complete');
    console.log(`  Teams scraped:       ${summary.teamsScraped}`);
    console.log(`  Box scores on pages: ${summary.totalOnPages}`);
    console.log(`  Already in DB:       ${summary.alreadyInDb}`);
    console.log(`  Missing found:       ${summary.missingFound}`);
    console.log(`  Imported:            ${summary.imported}`);
    console.log(`  Player stat lines:   ${summary.totalPlayers}`);
    console.log(`  Play-by-play events: ${summary.totalPlays}`);
    if (summary.errors > 0) {
      console.log(`  Errors:              ${summary.errors}`);
    }
    console.log('═══════════════════════════════════════════════════════');

    // Post-import: mark NAIA games and refresh stats
    if (!dryRun && summary.imported > 0) {
      await markNaiaGames(season);
      await refreshTeamStats(season, league);
    }

    return summary;

  } catch (err) {
    console.error('Fatal error:', err);
    throw err;
  } finally {
    if (ownPool) {
      await pool.end();
    }
  }
}

// ─── CLI Entry Point ────────────────────────────────────────────────────────

if (require.main === module) {
  fillMissingBoxScores({
    season: CLI_SEASON,
    league: CLI_LEAGUE,
    concurrency: CLI_CONCURRENCY,
    delay: CLI_DELAY,
    dryRun: CLI_DRY_RUN,
    lookbackDays: CLI_LOOKBACK ? parseInt(CLI_LOOKBACK) : null,
    jobName: CLI_JOB_NAME,
  })
    .then((summary) => {
      if (summary.errors > 0) process.exit(1);
    })
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = {
  getTeamSlugs,
  getBoxScoreUrlsFromTeamPage,
  dateFromFilename,
  fillMissingBoxScores,
  logImport,
};
