/**
 * Automated Task Scheduler
 *
 * Runs inside the server process using node-cron so no extra Render services are needed.
 *
 * Schedule (all times US Eastern):
 *   - Midnight:    Scrape team URLs + conferences for the current season
 *   - Every 4h:    Refresh game data (import + analytics) — runs at 2am, 6am, 10am, 2pm, 6pm, 10pm
 *   - 3:00 AM:     Import player stats
 *   - 4:00 AM:     Box score refresh (yesterday) + future games
 *   - 5:00 AM:     Nightly gap-fill — discover missing box scores via team pages (3-day lookback)
 *   - 6:00 AM Sun: Weekly deep gap-fill — 14-day lookback for delayed team page links
 *   - Every 2h:    Intraday scoreboard check for today's finished games (4pm–midnight ET)
 *
 * Each job guards against overlapping runs and logs start/end times.
 * Errors are caught so the server keeps running regardless.
 */

const cron = require('node-cron');
const { spawn } = require('child_process');
const path = require('path');

const SEASON = process.env.SEASON || '2025-26';
const scriptDir = __dirname;

// Track running jobs to prevent overlap
const runningJobs = new Set();

// ─── Helpers ────────────────────────────────────────────────────────────────

function timestamp() {
  return new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
}

function log(msg) {
  console.log(`[scheduler ${timestamp()}] ${msg}`);
}

/**
 * Run a Node script as a child process and resolve when it exits.
 * Returns { success: boolean, code: number }
 */
function runScript(scriptName, args = []) {
  return new Promise((resolve) => {
    const scriptPath = path.join(scriptDir, scriptName);
    log(`  ▸ Starting ${scriptName} ${args.join(' ')}`);

    const child = spawn('node', [scriptPath, ...args], {
      cwd: scriptDir,
      stdio: 'inherit',
      env: process.env,
    });

    child.on('close', (code) => {
      if (code === 0) {
        log(`  ✓ ${scriptName} finished successfully`);
      } else {
        log(`  ✗ ${scriptName} exited with code ${code}`);
      }
      resolve({ success: code === 0, code });
    });

    child.on('error', (err) => {
      log(`  ✗ ${scriptName} failed to start: ${err.message}`);
      resolve({ success: false, code: -1 });
    });
  });
}

/**
 * Wrapper that prevents overlapping runs of the same jobName.
 */
async function runJob(jobName, fn) {
  if (runningJobs.has(jobName)) {
    log(`⏭ Skipping "${jobName}" — previous run still in progress`);
    return;
  }

  runningJobs.add(jobName);
  const start = Date.now();
  log(`━━━ Job "${jobName}" started ━━━`);

  try {
    await fn();
  } catch (err) {
    log(`✗ Job "${jobName}" threw an error: ${err.message}`);
  } finally {
    const elapsed = ((Date.now() - start) / 1000 / 60).toFixed(1);
    log(`━━━ Job "${jobName}" finished (${elapsed} min) ━━━\n`);
    runningJobs.delete(jobName);
  }
}

// ─── Job Definitions ────────────────────────────────────────────────────────

/**
 * Scrape team URLs + conference assignments for the season.
 * Runs once per night so we pick up any newly added teams.
 */
async function scrapeJob() {
  await runScript('scrape-team-urls.js', ['--season', SEASON]);
  await runScript('scrape-conferences.js', ['--season', SEASON]);
}

/**
 * Recalculate team analytics (RPI, SOS, QWI, etc.).
 * calculate-analytics.js fetches data from the Presto Sports API directly
 * and writes to the team_ratings table — independent of the games table.
 * Runs every few hours during the season to stay up-to-date.
 */
async function analyticsJob() {
  await runScript('calculate-analytics.js', ['--season', SEASON]);
}

/**
 * Import player statistics.
 * Runs once per night after scrape so rosters/stats are fresh.
 */
async function playersJob() {
  await runScript('import-players.js', ['--season', SEASON, '--league', 'mens']);
  await runScript('import-players.js', ['--season', SEASON, '--league', 'womens']);
}

/**
 * Box score refresh: import yesterday's completed games from Presto Sports,
 * then refresh the future games schedule.
 * Runs for both men's and women's basketball.
 */
async function boxScoreRefreshJob() {
  // Men's box scores + future games
  await runScript('experimental/import-box-scores.js', [
    '--yesterday',
    '--season', SEASON,
    '--league', 'mens',
    '--concurrency', '5',
    '--delay', '300',
  ]);
  await runScript('import-future-games.js', ['--season', SEASON, '--league', 'mens']);

  // Women's box scores + future games
  await runScript('experimental/import-box-scores.js', [
    '--yesterday',
    '--season', SEASON,
    '--league', 'womens',
    '--concurrency', '5',
    '--delay', '300',
  ]);
  await runScript('import-future-games.js', ['--season', SEASON, '--league', 'womens']);
}

/**
 * Intraday scoreboard check: import today's finished games.
 * Runs every 2 hours during game hours (4pm–midnight ET) to capture
 * newly completed games throughout the evening.
 * Uses the scoreboard (fast, lightweight).
 */
async function intradayBoxScoreJob() {
  // Men's today
  await runScript('experimental/import-box-scores.js', [
    '--today',
    '--season', SEASON,
    '--league', 'mens',
    '--concurrency', '5',
    '--delay', '300',
  ]);

  // Women's today
  await runScript('experimental/import-box-scores.js', [
    '--today',
    '--season', SEASON,
    '--league', 'womens',
    '--concurrency', '5',
    '--delay', '300',
  ]);
}

/**
 * Nightly gap-fill: scan team pages for box scores that the scoreboard
 * missed (games listed without XML links on the scoreboard).
 * Uses a 3-day lookback to catch recently-completed games.
 * Logs discoveries to box_score_import_log for visibility.
 */
async function gapFillNightlyJob() {
  // Men's gap-fill (last 3 days)
  await runScript('experimental/fill-missing-box-scores.js', [
    '--season', SEASON,
    '--league', 'mens',
    '--lookback', '3',
    '--job-name', 'gap-fill-nightly',
    '--concurrency', '5',
    '--delay', '300',
  ]);

  // Women's gap-fill (last 3 days)
  await runScript('experimental/fill-missing-box-scores.js', [
    '--season', SEASON,
    '--league', 'womens',
    '--lookback', '3',
    '--job-name', 'gap-fill-nightly',
    '--concurrency', '5',
    '--delay', '300',
  ]);
}

/**
 * Weekly deep gap-fill: broader lookback (14 days) to catch games whose
 * team page links appeared days after the game was played.
 * Only runs once per week to avoid excessive scraping.
 */
async function gapFillWeeklyJob() {
  // Men's deep scan (last 14 days)
  await runScript('experimental/fill-missing-box-scores.js', [
    '--season', SEASON,
    '--league', 'mens',
    '--lookback', '14',
    '--job-name', 'gap-fill-weekly',
    '--concurrency', '3',
    '--delay', '500',
  ]);

  // Women's deep scan (last 14 days)
  await runScript('experimental/fill-missing-box-scores.js', [
    '--season', SEASON,
    '--league', 'womens',
    '--lookback', '14',
    '--job-name', 'gap-fill-weekly',
    '--concurrency', '3',
    '--delay', '500',
  ]);
}

// ─── Schedule Registration ──────────────────────────────────────────────────

function startScheduler() {
  // The timezone option makes node-cron interpret the cron expression in US/Eastern.
  const tz = 'America/New_York';

  // ① Midnight ET — scrape team URLs & conferences
  cron.schedule('0 0 * * *', () => runJob('scrape', scrapeJob), {
    timezone: tz,
  });

  // ② Every 4 hours ET — recalculate analytics (RPI, SOS, QWI, etc.)
  //    Runs at 2am, 6am, 10am, 2pm, 6pm, 10pm
  cron.schedule('0 2,6,10,14,18,22 * * *', () => runJob('analytics', analyticsJob), {
    timezone: tz,
  });

  // ③ 3:00 AM ET — import player stats (after scrape finishes)
  cron.schedule('0 3 * * *', () => runJob('players', playersJob), {
    timezone: tz,
  });

  // ④ 4:00 AM ET — box score refresh (yesterday) + future games update
  //    Primary data source for MBB/WBB team/player stats
  cron.schedule('0 4 * * *', () => runJob('boxscore-refresh', boxScoreRefreshJob), {
    timezone: tz,
  });

  // ⑤ 5:00 AM ET — nightly gap-fill (3-day lookback)
  //    Discovers box scores missed by the scoreboard scraper by
  //    checking team game log pages. Logs discoveries to DB.
  cron.schedule('0 5 * * *', () => runJob('gap-fill-nightly', gapFillNightlyJob), {
    timezone: tz,
  });

  // ⑥ 6:00 AM ET Sundays — weekly deep gap-fill (14-day lookback)
  //    Catches games whose team page links appeared days after the game.
  cron.schedule('0 6 * * 0', () => runJob('gap-fill-weekly', gapFillWeeklyJob), {
    timezone: tz,
  });

  // ⑦ Every 2 hours 4pm–midnight ET — intraday scoreboard check
  //    Checks today's scoreboard for newly finished games so data
  //    is available within a couple hours of game completion.
  cron.schedule('0 16,18,20,22,0 * * *', () => runJob('intraday-boxscore', intradayBoxScoreJob), {
    timezone: tz,
  });

  log('Scheduler initialized');
  log('  • Scrape team URLs & conferences — daily at 12:00 AM ET');
  log('  • Recalculate analytics          — every 4 hours (2,6,10,14,18,22 ET)');
  log('  • Import player stats            — daily at 3:00 AM ET');
  log('  • Box score + future games       — daily at 4:00 AM ET');
  log('  • Gap-fill (3-day lookback)       — daily at 5:00 AM ET');
  log('  • Gap-fill deep (14-day lookback) — Sundays at 6:00 AM ET');
  log('  • Intraday scoreboard check      — every 2h (4pm–midnight ET)');
}

module.exports = { startScheduler };
