/**
 * Experimental: Box Score Importer
 *
 * Main orchestrator that ties together:
 *   1. Scoreboard scraping (get box score URLs by date)
 *   2. Box score parsing (extract player stats + play-by-play)
 *   3. Database import (into exp_ tables)
 *
 * Usage:
 *   node experimental/import-box-scores.js --date 2026-02-17
 *   node experimental/import-box-scores.js --today
 *   node experimental/import-box-scores.js --yesterday
 *   node experimental/import-box-scores.js --from 2025-11-01 --to 2025-11-30
 *   node experimental/import-box-scores.js --all
 *   node experimental/import-box-scores.js --date 2026-02-17 --dry-run
 *
 * Options:
 *   --season 2025-26       Season (default: 2025-26)
 *   --league mens           League (default: mens, also: womens)
 *   --concurrency 3         Concurrent box score fetches (default: 3)
 *   --delay 500             Delay between batches in ms (default: 500)
 *   --dry-run               Parse and display, don't write to DB
 *   --today                 Import today's games
 *   --yesterday             Import yesterday's games
 */

require('dotenv').config();
const { Pool } = require('pg');
const {
  getBoxScoreUrlsForDate,
  getAllGameDates,
  filterDatesToSeason,
  filterDatesToRange,
  fetchBoxScoreHtml,
} = require('./scrape-scoreboard');
const { parseBoxScore } = require('./parse-box-score');

// Parse command line arguments
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal;
}
const hasFlag = (name) => args.includes(`--${name}`);

const SEASON = getArg('season', '2025-26');
const LEAGUE = getArg('league', 'mens');
const CONCURRENCY = parseInt(getArg('concurrency', '3'));
const DELAY = parseInt(getArg('delay', '500'));
const DRY_RUN = hasFlag('dry-run');
const TODAY = hasFlag('today');
const YESTERDAY = hasFlag('yesterday');
const SINGLE_DATE = getArg('date', null);
const FROM_DATE = getArg('from', null);
const TO_DATE = getArg('to', null);
const ALL = hasFlag('all');

/**
 * Get an ISO date string for today or yesterday in US Eastern time
 */
function getDateString(offsetDays = 0) {
  const d = new Date();
  // Approximate US Eastern: UTC-5 (close enough for date boundaries)
  d.setHours(d.getHours() - 5);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('render.com')
    ? { rejectUnauthorized: false }
    : false,
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Process box scores in batches with concurrency
 */
async function processBatch(items, batchSize, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(fn));
    results.push(...batchResults);

    if (i + batchSize < items.length) {
      await sleep(DELAY);
    }
  }
  return results;
}

/**
 * Insert a parsed box score into the database (gets its own connection from pool)
 */
async function insertBoxScore(parsed) {
  const client = await pool.connect();
  try {
    const { game, players, plays } = parsed;
    const awayTotals = game.away.totals || {};
    const homeTotals = game.home.totals || {};
    const awayTeamStats = game.away.teamStats || {};
    const homeTeamStats = game.home.teamStats || {};

  // Insert game record
  const gameResult = await client.query(`
    INSERT INTO exp_game_box_scores (
      box_score_url, season, league, game_date,
      away_team_name, away_team_id, away_team_record, away_score,
      home_team_name, home_team_id, home_team_record, home_score,
      away_period_scores, home_period_scores,
      status, num_periods, location_text, attendance,
      is_conference, is_division, is_exhibition, is_postseason,
      is_national_tournament, is_neutral,
      ties, lead_changes,
      away_fgm, away_fga, away_fg_pct, away_fgm3, away_fga3, away_fg3_pct,
      away_ftm, away_fta, away_ft_pct, away_oreb, away_dreb, away_reb,
      away_ast, away_stl, away_blk, away_to, away_pf, away_pts,
      home_fgm, home_fga, home_fg_pct, home_fgm3, home_fga3, home_fg3_pct,
      home_ftm, home_fta, home_ft_pct, home_oreb, home_dreb, home_reb,
      home_ast, home_stl, home_blk, home_to, home_pf, home_pts,
      away_points_in_paint, away_fastbreak_points, away_bench_points,
      away_second_chance_points, away_points_off_turnovers,
      away_largest_lead, away_time_of_largest_lead,
      home_points_in_paint, home_fastbreak_points, home_bench_points,
      home_second_chance_points, home_points_off_turnovers,
      home_largest_lead, home_time_of_largest_lead
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, $8,
      $9, $10, $11, $12,
      $13, $14,
      $15, $16, $17, $18,
      $19, $20, $21, $22,
      $23, $24,
      $25, $26,
      $27, $28, $29, $30, $31, $32,
      $33, $34, $35, $36, $37, $38,
      $39, $40, $41, $42, $43, $44,
      $45, $46, $47, $48, $49, $50,
      $51, $52, $53, $54, $55, $56,
      $57, $58, $59, $60, $61, $62,
      $63, $64, $65, $66, $67,
      $68, $69,
      $70, $71, $72, $73, $74,
      $75, $76
    )
    ON CONFLICT (box_score_url, season)
    DO UPDATE SET
      away_score = EXCLUDED.away_score,
      home_score = EXCLUDED.home_score,
      away_period_scores = EXCLUDED.away_period_scores,
      home_period_scores = EXCLUDED.home_period_scores,
      status = EXCLUDED.status,
      is_conference = EXCLUDED.is_conference,
      is_division = EXCLUDED.is_division,
      is_exhibition = EXCLUDED.is_exhibition,
      is_postseason = EXCLUDED.is_postseason,
      is_national_tournament = EXCLUDED.is_national_tournament,
      is_neutral = EXCLUDED.is_neutral,
      ties = EXCLUDED.ties,
      lead_changes = EXCLUDED.lead_changes,
      away_points_in_paint = EXCLUDED.away_points_in_paint,
      away_fastbreak_points = EXCLUDED.away_fastbreak_points,
      away_bench_points = EXCLUDED.away_bench_points,
      away_second_chance_points = EXCLUDED.away_second_chance_points,
      away_points_off_turnovers = EXCLUDED.away_points_off_turnovers,
      away_largest_lead = EXCLUDED.away_largest_lead,
      away_time_of_largest_lead = EXCLUDED.away_time_of_largest_lead,
      home_points_in_paint = EXCLUDED.home_points_in_paint,
      home_fastbreak_points = EXCLUDED.home_fastbreak_points,
      home_bench_points = EXCLUDED.home_bench_points,
      home_second_chance_points = EXCLUDED.home_second_chance_points,
      home_points_off_turnovers = EXCLUDED.home_points_off_turnovers,
      home_largest_lead = EXCLUDED.home_largest_lead,
      home_time_of_largest_lead = EXCLUDED.home_time_of_largest_lead,
      updated_at = NOW()
    RETURNING id
  `, [
    game.boxScoreUrl, game.season, game.league, game.gameDate,
    game.away.name, game.away.id, game.away.record, game.away.score,
    game.home.name, game.home.id, game.home.record, game.home.score,
    JSON.stringify(game.away.periodScores), JSON.stringify(game.home.periodScores),
    game.status, game.numPeriods, game.locationText, game.attendance,
    game.isConference || false, game.isDivision || false, game.isExhibition || false, game.isPostseason || false,
    game.isNationalTournament || false, game.isNeutral || false,
    game.ties, game.leadChanges,
    awayTotals.fgm, awayTotals.fga, awayTotals.fg_pct, awayTotals.fgm3, awayTotals.fga3, awayTotals.fg3_pct,
    awayTotals.ftm, awayTotals.fta, awayTotals.ft_pct, awayTotals.oreb, awayTotals.dreb, awayTotals.reb,
    awayTotals.ast, awayTotals.stl, awayTotals.blk, awayTotals.to, awayTotals.pf, awayTotals.pts,
    homeTotals.fgm, homeTotals.fga, homeTotals.fg_pct, homeTotals.fgm3, homeTotals.fga3, homeTotals.fg3_pct,
    homeTotals.ftm, homeTotals.fta, homeTotals.ft_pct, homeTotals.oreb, homeTotals.dreb, homeTotals.reb,
    homeTotals.ast, homeTotals.stl, homeTotals.blk, homeTotals.to, homeTotals.pf, homeTotals.pts,
    awayTeamStats.pointsInPaint, awayTeamStats.fastbreakPoints, awayTeamStats.benchPoints,
    awayTeamStats.secondChancePoints, awayTeamStats.pointsOffTurnovers,
    awayTeamStats.largestLead, awayTeamStats.timeOfLargestLead,
    homeTeamStats.pointsInPaint, homeTeamStats.fastbreakPoints, homeTeamStats.benchPoints,
    homeTeamStats.secondChancePoints, homeTeamStats.pointsOffTurnovers,
    homeTeamStats.largestLead, homeTeamStats.timeOfLargestLead,
  ]);

  const gameId = gameResult.rows[0].id;

  // Delete existing player stats and PBP for this game (for re-import)
  await client.query('DELETE FROM exp_player_game_stats WHERE game_box_score_id = $1', [gameId]);
  await client.query('DELETE FROM exp_play_by_play WHERE game_box_score_id = $1', [gameId]);

  // Insert player stats
  for (const player of players) {
    await client.query(`
      INSERT INTO exp_player_game_stats (
        game_box_score_id, box_score_url, season,
        player_name, player_url, player_id, uniform_number,
        team_name, team_id, is_home, is_starter,
        minutes, fgm, fga, fgm3, fga3, ftm, fta,
        oreb, dreb, reb, ast, stl, blk, turnovers, pf, pts
      ) VALUES (
        $1, $2, $3,
        $4, $5, $6, $7,
        $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24, $25, $26, $27
      )
      ON CONFLICT (box_score_url, player_id, season) DO UPDATE SET
        minutes = EXCLUDED.minutes, fgm = EXCLUDED.fgm, fga = EXCLUDED.fga,
        pts = EXCLUDED.pts
    `, [
      gameId, game.boxScoreUrl, game.season,
      player.playerName, player.playerUrl, player.playerId, player.uniformNumber,
      player.teamName, player.teamId, player.isHome, player.isStarter,
      player.minutes, player.fgm, player.fga, player.fgm3, player.fga3, player.ftm, player.fta,
      player.oreb, player.dreb, player.reb, player.ast, player.stl, player.blk,
      player.turnovers, player.pf, player.pts,
    ]);
  }

  // Insert play-by-play (batch insert for performance)
  if (plays.length > 0) {
    const pbpValues = [];
    const pbpParams = [];
    let paramIdx = 1;

    for (const play of plays) {
      pbpValues.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
      pbpParams.push(
        gameId, game.boxScoreUrl, game.season,
        play.period, play.gameClock, play.sequenceNumber,
        play.teamName, play.isHome, play.playerName,
        play.actionText, play.actionType, play.isScoringPlay,
        play.awayScore,
      );
      // homeScore handled separately due to parameter limit
    }

    // Simplified: insert PBP row by row for reliability (batch for perf later)
    for (const play of plays) {
      await client.query(`
        INSERT INTO exp_play_by_play (
          game_box_score_id, box_score_url, season,
          period, game_clock, sequence_number,
          team_name, team_id, is_home, player_name,
          action_text, action_type, is_scoring_play,
          away_score, home_score
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `, [
        gameId, game.boxScoreUrl, game.season,
        play.period, play.gameClock, play.sequenceNumber,
        play.teamName, null, play.isHome, play.playerName,
        play.actionText, play.actionType, play.isScoringPlay,
        play.awayScore, play.homeScore,
      ]);
    }
  }

  return { gameId, players: players.length, plays: plays.length };
  } finally {
    client.release();
  }
}

/**
 * Process a single box score URL with game metadata from the scoreboard
 *
 * @param {object} gameMeta - Metadata from getBoxScoreUrlsForDate()
 * @param {string} gameDate - ISO date string
 */
async function processBoxScore(gameMeta, gameDate) {
  const { boxScoreUrl } = gameMeta;
  try {
    const html = await fetchBoxScoreHtml(boxScoreUrl);
    const season = gameMeta.season || SEASON;
    const parsed = parseBoxScore(html, boxScoreUrl, season, LEAGUE, gameDate);

    if (!parsed.game.away.name || !parsed.game.home.name) {
      console.log(`  ⚠️  Skipping ${boxScoreUrl} — couldn't parse team names`);
      return null;
    }

    // Attach game type flags from scoreboard metadata
    parsed.game.isConference = gameMeta.isConference || false;
    parsed.game.isDivision = gameMeta.isDivision || false;
    parsed.game.isExhibition = gameMeta.isExhibition || false;
    parsed.game.isPostseason = gameMeta.isPostseason || false;

    // Derive is_national_tournament: postseason games on or after March 12
    // (same logic as import-data.js — national tournament starts mid-March)
    const gd = new Date(gameDate + 'T00:00:00Z');
    parsed.game.isNationalTournament = parsed.game.isPostseason
      && gd.getUTCMonth() === 2 && gd.getUTCDate() >= 12;

    // is_neutral defaults to false — we don't have neutral-site info from the scoreboard.
    // The post-import markNaiaGames step handles is_neutral via games table cross-ref.
    parsed.game.isNeutral = false;

    // Build flags label for display
    const flags = [];
    if (parsed.game.isExhibition) flags.push('EXH');
    if (parsed.game.isConference) flags.push('CONF');
    if (parsed.game.isDivision) flags.push('DIV');
    if (parsed.game.isPostseason) flags.push('POST');
    const flagStr = flags.length > 0 ? ` [${flags.join(',')}]` : '';

    if (DRY_RUN) {
      console.log(`  📋 ${parsed.game.away.name} ${parsed.game.away.score} @ ${parsed.game.home.name} ${parsed.game.home.score}${flagStr}`);
      console.log(`     Players: ${parsed.players.length} | Plays: ${parsed.plays.length}`);
      if (parsed.plays.length > 0) {
        const scoringPlays = parsed.plays.filter(p => p.isScoringPlay);
        console.log(`     Scoring plays: ${scoringPlays.length}`);
      }
      return parsed;
    }

    const result = await insertBoxScore(parsed);
    console.log(`  ✅ ${parsed.game.away.name} ${parsed.game.away.score} @ ${parsed.game.home.name} ${parsed.game.home.score}${flagStr} (${result.players} players, ${result.plays} plays)`);
    return result;
  } catch (err) {
    console.error(`  ❌ Error processing ${boxScoreUrl}: ${err.message}`);
    return null;
  }
}

/**
 * Post-import: mark is_naia_game on all exp_game_box_scores for a season.
 * A game is NAIA when both teams exist in the `teams` table and are not excluded.
 * Also marks is_neutral by cross-referencing the legacy `games` table.
 */
async function markNaiaGames(season) {
  console.log('\n🏀 Marking NAIA games & neutral sites...');
  const client = await pool.connect();
  try {
    // Reset to false first
    await client.query(`
      UPDATE exp_game_box_scores SET is_naia_game = false WHERE season = $1
    `, [season]);

    // Mark NAIA: both teams exist in teams table and neither is excluded
    const naiaResult = await client.query(`
      UPDATE exp_game_box_scores e
      SET is_naia_game = true
      FROM teams t_away, teams t_home
      WHERE e.season = $1
        AND e.is_exhibition = false
        AND t_away.team_id = e.away_team_id AND t_away.season = $1 AND t_away.is_excluded = false
        AND t_home.team_id = e.home_team_id AND t_home.season = $1 AND t_home.is_excluded = false
    `, [season]);

    // Mark neutral sites from legacy games table (while it still exists)
    const neutralResult = await client.query(`
      UPDATE exp_game_box_scores e
      SET is_neutral = true
      WHERE e.season = $1
        AND e.is_neutral = false
        AND EXISTS (
          SELECT 1 FROM games g
          JOIN teams t ON g.team_id = t.team_id AND t.season = $1
          WHERE g.season = $1
            AND g.location = 'neutral'
            AND g.game_date = e.game_date
            AND (t.name = e.home_team_name OR t.name = e.away_team_name)
        )
    `, [season]);

    console.log(`   NAIA games: ${naiaResult.rowCount}`);
    console.log(`   Neutral sites: ${neutralResult.rowCount}`);
  } finally {
    client.release();
  }
}

/**
 * Main entry point
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Experimental Box Score Importer');
  console.log(`  Season: ${SEASON} | League: ${LEAGUE}`);
  if (DRY_RUN) console.log('  🔍 DRY RUN — no database writes');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Determine which dates to process
    let datesToProcess = [];

    if (SINGLE_DATE) {
      datesToProcess = [SINGLE_DATE];
      console.log(`Processing single date: ${SINGLE_DATE}\n`);
    } else if (TODAY) {
      const todayStr = getDateString(0);
      datesToProcess = [todayStr];
      console.log(`Processing today: ${todayStr}\n`);
    } else if (YESTERDAY) {
      const yesterdayStr = getDateString(-1);
      datesToProcess = [yesterdayStr];
      console.log(`Processing yesterday: ${yesterdayStr}\n`);
    } else {
      console.log('Fetching all game dates from scoreboard...');
      const allDates = await getAllGameDates(LEAGUE);
      console.log(`Found ${allDates.length} total dates in scoreboard\n`);

      if (ALL) {
        datesToProcess = filterDatesToSeason(allDates, SEASON);
        console.log(`Filtered to ${datesToProcess.length} dates for season ${SEASON}\n`);
      } else if (FROM_DATE || TO_DATE) {
        datesToProcess = filterDatesToRange(allDates, FROM_DATE, TO_DATE);
        console.log(`Filtered to ${datesToProcess.length} dates (${FROM_DATE || 'start'} to ${TO_DATE || 'end'})\n`);
      } else {
        console.log('No date specified. Use --date, --today, --yesterday, --from/--to, or --all');
        process.exit(1);
      }
    }

    // Stats tracking
    let totalGames = 0;
    let totalPlayers = 0;
    let totalPlays = 0;
    let totalErrors = 0;

    // Process each date
    for (const date of datesToProcess) {
      console.log(`📅 ${date}`);

      const boxScores = await getBoxScoreUrlsForDate(date, LEAGUE);

      if (boxScores.length === 0) {
        console.log('   No games found\n');
        continue;
      }

      console.log(`   Found ${boxScores.length} games`);

      // Process box scores with concurrency
      const results = await processBatch(boxScores, CONCURRENCY, async (game) => {
        return processBoxScore(game, date);
      });

      // Tally results
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          totalGames++;
          if (DRY_RUN) {
            // In dry-run, processBoxScore returns the parsed object
            if (r.value.players) totalPlayers += Array.isArray(r.value.players) ? r.value.players.length : r.value.players;
            if (r.value.plays) totalPlays += Array.isArray(r.value.plays) ? r.value.plays.length : r.value.plays;
          } else {
            // In real mode, insertBoxScore returns { gameId, players: count, plays: count }
            if (r.value.players) totalPlayers += r.value.players;
            if (r.value.plays) totalPlays += r.value.plays;
          }
        } else if (r.status === 'rejected') {
          totalErrors++;
        }
      }

      console.log('');
      await sleep(DELAY);
    }

    // Summary
    console.log('═══════════════════════════════════════════════════════');
    console.log('  Import Complete');
    console.log(`  Games processed:     ${totalGames}`);
    console.log(`  Player stat lines:   ${totalPlayers}`);
    console.log(`  Play-by-play events: ${totalPlays}`);
    if (totalErrors > 0) {
      console.log(`  Errors:              ${totalErrors}`);
    }
    console.log('═══════════════════════════════════════════════════════');

    // Post-import: mark NAIA games and neutral sites
    if (!DRY_RUN && totalGames > 0) {
      await markNaiaGames(SEASON);
    }

  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
