// scripts/reconcile-tournament-flags.js
//
// Reconciles is_national_tournament flags in exp_game_box_scores against the
// official bracket(s). Safe to re-run any time; idempotent.
//
// Usage:
//   node scripts/reconcile-tournament-flags.js                 # all leagues, current season
//   node scripts/reconcile-tournament-flags.js --season 2025-26
//   node scripts/reconcile-tournament-flags.js --league womens
//   node scripts/reconcile-tournament-flags.js --dry-run
//
// The classifier (utils/tournamentClassifier.js) treats the bracket as the
// source of truth: any game in the tournament window where both teams are in
// the bracket is a national tournament game; anything else in the window is
// not, regardless of what Presto's scoreboard said.

require('dotenv').config();
const { pool, DEFAULT_SEASON } = require('../db/pool');
const { classifyNationalTournament, TOURNAMENT_WINDOWS } = require('../utils/tournamentClassifier');
const { getBracket } = require('../config/tournament-bracket-2026');

function parseArgs(argv) {
  const out = { dryRun: false, season: DEFAULT_SEASON, leagues: ['mens', 'womens'] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--season') out.season = argv[++i];
    else if (a === '--league') out.leagues = [argv[++i]];
  }
  return out;
}

async function reconcileOne(league, season, dryRun) {
  const bracket = getBracket({ league, season });
  if (!bracket) {
    console.log(`[${league} ${season}] no bracket configured — skipping`);
    return { flagged: 0, cleared: 0 };
  }
  const window = TOURNAMENT_WINDOWS[season];
  if (!window) {
    console.log(`[${league} ${season}] no tournament window configured — skipping`);
    return { flagged: 0, cleared: 0 };
  }

  // Load every game in the window (and any flagged games outside the window,
  // so we can clear stragglers if the window was previously wider).
  const r = await pool.query(
    `SELECT id, game_date, away_team_id, home_team_id,
            away_team_name, home_team_name, is_national_tournament
     FROM exp_game_box_scores
     WHERE season = $1 AND league = $2
       AND (
         (game_date BETWEEN $3 AND $4)
         OR is_national_tournament = true
       )`,
    [season, league, window.start, window.end]
  );

  const toFlag = [];
  const toClear = [];
  for (const g of r.rows) {
    const verdict = classifyNationalTournament({
      league, season,
      gameDate: g.game_date.toISOString().slice(0, 10),
      awayTeamId: g.away_team_id,
      homeTeamId: g.home_team_id,
    });
    if (verdict === true && g.is_national_tournament !== true) toFlag.push(g);
    if (verdict === false && g.is_national_tournament === true) toClear.push(g);
  }

  console.log(`\n[${league} ${season}]`);
  console.log(`  Will SET   is_national_tournament=true  on ${toFlag.length} games:`);
  for (const g of toFlag) {
    console.log(`    id=${g.id} ${g.game_date.toISOString().slice(0,10)} ${g.away_team_name} @ ${g.home_team_name}`);
  }
  console.log(`  Will CLEAR is_national_tournament=false on ${toClear.length} games:`);
  for (const g of toClear) {
    console.log(`    id=${g.id} ${g.game_date.toISOString().slice(0,10)} ${g.away_team_name} @ ${g.home_team_name}`);
  }

  if (dryRun || (toFlag.length === 0 && toClear.length === 0)) {
    return { flagged: toFlag.length, cleared: toClear.length };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (toFlag.length > 0) {
      await client.query(
        `UPDATE exp_game_box_scores SET is_national_tournament = true WHERE id = ANY($1)`,
        [toFlag.map(r => r.id)]
      );
    }
    if (toClear.length > 0) {
      await client.query(
        `UPDATE exp_game_box_scores SET is_national_tournament = false WHERE id = ANY($1)`,
        [toClear.map(r => r.id)]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return { flagged: toFlag.length, cleared: toClear.length };
}

(async () => {
  const { dryRun, season, leagues } = parseArgs(process.argv);
  console.log(`Reconciling tournament flags for season=${season} leagues=${leagues.join(',')} ${dryRun ? '(dry run)' : ''}`);

  let totalFlag = 0, totalClear = 0;
  for (const league of leagues) {
    const r = await reconcileOne(league, season, dryRun);
    totalFlag += r.flagged;
    totalClear += r.cleared;
  }

  console.log(`\nDone. +${totalFlag} flagged, -${totalClear} cleared${dryRun ? ' (dry run; no changes written)' : ''}.`);
  await pool.end();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
