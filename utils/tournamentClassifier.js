// utils/tournamentClassifier.js
//
// Single source of truth for the "is_national_tournament" flag on a game.
//
// Background: Presto Sports' scoreboard does not reliably tag NAIA national
// tournament games as postseason (esp. for women's), and it sometimes tags
// concurrent NCCAA tournament games as postseason. The official bracket is
// the only trustworthy source — every game in the national tournament has
// both teams in the bracket, and any postseason game in that window where a
// team is NOT in the bracket is necessarily a different tournament.
//
// classifyNationalTournament(args) returns one of:
//   true                  — definitively a national tournament game
//   false                 — definitively NOT a national tournament game
//   null                  — bracket doesn't apply (league/season not bracketed)
//                           → caller should fall back to its own derivation

const { getBracket } = require('../config/tournament-bracket-2026');

// Tournament window covers all rounds from First Round through the final.
// We classify any game in this window where both teams are in the bracket
// as a national tournament game, and any other postseason-looking game in
// the same window as NOT a national tournament game.
const TOURNAMENT_WINDOWS = {
  '2025-26': { start: '2026-03-13', end: '2026-03-24' },
};

function inWindow(dateStr, win) {
  return dateStr >= win.start && dateStr <= win.end;
}

/**
 * Decide whether a game is a national tournament game.
 *
 * @param {object} args
 * @param {string} args.league   'mens' | 'womens'
 * @param {string} args.season   e.g. '2025-26'
 * @param {string} args.gameDate ISO date string (YYYY-MM-DD)
 * @param {string|null} args.awayTeamId
 * @param {string|null} args.homeTeamId
 * @returns {boolean|null}
 */
function classifyNationalTournament({ league, season, gameDate, awayTeamId, homeTeamId }) {
  const bracket = getBracket({ league, season });
  if (!bracket) return null; // no bracket configured for this league/season

  const window = TOURNAMENT_WINDOWS[season];
  if (!window) return null;

  // Outside the window — definitively not a national tournament game,
  // regardless of what the scoreboard says.
  if (!inWindow(gameDate, window)) return false;

  // Inside the window: bracket membership is authoritative.
  const bracketIds = new Set();
  bracket.quadrants.forEach(q => q.pods.forEach(p => p.teams.forEach(t => bracketIds.add(t.teamId))));

  if (!awayTeamId || !homeTeamId) return false;
  return bracketIds.has(awayTeamId) && bracketIds.has(homeTeamId);
}

module.exports = { classifyNationalTournament, TOURNAMENT_WINDOWS };
