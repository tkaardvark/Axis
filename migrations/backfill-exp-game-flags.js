/**
 * Backfill: Populate is_naia_game, is_national_tournament, is_neutral
 * on exp_game_box_scores from existing data sources.
 *
 * Logic:
 *   is_naia_game:
 *     A game is NAIA if BOTH the away team AND the home team exist in
 *     the `teams` table for that season AND neither is excluded.
 *     Non-exhibition games where one side is missing from `teams` are non-NAIA.
 *     Exhibition games are always non-NAIA.
 *
 *   is_national_tournament:
 *     Postseason games on or after March 12 are national tournament.
 *     (Same logic as import-data.js)
 *
 *   is_neutral:
 *     Cross-referenced with the legacy `games` table where location = 'neutral'.
 *     For games without a legacy match, defaults to false.
 *
 * Usage:
 *   node migrations/backfill-exp-game-flags.js [--season 2025-26]
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('render.com')
    ? { rejectUnauthorized: false }
    : false,
});

const SEASON = process.argv.find((_, i, a) => a[i - 1] === '--season') || '2025-26';

async function main() {
  const client = await pool.connect();

  try {
    console.log(`Backfilling exp_game_box_scores flags for season ${SEASON}...\n`);

    // ── 1. is_naia_game ──────────────────────────────────────────────
    // A game is NAIA when BOTH teams are non-excluded entries in the teams table.
    // Exhibition games are excluded from NAIA consideration.
    console.log('1️⃣  Setting is_naia_game...');

    // First, set all to false
    await client.query(`
      UPDATE exp_game_box_scores SET is_naia_game = false WHERE season = $1
    `, [SEASON]);

    // Mark games where BOTH teams exist and are not excluded
    const naiaResult = await client.query(`
      UPDATE exp_game_box_scores e
      SET is_naia_game = true
      FROM teams t_away, teams t_home
      WHERE e.season = $1
        AND e.is_exhibition = false
        AND t_away.name = e.away_team_name AND t_away.season = $1 AND t_away.is_excluded = false
        AND t_home.name = e.home_team_name AND t_home.season = $1 AND t_home.is_excluded = false
    `, [SEASON]);
    console.log(`   Marked ${naiaResult.rowCount} games as NAIA`);

    // Verify counts
    const naiaCounts = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_naia_game = true)  as naia,
        COUNT(*) FILTER (WHERE is_naia_game = false)  as non_naia,
        COUNT(*) FILTER (WHERE is_exhibition = true)  as exhibition
      FROM exp_game_box_scores WHERE season = $1
    `, [SEASON]);
    const nc = naiaCounts.rows[0];
    console.log(`   Total: ${nc.total} | NAIA: ${nc.naia} | Non-NAIA: ${nc.non_naia} | Exhibition: ${nc.exhibition}`);

    // Cross-check against legacy games table
    const legacyNaia = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE is_naia_game = true) as naia,
        COUNT(*) FILTER (WHERE is_naia_game = false) as non_naia
      FROM games WHERE season = $1
    `, [SEASON]);
    const ln = legacyNaia.rows[0];
    console.log(`   Legacy games table: NAIA=${ln.naia}, Non-NAIA=${ln.non_naia}`);

    // ── 2. is_national_tournament ────────────────────────────────────
    console.log('\n2️⃣  Setting is_national_tournament...');

    await client.query(`
      UPDATE exp_game_box_scores
      SET is_national_tournament = (
        is_postseason = true
        AND EXTRACT(MONTH FROM game_date) = 3
        AND EXTRACT(DAY FROM game_date) >= 12
      )
      WHERE season = $1
    `, [SEASON]);

    const ntResult = await client.query(`
      SELECT COUNT(*) as cnt FROM exp_game_box_scores
      WHERE season = $1 AND is_national_tournament = true
    `, [SEASON]);
    console.log(`   Marked ${ntResult.rows[0].cnt} national tournament games`);

    // Legacy cross-check
    const legacyNT = await client.query(`
      SELECT COUNT(*) as cnt FROM games WHERE season = $1 AND is_national_tournament = true
    `, [SEASON]);
    console.log(`   Legacy games table: ${legacyNT.rows[0].cnt} national tournament games`);

    // ── 3. is_neutral ────────────────────────────────────────────────
    console.log('\n3️⃣  Setting is_neutral...');

    // Default all to false
    await client.query(`
      UPDATE exp_game_box_scores SET is_neutral = false WHERE season = $1
    `, [SEASON]);

    // Cross-reference legacy games table for neutral-site games.
    // Match on team names + game date since IDs differ between tables.
    // A game is neutral if ANY row in the games table for that matchup has location='neutral'.
    const neutralResult = await client.query(`
      UPDATE exp_game_box_scores e
      SET is_neutral = true
      WHERE e.season = $1
        AND EXISTS (
          SELECT 1 FROM games g
          JOIN teams t ON g.team_id = t.team_id AND t.season = $1
          WHERE g.season = $1
            AND g.location = 'neutral'
            AND g.game_date = e.game_date
            AND (
              (t.name = e.home_team_name)
              OR (t.name = e.away_team_name)
            )
        )
    `, [SEASON]);
    console.log(`   Marked ${neutralResult.rowCount} neutral-site games`);

    // Legacy cross-check
    const legacyNeutral = await client.query(`
      SELECT COUNT(DISTINCT game_date || opponent_id) as cnt
      FROM games WHERE season = $1 AND location = 'neutral'
    `, [SEASON]);
    console.log(`   Legacy games table: ~${legacyNeutral.rows[0].cnt} neutral-site game rows`);

    console.log('\n✅ Backfill complete!');
  } catch (err) {
    console.error('❌ Backfill failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
