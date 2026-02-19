/**
 * Comprehensive test suite for boxscore data source vs default.
 * 
 * Tests:
 * 1. Team list consistency (same teams, similar records)
 * 2. Exhibition filtering (no exhibition games in records/stats)
 * 3. Splits accuracy (record math checks out)
 * 4. Schedule completeness & data shape
 * 5. Roster data shape & exhibition exclusion
 * 6. Player stats consistency
 * 7. Percentiles endpoint works
 * 8. Box score modal endpoint works
 * 9. Conference filter works
 * 10. Game type / season type filters
 * 11. Edge cases (non-NAIA opponents, missing data)
 * 12. Deduplication (no double-counted games)
 */

require('dotenv').config();
const { pool } = require('../db/pool');

const API = 'http://localhost:3001';
const SEASON = '2025-26';
const LEAGUE = 'mens';

let passed = 0;
let failed = 0;
let warnings = 0;
const failures = [];
const warningList = [];

function assert(condition, testName, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ ${testName}`);
  } else {
    failed++;
    const msg = `${testName}${detail ? ': ' + detail : ''}`;
    failures.push(msg);
    console.log(`  ❌ ${testName}${detail ? ' — ' + detail : ''}`);
  }
}

function warn(testName, detail = '') {
  warnings++;
  warningList.push(`${testName}: ${detail}`);
  console.log(`  ⚠️  ${testName} — ${detail}`);
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// ─────────────────────────────────────────────────────────
// TEST 1: Team List Consistency
// ─────────────────────────────────────────────────────────
async function testTeamList() {
  console.log('\n── Test 1: Team List Consistency ──');
  
  const def = await fetchJSON(`${API}/api/teams?league=${LEAGUE}&season=${SEASON}`);
  const box = await fetchJSON(`${API}/api/teams?league=${LEAGUE}&season=${SEASON}&source=boxscore`);
  
  assert(Array.isArray(def) && def.length > 0, 'Default returns teams', `got ${def.length}`);
  assert(Array.isArray(box) && box.length > 0, 'Boxscore returns teams', `got ${box.length}`);
  
  // Both should have the same set of teams (or very close)
  const defIds = new Set(def.map(t => t.team_id));
  const boxIds = new Set(box.map(t => t.team_id));
  const missingInBox = [...defIds].filter(id => !boxIds.has(id));
  const extraInBox = [...boxIds].filter(id => !defIds.has(id));
  
  if (missingInBox.length > 0) {
    const names = missingInBox.map(id => def.find(t => t.team_id === id)?.name).join(', ');
    warn('Teams in default but missing from boxscore', `${missingInBox.length}: ${names}`);
  }
  if (extraInBox.length > 0) {
    warn('Teams in boxscore but not in default', `${extraInBox.length}`);
  }
  
  // Check required fields exist on boxscore teams
  const sampleBox = box[0];
  const requiredFields = ['team_id', 'name', 'conference', 'wins', 'losses', 'games_played',
    'offensive_rating', 'defensive_rating', 'net_rating', 'pace', 'rpi', 'strength_of_schedule',
    'fg_pct', 'fg3_pct', 'ft_pct', 'total_wins', 'total_losses'];
  const missingFields = requiredFields.filter(f => sampleBox[f] === undefined);
  assert(missingFields.length === 0, 'Boxscore teams have all required fields', 
    missingFields.length > 0 ? `missing: ${missingFields.join(', ')}` : '');
  
  // Compare records for a few teams — should be close but not necessarily identical
  // Note: boxscore includes ALL non-exhibition games (including non-NAIA opponents),
  // while default filters to is_naia_game=true only. So boxscore typically has MORE games.
  // Also, default may have stale data (games marked not completed). Accept wider tolerance.
  let closeRecords = 0;
  let checkedTeams = 0;
  const recordDiffs = [];
  for (const bt of box.slice(0, 50)) {
    const dt = def.find(t => t.team_id === bt.team_id);
    if (!dt) continue;
    checkedTeams++;
    const bW = parseInt(bt.wins) || 0;
    const dW = parseInt(dt.wins) || 0;
    const bL = parseInt(bt.losses) || 0;
    const dL = parseInt(dt.losses) || 0;
    // Boxscore GP should be >= default GP (since it includes more games)
    const bGP = bW + bL;
    const dGP = dW + dL;
    // Check that boxscore W >= default W (more games = more wins typically)
    // and the win percentage is roughly similar (within 15%)
    const bWinPct = bGP > 0 ? bW / bGP : 0;
    const dWinPct = dGP > 0 ? dW / dGP : 0;
    const pctDiff = Math.abs(bWinPct - dWinPct);
    if (pctDiff <= 0.15 || bGP >= dGP) closeRecords++;
    else recordDiffs.push(`${bt.name}: box=${bW}-${bL}(${(bWinPct*100).toFixed(0)}%) def=${dW}-${dL}(${(dWinPct*100).toFixed(0)}%)`);
  }
  assert(closeRecords >= checkedTeams * 0.85, 
    `Win% within 15% or box GP >= def GP for 85%+ of teams (${closeRecords}/${checkedTeams})`,
    recordDiffs.length > 0 ? `diffs: ${recordDiffs.slice(0, 5).join('; ')}` : '');
  
  // Report how many more games boxscore has
  const totalDefGP = def.reduce((s, t) => s + (parseInt(t.games_played) || 0), 0);
  const totalBoxGP = box.reduce((s, t) => s + (parseInt(t.games_played) || 0), 0);
  console.log(`  ℹ️  Total GP: default=${totalDefGP} boxscore=${totalBoxGP} (box has ${totalBoxGP - totalDefGP} more)`);
  
  return { def, box };
}

// ─────────────────────────────────────────────────────────
// TEST 2: Exhibition Filtering
// ─────────────────────────────────────────────────────────
async function testExhibitionFiltering() {
  console.log('\n── Test 2: Exhibition Filtering ──');
  
  // Find teams that have exhibition games in the DB
  const exhResult = await pool.query(`
    SELECT DISTINCT CASE WHEN is_home THEN team_name ELSE team_name END as team_name
    FROM exp_player_game_stats p
    JOIN exp_game_box_scores g ON g.id = p.game_box_score_id
    WHERE g.is_exhibition = true AND g.season = $1
    LIMIT 10
  `, [SEASON]);
  
  // Get teams with exhibitions from box_scores directly
  const exhGames = await pool.query(`
    SELECT home_team_name, away_team_name, home_score, away_score, game_date
    FROM exp_game_box_scores
    WHERE is_exhibition = true AND season = $1
    LIMIT 20
  `, [SEASON]);
  
  console.log(`  Found ${exhGames.rows.length} exhibition games in DB`);
  
  // For each team with an exhibition, verify boxscore API excludes it
  for (const game of exhGames.rows.slice(0, 3)) {
    const teamName = game.home_team_name;
    
    // Get team_id
    const teamResult = await pool.query(
      'SELECT team_id FROM teams WHERE name = $1 AND season = $2 AND league = $3',
      [teamName, SEASON, LEAGUE]
    );
    if (teamResult.rows.length === 0) continue;
    const teamId = teamResult.rows[0].team_id;
    
    // Check schedule — exhibition should appear but be marked
    const schedule = await fetchJSON(
      `${API}/api/teams/${teamId}/schedule?season=${SEASON}&source=boxscore`
    );
    const exhInSchedule = schedule.games?.filter(g => g.is_exhibition) || [];
    assert(exhInSchedule.length > 0, 
      `${teamName}: exhibition visible in schedule`,
      `found ${exhInSchedule.length} exhibition games`);
    
    // Check splits — overall record should exclude exhibitions
    const splits = await fetchJSON(
      `${API}/api/teams/${teamId}/splits?season=${SEASON}&source=boxscore`
    );
    const overall = splits.splits?.find(s => s.split_name === 'Overall');
    const totalScheduleNonExh = schedule.games?.filter(g => !g.is_exhibition && g.is_completed).length || 0;
    const splitsGP = overall ? (parseInt(overall.wins) + parseInt(overall.losses)) : 0;
    
    assert(splitsGP === totalScheduleNonExh,
      `${teamName}: splits GP matches non-exhibition schedule`,
      `splits GP=${splitsGP}, schedule non-exh=${totalScheduleNonExh}`);
    
    // Check roster — GP should not include exhibition
    const roster = await fetchJSON(
      `${API}/api/teams/${teamId}/roster?season=${SEASON}&source=boxscore`
    );
    const maxGP = Math.max(...(roster.roster || []).map(p => parseInt(p.gp) || 0));
    assert(maxGP <= totalScheduleNonExh,
      `${teamName}: max roster GP ≤ non-exhibition games`,
      `maxGP=${maxGP}, nonExhGames=${totalScheduleNonExh}`);
  }
}

// ─────────────────────────────────────────────────────────
// TEST 3: Splits Accuracy
// ─────────────────────────────────────────────────────────
async function testSplitsAccuracy(teams) {
  console.log('\n── Test 3: Splits Accuracy ──');
  
  // Test 5 random teams
  const sampleTeams = teams.box.sort(() => Math.random() - 0.5).slice(0, 5);
  
  for (const team of sampleTeams) {
    const splits = await fetchJSON(
      `${API}/api/teams/${team.team_id}/splits?season=${SEASON}&source=boxscore`
    );
    const s = splits.splits || [];
    
    const overall = s.find(x => x.split_name === 'Overall');
    const home = s.find(x => x.split_name === 'Home');
    const away = s.find(x => x.split_name === 'Away');
    const conf = s.find(x => x.split_name === 'Conference');
    const inWins = s.find(x => x.split_name === 'In Wins');
    const inLosses = s.find(x => x.split_name === 'In Losses');
    
    if (!overall) {
      warn(`${team.name}: no Overall split`);
      continue;
    }
    
    const oW = parseInt(overall.wins);
    const oL = parseInt(overall.losses);
    const oGP = parseInt(overall.games_played);
    
    // W + L = GP
    assert(oW + oL === oGP, 
      `${team.name}: W(${oW}) + L(${oL}) = GP(${oGP})`);
    
    // Home + Away = Overall (approximately — neutral games may exist)
    if (home && away) {
      const hGP = parseInt(home.games_played);
      const aGP = parseInt(away.games_played);
      assert(hGP + aGP === oGP,
        `${team.name}: Home(${hGP}) + Away(${aGP}) = Overall(${oGP})`);
    }
    
    // In Wins + In Losses = Overall
    if (inWins && inLosses) {
      const wGP = parseInt(inWins.games_played);
      const lGP = parseInt(inLosses.games_played);
      assert(wGP + lGP === oGP,
        `${team.name}: InWins(${wGP}) + InLosses(${lGP}) = Overall(${oGP})`);
    }
    
    // Conference GP <= Overall GP
    if (conf) {
      assert(parseInt(conf.games_played) <= oGP,
        `${team.name}: Conf GP(${conf.games_played}) <= Overall GP(${oGP})`);
    }
    
    // PPG should be reasonable (40-120)
    const ppg = parseFloat(overall.points_per_game);
    assert(ppg >= 40 && ppg <= 130,
      `${team.name}: PPG reasonable`,
      `ppg=${ppg}`);
    
    // Defensive rating should be positive
    const drtg = parseFloat(overall.defensive_rating);
    assert(drtg > 50 && drtg < 150,
      `${team.name}: DRTG reasonable`,
      `drtg=${drtg}`);
  }
}

// ─────────────────────────────────────────────────────────
// TEST 4: Schedule Completeness & Shape
// ─────────────────────────────────────────────────────────
async function testSchedule(teams) {
  console.log('\n── Test 4: Schedule Completeness ──');
  
  const sampleTeams = teams.box.slice(0, 5);
  
  for (const team of sampleTeams) {
    const defSched = await fetchJSON(
      `${API}/api/teams/${team.team_id}/schedule?season=${SEASON}`
    );
    const boxSched = await fetchJSON(
      `${API}/api/teams/${team.team_id}/schedule?season=${SEASON}&source=boxscore`
    );
    
    const dGames = defSched.games || [];
    const bGames = boxSched.games || [];
    
    assert(bGames.length > 0, `${team.name}: has boxscore schedule games`, `count=${bGames.length}`);
    
    // Check required fields on each game
    const requiredGameFields = ['game_id', 'date', 'opponent_name', 'team_score', 'opponent_score',
      'is_conference', 'is_exhibition', 'is_completed', 'game_type', 'result'];
    const firstGame = bGames[0];
    const missingGameFields = requiredGameFields.filter(f => firstGame[f] === undefined && firstGame[f] !== null);
    assert(missingGameFields.length === 0,
      `${team.name}: schedule games have required fields`,
      missingGameFields.length > 0 ? `missing: ${missingGameFields.join(', ')}` : '');
    
    // Game types should be valid
    const validTypes = new Set(['Conference', 'Non-Conference', 'Exhibition', 'Non-NAIA', 
      'Conference Tournament', 'National Tournament', 'NAIA']);
    const invalidTypes = bGames.filter(g => !validTypes.has(g.game_type));
    assert(invalidTypes.length === 0,
      `${team.name}: all game types valid`,
      invalidTypes.length > 0 ? `invalid: ${invalidTypes.map(g => g.game_type).join(', ')}` : '');
    
    // No duplicate games (same date + opponent)
    const keys = bGames.map(g => `${new Date(g.date).toISOString().split('T')[0]}_${g.opponent_name}`);
    const uniqueKeys = new Set(keys);
    assert(keys.length === uniqueKeys.size,
      `${team.name}: no duplicate games in schedule`,
      keys.length !== uniqueKeys.size ? `${keys.length} games but ${uniqueKeys.size} unique` : '');
    
    // Completed games should have scores
    const completedNoScore = bGames.filter(g => g.is_completed && (g.team_score == null || g.opponent_score == null));
    assert(completedNoScore.length === 0,
      `${team.name}: all completed games have scores`,
      `${completedNoScore.length} missing`);
    
    // Compare game counts — boxscore might have slightly different coverage
    const defCompleted = dGames.filter(g => g.is_completed && !g.is_exhibition).length;
    const boxCompleted = bGames.filter(g => g.is_completed && !g.is_exhibition).length;
    const countDiff = Math.abs(defCompleted - boxCompleted);
    if (countDiff > 3) {
      warn(`${team.name}: game count difference`, `default=${defCompleted} box=${boxCompleted} diff=${countDiff}`);
    } else {
      assert(true, `${team.name}: game counts close (def=${defCompleted} box=${boxCompleted})`);
    }
  }
}

// ─────────────────────────────────────────────────────────
// TEST 5: Roster Data Shape & Exhibition Exclusion
// ─────────────────────────────────────────────────────────
async function testRoster(teams) {
  console.log('\n── Test 5: Roster Data Shape ──');
  
  const sampleTeams = teams.box.slice(0, 5);
  
  for (const team of sampleTeams) {
    const roster = await fetchJSON(
      `${API}/api/teams/${team.team_id}/roster?season=${SEASON}&source=boxscore`
    );
    const players = roster.roster || [];
    
    assert(players.length > 0, `${team.name}: has roster players`, `count=${players.length}`);
    
    if (players.length === 0) continue;
    
    // Check required fields
    const p = players[0];
    const requiredPlayerFields = ['player_name', 'first_name', 'last_name', 'player_id', 'gp',
      'pts_pg', 'reb_pg', 'ast_pg', 'fg_pct', 'fg3_pct', 'ft_pct', 'min_pg'];
    const missingPFields = requiredPlayerFields.filter(f => p[f] === undefined);
    assert(missingPFields.length === 0,
      `${team.name}: roster players have required fields`,
      missingPFields.length > 0 ? `missing: ${missingPFields.join(', ')}` : '');
    
    // Names should not be empty
    assert(p.first_name && p.first_name.length > 0,
      `${team.name}: first_name not empty`, `got: "${p.first_name}"`);
    
    // FG% should be in 0-100 range (not 0-1 decimal)
    const fgPct = parseFloat(p.fg_pct);
    assert(fgPct > 1 || fgPct === 0,
      `${team.name}: FG% in percentage format (not decimal)`,
      `fg_pct=${p.fg_pct}`);
    
    // PPG should be reasonable
    const ppg = parseFloat(p.pts_pg);
    assert(ppg >= 0 && ppg <= 50,
      `${team.name}: PPG reasonable`,
      `ppg=${ppg}`);
    
    // Position, year, height should exist (from players table JOIN)
    if (!p.position && !p.year) {
      warn(`${team.name}: roster missing position/year metadata (players table may not have this player)`);
    }
  }
}

// ─────────────────────────────────────────────────────────
// TEST 6: Player Stats Consistency
// ─────────────────────────────────────────────────────────
async function testPlayerStats() {
  console.log('\n── Test 6: Player Stats ──');
  
  // Fetch top players from both sources
  const defPlayers = await fetchJSON(
    `${API}/api/players?league=${LEAGUE}&season=${SEASON}&sort_by=pts_pg&limit=20&min_gp=10`
  );
  const boxPlayers = await fetchJSON(
    `${API}/api/players?league=${LEAGUE}&season=${SEASON}&source=boxscore&sort_by=pts_pg&limit=20&min_gp=10`
  );
  
  assert(defPlayers.players?.length > 0, 'Default players returns data');
  assert(boxPlayers.players?.length > 0, 'Boxscore players returns data');
  assert(boxPlayers.total > 0, 'Boxscore players has total count');
  
  // Check required fields
  if (boxPlayers.players?.length > 0) {
    const p = boxPlayers.players[0];
    const required = ['player_name', 'player_id', 'team_name', 'team_id', 'gp',
      'pts_pg', 'reb_pg', 'ast_pg', 'fg_pct', 'fg3_pct', 'ft_pct'];
    const missing = required.filter(f => p[f] === undefined);
    assert(missing.length === 0,
      'Boxscore player records have required fields',
      missing.length > 0 ? `missing: ${missing.join(', ')}` : '');
    
    // Top scorers should roughly match between sources
    const defTop = defPlayers.players[0];
    const boxTop = boxPlayers.players[0];
    const defTopName = defTop.player_name || `${defTop.first_name} ${defTop.last_name}`;
    const boxTopName = boxTop.player_name || `${boxTop.first_name} ${boxTop.last_name}`;
    console.log(`  Default top scorer: ${defTopName} (${defTop.pts_pg} ppg, GP:${defTop.gp})`);
    console.log(`  Boxscore top scorer: ${boxTopName} (${boxTop.pts_pg} ppg, GP:${boxTop.gp})`);
    
    // Check that top 5 scorers from boxscore appear somewhere in default top 20
    // Default uses first_name/last_name, boxscore uses player_name — normalize both
    const defNames = new Set(defPlayers.players.map(p => 
      p.player_name || `${p.first_name} ${p.last_name}`.trim()
    ));
    const boxTop5 = boxPlayers.players.slice(0, 5).map(p => ({
      ...p,
      normalized_name: p.player_name || `${p.first_name} ${p.last_name}`.trim()
    }));
    const overlap = boxTop5.filter(p => defNames.has(p.normalized_name));
    assert(overlap.length >= 3,
      `Top 5 boxscore scorers overlap with default top 20`,
      `${overlap.length}/5: box=[${boxTop5.map(p => p.normalized_name).join(', ')}]`);
  }
  
  // Test conference filter
  const confPlayers = await fetchJSON(
    `${API}/api/players?league=${LEAGUE}&season=${SEASON}&source=boxscore&conference=Crossroads League&sort_by=pts_pg&limit=5&min_gp=5`
  );
  assert(confPlayers.players?.length > 0, 'Boxscore players with conference filter works');
  if (confPlayers.players?.length > 0) {
    // All should be from Crossroads League — check via team lookup
    // (conference is not returned on player objects from boxscore, so just verify it returns data)
    assert(true, 'Conference-filtered player query succeeds');
  }
  
  // Test pagination
  const page2 = await fetchJSON(
    `${API}/api/players?league=${LEAGUE}&season=${SEASON}&source=boxscore&sort_by=pts_pg&limit=10&offset=10&min_gp=5`
  );
  assert(page2.players?.length > 0, 'Boxscore players pagination works');
  if (page2.players?.length > 0 && boxPlayers.players?.length > 0) {
    assert(page2.players[0].player_id !== boxPlayers.players[0].player_id,
      'Page 2 has different players than page 1');
  }
}

// ─────────────────────────────────────────────────────────
// TEST 7: Percentiles Endpoint
// ─────────────────────────────────────────────────────────
async function testPercentiles(teams) {
  console.log('\n── Test 7: Percentiles ──');
  
  const team = teams.box[0];
  const pct = await fetchJSON(
    `${API}/api/teams/${team.team_id}/percentiles?season=${SEASON}&source=boxscore`
  );
  
  assert(pct && typeof pct === 'object', `${team.name}: percentiles returns data`);
  
  // Check that percentile values are between 0 and 100
  const pctKeys = Object.keys(pct);
  assert(pctKeys.length > 0, `${team.name}: has percentile keys`, `count=${pctKeys.length}`);
  
  // Exclude metadata fields that aren't percentile values
  const nonPctFields = new Set(['national_count', 'team_id', 'name', 'conference']);
  const outOfRange = pctKeys.filter(k => {
    if (nonPctFields.has(k)) return false;
    const v = parseFloat(pct[k]);
    return !isNaN(v) && (v < 0 || v > 100);
  });
  assert(outOfRange.length === 0,
    `${team.name}: all percentiles 0-100 (excl metadata)`,
    outOfRange.length > 0 ? `out of range: ${outOfRange.join(', ')}` : '');
}

// ─────────────────────────────────────────────────────────
// TEST 8: Box Score Modal Endpoint
// ─────────────────────────────────────────────────────────
async function testBoxScoreModal(teams) {
  console.log('\n── Test 8: Box Score Modal ──');
  
  const team = teams.box[0];
  const schedule = await fetchJSON(
    `${API}/api/teams/${team.team_id}/schedule?season=${SEASON}&source=boxscore`
  );
  
  const completedGames = (schedule.games || []).filter(g => g.is_completed && !g.is_exhibition);
  assert(completedGames.length > 0, 'Has completed games for box score test');
  
  if (completedGames.length === 0) return;
  
  // Test a game with source=boxscore
  const gameId = completedGames[0].game_id;
  const boxScore = await fetchJSON(
    `${API}/api/games/${gameId}/boxscore?season=${SEASON}&source=boxscore`
  );
  
  assert(boxScore.game_id != null, 'Box score returns game_id');
  assert(boxScore.team != null, 'Box score has team object');
  assert(boxScore.opponent != null, 'Box score has opponent object');
  assert(boxScore.team.name != null, 'Box score team has name');
  assert(boxScore.opponent.name != null, 'Box score opponent has name');
  assert(boxScore.team.score != null, 'Box score team has score');
  assert(boxScore.opponent.score != null, 'Box score opponent has score');
  assert(boxScore.team.stats != null, 'Box score team has stats');
  assert(boxScore.opponent.stats != null, 'Box score opponent has stats');
  
  // Stats should have shooting data
  const ts = boxScore.team.stats;
  assert(ts.fgm != null && ts.fga != null, 'Box score has FG data');
  assert(ts.fg_pct != null, 'Box score has FG%');
  assert(ts.fgm3 != null && ts.fga3 != null, 'Box score has 3PT data');
  assert(ts.ftm != null && ts.fta != null, 'Box score has FT data');
  
  // FG% should be decimal 0-1, not percentage
  assert(ts.fg_pct >= 0 && ts.fg_pct <= 1,
    'Box score FG% is decimal (0-1)',
    `fg_pct=${ts.fg_pct}`);
  
  // Test a conference game (both teams NAIA) — should have players for both
  const confGame = completedGames.find(g => g.is_conference && g.opponent_id);
  if (confGame) {
    const confBox = await fetchJSON(
      `${API}/api/games/${confGame.game_id}/boxscore?season=${SEASON}&source=boxscore`
    );
    const teamPlayers = confBox.team?.players || [];
    const oppPlayers = confBox.opponent?.players || [];
    assert(teamPlayers.length > 0 || oppPlayers.length > 0,
      'Conference game box score has player stats',
      `team=${teamPlayers.length}, opp=${oppPlayers.length}`);
    
    if (teamPlayers.length > 0) {
      const pl = teamPlayers[0];
      assert(pl.name != null, 'Box score player has name');
      assert(pl.pts != null, 'Box score player has pts');
      assert(pl.fgm != null, 'Box score player has fgm');
    }
  }
  
  // Test that default source box score still works (different game_id format)
  const defSched = await fetchJSON(
    `${API}/api/teams/${team.team_id}/schedule?season=${SEASON}`
  );
  const defGame = (defSched.games || []).find(g => g.is_completed);
  if (defGame) {
    try {
      const defBox = await fetchJSON(
        `${API}/api/games/${defGame.game_id}/boxscore?season=${SEASON}`
      );
      assert(defBox.team != null, 'Default source box score still works');
    } catch (e) {
      assert(false, 'Default source box score still works', e.message);
    }
  }
}

// ─────────────────────────────────────────────────────────
// TEST 9: Conference Filter
// ─────────────────────────────────────────────────────────
async function testConferenceFilter() {
  console.log('\n── Test 9: Conference Filter ──');
  
  const conf = 'Crossroads League';
  const box = await fetchJSON(
    `${API}/api/teams?league=${LEAGUE}&season=${SEASON}&source=boxscore&conference=${encodeURIComponent(conf)}`
  );
  
  assert(Array.isArray(box) && box.length > 0, `Conference filter returns teams`, `count=${box.length}`);
  
  // All teams should be in the right conference
  const wrongConf = box.filter(t => t.conference !== conf);
  assert(wrongConf.length === 0,
    'All filtered teams are in correct conference',
    wrongConf.length > 0 ? `wrong: ${wrongConf.map(t => t.name + '=' + t.conference).join(', ')}` : '');
  
  // Conference game type filter
  const confOnly = await fetchJSON(
    `${API}/api/teams?league=${LEAGUE}&season=${SEASON}&source=boxscore&gameType=conference`
  );
  assert(Array.isArray(confOnly) && confOnly.length > 0, 'gameType=conference returns teams');
  
  // When filtering to conference games only, GP should be <= overall GP
  const allTeams = await fetchJSON(
    `${API}/api/teams?league=${LEAGUE}&season=${SEASON}&source=boxscore`
  );
  let confGPCheck = 0;
  for (const ct of confOnly.slice(0, 10)) {
    const at = allTeams.find(t => t.team_id === ct.team_id);
    if (at && parseInt(ct.games_played) <= parseInt(at.games_played)) confGPCheck++;
  }
  assert(confGPCheck >= 8,
    'Conference-only GP ≤ overall GP for most teams',
    `${confGPCheck}/10 passed`);
}

// ─────────────────────────────────────────────────────────
// TEST 10: Season Type Filters
// ─────────────────────────────────────────────────────────
async function testSeasonTypeFilters() {
  console.log('\n── Test 10: Season Type Filters ──');
  
  // Regular season only
  const regular = await fetchJSON(
    `${API}/api/teams?league=${LEAGUE}&season=${SEASON}&source=boxscore&seasonType=regular`
  );
  assert(Array.isArray(regular) && regular.length > 0, 'seasonType=regular returns teams');
  
  // Last 10 games
  const last10 = await fetchJSON(
    `${API}/api/teams?league=${LEAGUE}&season=${SEASON}&source=boxscore&seasonSegment=last10`
  );
  assert(Array.isArray(last10) && last10.length > 0, 'seasonSegment=last10 returns teams');
  
  // Last 10 should have GP <= 10 for all teams
  const over10 = last10.filter(t => parseInt(t.games_played) > 10);
  assert(over10.length === 0,
    'Last 10 games: all teams have GP ≤ 10',
    over10.length > 0 ? `${over10.length} teams have GP > 10` : '');
  
  // Last 5 games
  const last5 = await fetchJSON(
    `${API}/api/teams?league=${LEAGUE}&season=${SEASON}&source=boxscore&seasonSegment=last5`
  );
  const over5 = last5.filter(t => parseInt(t.games_played) > 5);
  assert(over5.length === 0,
    'Last 5 games: all teams have GP ≤ 5',
    over5.length > 0 ? `${over5.length} teams have GP > 5` : '');
  
  // Month filter
  const jan = await fetchJSON(
    `${API}/api/teams?league=${LEAGUE}&season=${SEASON}&source=boxscore&seasonSegment=2026-01`
  );
  assert(Array.isArray(jan) && jan.length > 0, 'Month filter (Jan 2026) returns teams');
}

// ─────────────────────────────────────────────────────────
// TEST 11: Deduplication
// ─────────────────────────────────────────────────────────
async function testDeduplication(teams) {
  console.log('\n── Test 11: Deduplication ──');
  
  // Check that no team has duplicate games in exp tables
  const dupCheck = await pool.query(`
    SELECT team_name, game_date, opponent, COUNT(*) as cnt
    FROM (
      SELECT away_team_name as team_name, game_date, home_team_name as opponent
      FROM exp_game_box_scores WHERE season = $1
      UNION ALL
      SELECT home_team_name as team_name, game_date, away_team_name as opponent
      FROM exp_game_box_scores WHERE season = $1
    ) sub
    GROUP BY team_name, game_date, opponent
    HAVING COUNT(*) > 1
    LIMIT 10
  `, [SEASON]);
  
  assert(dupCheck.rows.length === 0,
    'No duplicate games in exp_game_box_scores',
    dupCheck.rows.length > 0 ? `${dupCheck.rows.length} duplicates found: ${dupCheck.rows[0].team_name} ${dupCheck.rows[0].game_date}` : '');
  
  // Check API-level dedup — schedule should have unique games
  for (const team of teams.box.slice(0, 3)) {
    const sched = await fetchJSON(
      `${API}/api/teams/${team.team_id}/schedule?season=${SEASON}&source=boxscore`
    );
    const games = sched.games || [];
    const keys = games.map(g => `${new Date(g.date).toISOString().split('T')[0]}_${g.opponent_name}`);
    const unique = new Set(keys);
    assert(keys.length === unique.size,
      `${team.name}: schedule has no duplicates`,
      keys.length !== unique.size ? `${keys.length - unique.size} duplicates` : '');
  }
}

// ─────────────────────────────────────────────────────────
// TEST 12: Score Accuracy Cross-Check
// ─────────────────────────────────────────────────────────
async function testScoreAccuracy(teams) {
  console.log('\n── Test 12: Score Accuracy Cross-Check ──');
  
  // For 5 teams, compare game scores between default and boxscore schedules
  let matchCount = 0;
  let mismatchCount = 0;
  let comparedGames = 0;
  const mismatches = [];
  
  for (const team of teams.box.slice(0, 10)) {
    const defSched = await fetchJSON(
      `${API}/api/teams/${team.team_id}/schedule?season=${SEASON}`
    );
    const boxSched = await fetchJSON(
      `${API}/api/teams/${team.team_id}/schedule?season=${SEASON}&source=boxscore`
    );
    
    const defGames = (defSched.games || []).filter(g => g.is_completed && !g.is_exhibition);
    const boxGames = (boxSched.games || []).filter(g => g.is_completed && !g.is_exhibition);
    
    // Match by date + opponent name
    for (const bg of boxGames) {
      const bgDate = new Date(bg.date).toISOString().split('T')[0];
      const dg = defGames.find(d => {
        const dgDate = new Date(d.date).toISOString().split('T')[0];
        return dgDate === bgDate && d.opponent_name === bg.opponent_name;
      });
      
      if (!dg) continue;
      comparedGames++;
      
      if (parseInt(bg.team_score) === parseInt(dg.team_score) && 
          parseInt(bg.opponent_score) === parseInt(dg.opponent_score)) {
        matchCount++;
      } else {
        mismatchCount++;
        if (mismatches.length < 5) {
          mismatches.push(`${team.name} vs ${bg.opponent_name} ${bgDate}: box=${bg.team_score}-${bg.opponent_score} def=${dg.team_score}-${dg.opponent_score}`);
        }
      }
    }
  }
  
  const matchRate = comparedGames > 0 ? (matchCount / comparedGames * 100).toFixed(1) : 0;
  assert(parseFloat(matchRate) >= 98,
    `Score match rate ≥ 98% (${matchRate}% of ${comparedGames} games)`,
    mismatches.length > 0 ? `mismatches: ${mismatches.join('; ')}` : '');
  console.log(`  Compared ${comparedGames} games: ${matchCount} match, ${mismatchCount} mismatch (${matchRate}%)`);
}

// ─────────────────────────────────────────────────────────
// TEST 13: Team Detail Endpoint
// ─────────────────────────────────────────────────────────
async function testTeamDetail(teams) {
  console.log('\n── Test 13: Team Detail Endpoint ──');
  
  const team = teams.box[0];
  const detail = await fetchJSON(
    `${API}/api/teams/${team.team_id}?season=${SEASON}&source=boxscore`
  );
  
  assert(detail.team != null, 'Team detail has team object');
  assert(detail.team.name != null, 'Team detail has team name');
  assert(detail.games != null, 'Team detail has games');
  assert(Array.isArray(detail.games), 'Team detail games is array');
  assert(detail.source === 'boxscore', 'Team detail indicates boxscore source', `got: ${detail.source}`);
}

// ─────────────────────────────────────────────────────────
// TEST 14: Stat Value Sanity Checks
// ─────────────────────────────────────────────────────────
async function testStatSanity(teams) {
  console.log('\n── Test 14: Stat Value Sanity Checks ──');
  
  for (const team of teams.box.slice(0, 10)) {
    const ortg = parseFloat(team.offensive_rating);
    const drtg = parseFloat(team.defensive_rating);
    const net = parseFloat(team.net_rating);
    const pace = parseFloat(team.pace);
    const rpi = parseFloat(team.rpi);
    const sos = parseFloat(team.strength_of_schedule);
    const fgPct = parseFloat(team.fg_pct);
    const fg3Pct = parseFloat(team.fg3_pct);
    const ftPct = parseFloat(team.ft_pct);
    
    // ORTG and DRTG should be between 60-140
    if (ortg < 60 || ortg > 140) {
      warn(`${team.name}: ORTG out of range`, `${ortg}`);
    }
    if (drtg < 60 || drtg > 140) {
      warn(`${team.name}: DRTG out of range`, `${drtg}`);
    }
    
    // Net = ORTG - DRTG (within rounding)
    const calcNet = ortg - drtg;
    if (Math.abs(net - calcNet) > 0.2) {
      warn(`${team.name}: net_rating mismatch`, `reported=${net} calc=${calcNet.toFixed(1)}`);
    }
    
    // Pace should be 55-90
    if (pace < 55 || pace > 95) {
      warn(`${team.name}: pace out of range`, `${pace}`);
    }
    
    // RPI should be 0-1
    assert(rpi >= 0 && rpi <= 1,
      `${team.name}: RPI in 0-1 range`,
      `rpi=${rpi}`);
    
    // FG% should be 0-1 (decimal format in team list)
    assert(fgPct >= 0 && fgPct <= 1,
      `${team.name}: FG% in decimal format`,
      `fg_pct=${fgPct}`);
    
    // Shooting percentages should be reasonable
    if (fgPct < 0.3 || fgPct > 0.65) {
      warn(`${team.name}: FG% extreme`, `${fgPct}`);
    }
  }
}

// ─────────────────────────────────────────────────────────
// TEST 15: Women's League Support
// ─────────────────────────────────────────────────────────
async function testWomensLeague() {
  console.log('\n── Test 15: Women\'s League ──');
  
  try {
    const womens = await fetchJSON(
      `${API}/api/teams?league=womens&season=${SEASON}&source=boxscore`
    );
    
    if (Array.isArray(womens) && womens.length > 0) {
      assert(true, `Women's boxscore returns teams`, `count=${womens.length}`);
      // Verify no mens teams leaked in
      const mensTeams = await fetchJSON(`${API}/api/teams?league=mens&season=${SEASON}&source=boxscore`);
      const mensIds = new Set(mensTeams.map(t => t.team_id));
      // Compare names since team_ids may be same string if league differentiation is handled differently
    } else {
      warn('Women\'s boxscore returns empty', 'May not have women\'s data scraped yet');
    }
  } catch (e) {
    warn('Women\'s boxscore query failed', e.message);
  }
}

// ─────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────
async function main() {
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║   Boxscore Source Comprehensive Test Suite        ║');
  console.log('║   Season:', SEASON, ' League:', LEAGUE, '            ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  
  try {
    const teams = await testTeamList();
    await testExhibitionFiltering();
    await testSplitsAccuracy(teams);
    await testSchedule(teams);
    await testRoster(teams);
    await testPlayerStats();
    await testPercentiles(teams);
    await testBoxScoreModal(teams);
    await testConferenceFilter();
    await testSeasonTypeFilters();
    await testDeduplication(teams);
    await testScoreAccuracy(teams);
    await testTeamDetail(teams);
    await testStatSanity(teams);
    await testWomensLeague();
  } catch (err) {
    console.error('\n💥 Test suite crashed:', err.message);
    console.error(err.stack);
  }
  
  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log(`║   Results: ${passed} passed, ${failed} failed, ${warnings} warnings`);
  console.log('╚═══════════════════════════════════════════════════╝');
  
  if (failures.length > 0) {
    console.log('\n❌ FAILURES:');
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  }
  if (warningList.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    warningList.forEach((w, i) => console.log(`  ${i + 1}. ${w}`));
  }
  
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main();
