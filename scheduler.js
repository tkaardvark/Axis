/**
 * Automated Task Scheduler
 *
 * Runs inside the server process using node-cron so no extra Render services are needed.
 *
 * Schedule (all times US Eastern):
 *   - Midnight:  Scrape team URLs + conferences for the current season
 *   - Every 4h:  Refresh game data (import + analytics) — runs at 2am, 6am, 10am, 2pm, 6pm, 10pm
 *   - 3:00 AM:   Import player stats
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

  // ④ 4:00 AM ET — box score refresh + future games update
  //    Primary data source for MBB 2025-26 team/player stats
  cron.schedule('0 4 * * *', () => runJob('boxscore-refresh', boxScoreRefreshJob), {
    timezone: tz,
  });

  log('Scheduler initialized');
  log('  • Scrape team URLs & conferences — daily at 12:00 AM ET');
  log('  • Recalculate analytics          — every 4 hours (2,6,10,14,18,22 ET)');
  log('  • Import player stats            — daily at 3:00 AM ET');
  log('  • Box score + future games       — daily at 4:00 AM ET');
}

module.exports = { startScheduler };
