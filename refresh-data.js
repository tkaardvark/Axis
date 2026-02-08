#!/usr/bin/env node
/**
 * Full Data Refresh Script
 * 
 * Runs the complete pipeline: scrape → import → conferences → analytics → players.
 * Use this for manual one-off refreshes. Automated scheduling is handled by
 * scheduler.js inside the server process.
 * 
 * Usage: node refresh-data.js [--season 2024-25]
 */

const { spawn } = require('child_process');
const path = require('path');

// Parse --season argument (default: 2025-26)
const args = process.argv.slice(2);
const seasonIdx = args.indexOf('--season');
const SEASON = seasonIdx !== -1 && args[seasonIdx + 1] ? args[seasonIdx + 1] : '2025-26';

const scriptDir = __dirname;

function runScript(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Starting: ${scriptName} ${args.join(' ')}`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log('='.repeat(60) + '\n');

    const scriptPath = path.join(scriptDir, scriptName);
    const child = spawn('node', [scriptPath, ...args], {
      cwd: scriptDir,
      stdio: 'inherit',
      env: process.env
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`\n✓ ${scriptName} completed successfully\n`);
        resolve();
      } else {
        reject(new Error(`${scriptName} exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to start ${scriptName}: ${err.message}`));
    });
  });
}

async function main() {
  const startTime = Date.now();
  console.log('\n' + '='.repeat(60));
  console.log('NAIA Full Data Refresh - Starting');
  console.log(`Season: ${SEASON}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  try {
    // Step 1: Scrape team URLs
    await runScript('scrape-team-urls.js', ['--season', SEASON]);

    // Step 2: Import fresh game data
    await runScript('import-data.js', ['--season', SEASON]);

    // Step 3: Scrape conference assignments
    await runScript('scrape-conferences.js', ['--season', SEASON]);

    // Step 4: Calculate analytics
    await runScript('calculate-analytics.js', ['--season', SEASON]);

    // Step 5: Import player stats
    await runScript('import-players.js', ['--season', SEASON, '--league', 'mens']);

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log('\n' + '='.repeat(60));
    console.log('NAIA Full Data Refresh - COMPLETE');
    console.log(`Total time: ${elapsed} minutes`);
    console.log(`Finished: ${new Date().toISOString()}`);
    console.log('='.repeat(60) + '\n');

    process.exit(0);
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('NAIA Full Data Refresh - FAILED');
    console.error(`Error: ${error.message}`);
    console.error(`Time: ${new Date().toISOString()}`);
    console.error('='.repeat(60) + '\n');

    process.exit(1);
  }
}

main();
