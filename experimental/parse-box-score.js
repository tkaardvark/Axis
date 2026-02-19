/**
 * Experimental: Box Score HTML Parser
 *
 * Parses a Presto Sports box score HTML page into structured data:
 *   - Game metadata (teams, scores, period breakdown, status)
 *   - Player stats (per-player stat lines, starters vs bench)
 *   - Play-by-play events (timestamped with running score)
 *
 * The box score URLs end in .xml but are served as HTML.
 * Example: /sports/mbkb/2025-26/boxscores/20260217_nysm.xml
 */

/**
 * Parse a "FGM-A" style stat into { made, attempted }
 */
function parseMadeAttempted(text) {
  if (!text) return { made: 0, attempted: 0 };
  const clean = text.trim();
  const parts = clean.split('-');
  if (parts.length === 2) {
    return {
      made: parseInt(parts[0]) || 0,
      attempted: parseInt(parts[1]) || 0,
    };
  }
  return { made: 0, attempted: 0 };
}

/**
 * Parse an integer from potentially messy HTML text
 */
function parseIntSafe(text) {
  if (!text) return 0;
  const num = parseInt(text.trim());
  return isNaN(num) ? 0 : num;
}

/**
 * Classify an action_text into a standardized action_type
 */
function classifyAction(actionText) {
  const t = actionText.toLowerCase().trim();

  // Scoring plays
  if (t.includes('made 3-pt') || t.includes('made three')) return { type: 'made_3pt', scoring: true };
  if (t.includes('made layup') || t.includes('made dunk') || t.includes('made jump shot') ||
      t.includes('made tip') || t.includes('made hook') || t.includes('made field goal') ||
      (t.includes('made') && !t.includes('free throw') && !t.includes('3-pt'))) return { type: 'made_fg', scoring: true };
  if (t.includes('made free throw')) return { type: 'made_ft', scoring: true };

  // Missed shots
  if (t.includes('missed 3-pt') || t.includes('missed three')) return { type: 'missed_3pt', scoring: false };
  if (t.includes('missed free throw')) return { type: 'missed_ft', scoring: false };
  if (t.includes('missed')) return { type: 'missed_fg', scoring: false };

  // Rebounds
  if (t.includes('offensive rebound') || t.includes('off rebound')) return { type: 'rebound_off', scoring: false };
  if (t.includes('defensive rebound') || t.includes('def rebound') || t.includes('rebound')) return { type: 'rebound_def', scoring: false };

  // Other
  if (t.includes('assist')) return { type: 'assist', scoring: false };
  if (t.includes('steal')) return { type: 'steal', scoring: false };
  if (t.includes('block')) return { type: 'block', scoring: false };
  if (t.includes('turnover') || t.includes('turn over')) return { type: 'turnover', scoring: false };
  if (t.includes('foul')) return { type: 'foul', scoring: false };
  if (t.includes('timeout')) return { type: 'timeout', scoring: false };
  if (t.includes('enters') || t.includes('leaves') || t.includes('substitution') || t.includes('sub ')) return { type: 'substitution', scoring: false };
  if (t.includes('jump ball')) return { type: 'jump_ball', scoring: false };
  if (t.includes('deadball')) return { type: 'deadball', scoring: false };

  return { type: 'other', scoring: false };
}

/**
 * Extract player ID from a relative player URL
 * e.g., "../players?id=pqgng57n46ewivyo" → "pqgng57n46ewivyo"
 */
function extractPlayerId(playerUrl) {
  if (!playerUrl) return null;
  const match = playerUrl.match(/[?&]id=([a-z0-9]+)/i);
  return match ? match[1] : null;
}

/**
 * Extract team ID from a team URL in the box score
 * e.g., "...teams?id=6e9ho0vr4s3azje3" → "6e9ho0vr4s3azje3"
 */
function extractTeamId(teamUrl) {
  if (!teamUrl) return null;
  const match = teamUrl.match(/[?&]id=([a-z0-9]+)/i);
  return match ? match[1] : null;
}

/**
 * Parse the linescore table to get period-by-period scores
 * Returns: { away: { name, id, record, periods: [32, 29], total: 61 },
 *            home: { name, id, record, periods: [46, 48], total: 94 },
 *            status: "Final" }
 */
function parseLinescore(html) {
  const result = {
    away: { name: null, id: null, record: null, periods: [], total: 0 },
    home: { name: null, id: null, record: null, periods: [], total: 0 },
    status: 'Final',
  };

  // Extract status (Final, Final - OT, etc.)
  const statusMatch = html.match(/cal-status[^>]*>([^<]*)</);
  if (!statusMatch) {
    // Try from linescore header
    const headerMatch = html.match(/<th[^>]*class="[^"]*col-head[^"]*text"[^>]*>\s*([\s\S]*?)\s*<\/th>/);
    if (headerMatch) {
      result.status = headerMatch[1].trim();
    }
  } else {
    result.status = statusMatch[1].trim();
  }

  // Find the linescore table
  const linescoreMatch = html.match(/<div class="linescore">([\s\S]*?)<\/div>\s*<\/div>/);
  if (!linescoreMatch) return result;

  const linescoreHtml = linescoreMatch[1];

  // Parse rows: first data row = loser (away), second = winner (home)
  // Actually it's: first <tr> with class containing "loser" or just the first team row = away team
  const teamRows = linescoreHtml.match(/<tr\s+class="(loser|winner)"[^>]*>([\s\S]*?)<\/tr>/g);
  if (!teamRows || teamRows.length < 2) return result;

  for (let i = 0; i < teamRows.length; i++) {
    const row = teamRows[i];
    const target = i === 0 ? result.away : result.home;

    // Team name and ID — try linked team first, then fall back to plain text
    const nameMatch = row.match(/<a[^>]*href="[^"]*teams\?id=([^"&]+)"[^>]*>([^<]+)<\/a>/);
    if (nameMatch) {
      target.id = nameMatch[1];
      target.name = nameMatch[2].trim();
    } else {
      // Non-NAIA teams may not have a link — extract name from the th/td with class "text"
      const plainMatch = row.match(/<(?:th|td)[^>]*class="[^"]*text[^"]*"[^>]*>\s*([^<]+)/);
      if (plainMatch) {
        target.name = plainMatch[1].trim();
      }
    }

    // Period scores
    const periodScores = [];
    const scoreMatches = row.match(/<td class="score">\s*(\d+)\s*<\/td>/g);
    if (scoreMatches) {
      for (const sm of scoreMatches) {
        const val = sm.match(/(\d+)/);
        if (val) periodScores.push(parseInt(val[1]));
      }
    }

    // Total score
    const totalMatch = row.match(/<td class="score total">\s*(\d+)\s*<\/td>/);
    if (totalMatch) {
      target.total = parseInt(totalMatch[1]);
    }

    target.periods = periodScores;
  }

  return result;
}

/**
 * Parse player stats from a team's stats box
 * Returns array of player objects
 */
function parsePlayerStats(statsBoxHtml, teamName, teamId, isHome) {
  const players = [];
  let isStarter = true;

  // Split into rows
  const rows = statsBoxHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/g);
  if (!rows) return players;

  for (const row of rows) {
    // Check for group headers (STARTERS / BENCH)
    if (row.includes('STARTERS')) {
      isStarter = true;
      continue;
    }
    if (row.includes('BENCH') || row.includes('RESERVES')) {
      isStarter = false;
      continue;
    }

    // Skip header rows, totals, and team rows
    if (row.includes('<th scope="col"') || row.includes('col-head')) continue;
    if (row.includes('TEAM') || row.includes('Totals') || row.includes('class="total"')) continue;

    // Try to extract player data
    const playerNameMatch = row.match(/<a[^>]*href="([^"]*players[^"]*)"[^>]*class="player-name"[^>]*>([^<]+)<\/a>/);
    if (!playerNameMatch) continue;

    const playerUrl = playerNameMatch[1];
    const playerName = playerNameMatch[2].trim();
    const playerId = extractPlayerId(playerUrl);

    // Uniform number
    const uniformMatch = row.match(/<span class="uniform">(\d+)<\/span>/);
    const uniform = uniformMatch ? uniformMatch[1] : null;

    // Stats are in <td> elements after the player name header
    const tds = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g);
    if (!tds || tds.length < 13) continue;

    // Extract text from each td
    const tdValues = tds.map(td => {
      const text = td.replace(/<[^>]+>/g, '').trim();
      return text;
    });

    // Column order: MIN, FGM-A, 3PM-A, FTM-A, OREB, DREB, REB, AST, STL, BLK, TO, PF, PTS
    const fg = parseMadeAttempted(tdValues[1]);
    const fg3 = parseMadeAttempted(tdValues[2]);
    const ft = parseMadeAttempted(tdValues[3]);

    players.push({
      playerName,
      playerUrl,
      playerId,
      uniformNumber: uniform,
      teamName,
      teamId,
      isHome,
      isStarter,
      minutes: parseIntSafe(tdValues[0]),
      fgm: fg.made,
      fga: fg.attempted,
      fgm3: fg3.made,
      fga3: fg3.attempted,
      ftm: ft.made,
      fta: ft.attempted,
      oreb: parseIntSafe(tdValues[4]),
      dreb: parseIntSafe(tdValues[5]),
      reb: parseIntSafe(tdValues[6]),
      ast: parseIntSafe(tdValues[7]),
      stl: parseIntSafe(tdValues[8]),
      blk: parseIntSafe(tdValues[9]),
      turnovers: parseIntSafe(tdValues[10]),
      pf: parseIntSafe(tdValues[11]),
      pts: parseIntSafe(tdValues[12]),
    });
  }

  return players;
}

/**
 * Parse team totals from a team's stats box
 * Returns { fgm, fga, fg_pct, fgm3, fga3, fg3_pct, ftm, fta, ft_pct, oreb, dreb, reb, ast, stl, blk, to, pf, pts }
 */
function parseTeamTotals(statsBoxHtml) {
  // Look for the "Totals" or "total" row
  const totalRowMatch = statsBoxHtml.match(/<tr[^>]*class="[^"]*total[^"]*"[^>]*>([\s\S]*?)<\/tr>/);
  if (!totalRowMatch) return null;

  const row = totalRowMatch[0];
  const tds = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g);
  if (!tds || tds.length < 13) return null;

  const tdValues = tds.map(td => td.replace(/<[^>]+>/g, '').trim());

  const fg = parseMadeAttempted(tdValues[1]);
  const fg3 = parseMadeAttempted(tdValues[2]);
  const ft = parseMadeAttempted(tdValues[3]);

  return {
    fgm: fg.made,
    fga: fg.attempted,
    fg_pct: fg.attempted > 0 ? fg.made / fg.attempted : 0,
    fgm3: fg3.made,
    fga3: fg3.attempted,
    fg3_pct: fg3.attempted > 0 ? fg3.made / fg3.attempted : 0,
    ftm: ft.made,
    fta: ft.attempted,
    ft_pct: ft.attempted > 0 ? ft.made / ft.attempted : 0,
    oreb: parseIntSafe(tdValues[4]),
    dreb: parseIntSafe(tdValues[5]),
    reb: parseIntSafe(tdValues[6]),
    ast: parseIntSafe(tdValues[7]),
    stl: parseIntSafe(tdValues[8]),
    blk: parseIntSafe(tdValues[9]),
    to: parseIntSafe(tdValues[10]),
    pf: parseIntSafe(tdValues[11]),
    pts: parseIntSafe(tdValues[12]),
  };
}

/**
 * Parse the Team Stats tab for comparison stats
 * (Points in Paint, Fastbreak, Bench, 2nd Chance, etc.)
 *
 * Returns: {
 *   away: { pointsInPaint, fastbreakPoints, benchPoints, secondChancePoints,
 *           pointsOffTurnovers, largestLead, timeOfLargestLead },
 *   home: { ... same fields ... },
 *   ties: number, leadChanges: number
 * }
 */
function parseTeamStats(html) {
  const result = {
    away: {},
    home: {},
    ties: null,
    leadChanges: null,
  };

  // Find the Team Stats section
  const sectionMatch = html.match(/<section[^>]*id="teamstats-tabpanel"[^>]*>([\s\S]*?)<\/section>/);
  if (!sectionMatch) return result;

  const sectionHtml = sectionMatch[1];

  // Map stat label text (lowercased) to result field names
  const statMapping = {
    'points in the paint': 'pointsInPaint',
    'points in paint': 'pointsInPaint',
    'fastbreak points': 'fastbreakPoints',
    'fast break points': 'fastbreakPoints',
    'bench points': 'benchPoints',
    '2nd chance points': 'secondChancePoints',
    'second chance points': 'secondChancePoints',
    'points off turnovers': 'pointsOffTurnovers',
    'largest lead': 'largestLead',
    'time of largest lead': 'timeOfLargestLead',
  };

  // Parse each stat row: <th class="row-head text">Label</th><td>away</td><td>home</td>
  const rowRegex = /<th[^>]*class="row-head text"[^>]*>([^<]*)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/g;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(sectionHtml)) !== null) {
    const label = rowMatch[1].trim().toLowerCase();
    const awayVal = rowMatch[2].replace(/<[^>]*>/g, '').trim();
    const homeVal = rowMatch[3].replace(/<[^>]*>/g, '').trim();

    const field = statMapping[label];
    if (field) {
      if (field === 'timeOfLargestLead') {
        result.away[field] = awayVal === '-' ? null : awayVal;
        result.home[field] = homeVal === '-' ? null : homeVal;
      } else {
        result.away[field] = parseIntSafe(awayVal);
        result.home[field] = parseIntSafe(homeVal);
      }
    }
  }

  // Parse Trends row: "Ties: N; Lead Changes: N"
  const trendsMatch = sectionHtml.match(/Ties:\s*(\d+)[\s;]*Lead Changes:\s*(\d+)/i);
  if (trendsMatch) {
    result.ties = parseInt(trendsMatch[1]);
    result.leadChanges = parseInt(trendsMatch[2]);
  }

  return result;
}

/**
 * Parse play-by-play section
 * Returns array of play objects
 */
function parsePlayByPlay(html) {
  const plays = [];

  // Find the PBP section
  const pbpMatch = html.match(/<section[^>]*id="pbp-tabpanel"[^>]*>([\s\S]*?)<\/section>/);
  if (!pbpMatch) return plays;

  const pbpHtml = pbpMatch[1];

  // Split by period headers
  const periodBlocks = pbpHtml.split(/<span[^>]*id="prd(\d+)"[^>]*>/);

  let currentPeriod = 0;
  let sequenceNumber = 0;

  for (let i = 1; i < periodBlocks.length; i += 2) {
    currentPeriod = parseInt(periodBlocks[i]);
    const blockHtml = periodBlocks[i + 1] || '';

    // Find all play rows
    const playRows = blockHtml.match(/<tr[^>]*class="row[^"]*"[^>]*>([\s\S]*?)<\/tr>/g);
    if (!playRows) continue;

    for (const row of playRows) {
      sequenceNumber++;

      // Extract time
      const timeMatch = row.match(/<td class="time">([^<]*)<\/td>/);
      const gameClock = timeMatch ? timeMatch[1].trim() : null;

      // Determine if home or visitor play
      const isHome = row.includes('class="row home') || row.includes('class="row  home');
      const isAway = row.includes('class="row visitor') || row.includes('class="row  visitor');

      // Extract play text
      const playTextMatch = row.match(/<span class="text">\s*([\s\S]*?)\s*<\/span>/);
      const actionText = playTextMatch ? playTextMatch[1].replace(/\s+/g, ' ').trim() : '';
      if (!actionText) continue;

      // Extract team name from logo alt text
      const teamMatch = row.match(/<img[^>]*alt="([^"]*)"[^>]*class="team-logo/);
      const teamName = teamMatch ? teamMatch[1].trim() : null;

      // Extract player name from action text (usually "LASTNAME,FIRSTNAME action")
      const playerMatch = actionText.match(/^([A-Z]+(?:[-'][A-Z]+)?,\s*[A-Z]+(?:\s+[A-Z]+)?)\s+/);
      const playerName = playerMatch ? playerMatch[1] : null;

      // Extract running score
      const vScoreMatch = row.match(/class='v-score'>(\d+)</);
      const hScoreMatch = row.match(/class='h-score'>(\d+)</);
      const awayScore = vScoreMatch ? parseInt(vScoreMatch[1]) : null;
      const homeScore = hScoreMatch ? parseInt(hScoreMatch[1]) : null;

      // Is this a scoring play?
      const isScoreChanged = row.includes('score-changed');
      const { type: actionType, scoring } = classifyAction(actionText);

      plays.push({
        period: currentPeriod,
        gameClock,
        sequenceNumber,
        teamName,
        isHome: isHome ? true : (isAway ? false : null),
        playerName,
        actionText,
        actionType,
        isScoringPlay: isScoreChanged || scoring,
        awayScore,
        homeScore,
      });
    }
  }

  return plays;
}

/**
 * Parse the full box score HTML into structured data
 *
 * @param {string} html - The full HTML of the box score page
 * @param {string} boxScoreUrl - The URL this was fetched from
 * @param {string} season - Season identifier
 * @param {string} league - "mens" or "womens"
 * @param {string} gameDate - ISO date string (YYYY-MM-DD)
 * @returns {object} Parsed box score data
 */
function parseBoxScore(html, boxScoreUrl, season, league, gameDate) {
  // 1. Parse linescore (teams, period scores, final score, status)
  const linescore = parseLinescore(html);

  // 2. Find the two team stats boxes (visitor first, then home)
  const statsBoxes = html.match(/<div class="stats-box full lineup[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/g);

  let awayPlayers = [];
  let homePlayers = [];
  let awayTotals = null;
  let homeTotals = null;

  if (statsBoxes && statsBoxes.length >= 2) {
    // First box is visitor (away), second is home
    awayPlayers = parsePlayerStats(statsBoxes[0], linescore.away.name, linescore.away.id, false);
    homePlayers = parsePlayerStats(statsBoxes[1], linescore.home.name, linescore.home.id, true);
    awayTotals = parseTeamTotals(statsBoxes[0]);
    homeTotals = parseTeamTotals(statsBoxes[1]);
  }

  // 3. Parse play-by-play
  const plays = parsePlayByPlay(html);

  // 4. Parse team comparison stats (paint, fastbreak, bench, etc.)
  const teamStats = parseTeamStats(html);

  // 5. Extract records from page
  const awayRecordMatch = html.match(new RegExp(
    escapeRegex(linescore.away.name || '') + '[\\s\\S]*?team-record[^>]*>\\(([^)]+)\\)',
  ));
  const homeRecordMatch = html.match(new RegExp(
    escapeRegex(linescore.home.name || '') + '[\\s\\S]*?team-record[^>]*>\\(([^)]+)\\)',
  ));

  // 6. Extract attendance and location from Game Information section
  let attendance = null;
  let locationText = null;

  const gameInfoMatch = html.match(/Game Information([\s\S]*?)(?:<\/table>|<\/section>)/);
  if (gameInfoMatch) {
    const attendanceMatch = gameInfoMatch[1].match(/Attendance[:\s]*(\d[\d,]*)/i);
    if (attendanceMatch) {
      attendance = parseInt(attendanceMatch[1].replace(',', ''));
    }
    const locationMatch = gameInfoMatch[1].match(/Location[:\s]*([^<]+)/i);
    if (locationMatch) {
      locationText = locationMatch[1].trim();
    }
  }

  return {
    game: {
      boxScoreUrl,
      season,
      league,
      gameDate,
      status: linescore.status,
      numPeriods: Math.max(linescore.away.periods.length, linescore.home.periods.length, 2),
      attendance,
      locationText,
      ties: teamStats.ties,
      leadChanges: teamStats.leadChanges,
      away: {
        name: linescore.away.name,
        id: linescore.away.id,
        record: awayRecordMatch ? awayRecordMatch[1] : null,
        score: linescore.away.total,
        periodScores: linescore.away.periods,
        totals: awayTotals,
        teamStats: teamStats.away,
      },
      home: {
        name: linescore.home.name,
        id: linescore.home.id,
        record: homeRecordMatch ? homeRecordMatch[1] : null,
        score: linescore.home.total,
        periodScores: linescore.home.periods,
        totals: homeTotals,
        teamStats: teamStats.home,
      },
    },
    players: [...awayPlayers, ...homePlayers],
    plays,
  };
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  parseBoxScore,
  parseLinescore,
  parsePlayerStats,
  parseTeamTotals,
  parseTeamStats,
  parsePlayByPlay,
  classifyAction,
  extractPlayerId,
  extractTeamId,
};
