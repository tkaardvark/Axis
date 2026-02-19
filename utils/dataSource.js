/**
 * Data source resolver.
 *
 * Determines which data pipeline to use (boxscore vs legacy) based on
 * league, season, and optional explicit override from the query string.
 *
 * Current policy:
 *   - MBB 2025-26 → boxscore by default
 *   - Everything else → legacy (original JSON-import pipeline)
 *   - Explicit ?source=legacy or ?source=boxscore always wins
 *
 * When more seasons/leagues are backfilled into the exp_ tables,
 * add them to BOXSCORE_AVAILABLE below.
 */

// Seasons + leagues that have been fully loaded into exp_ tables
const BOXSCORE_AVAILABLE = new Set([
  'mens:2025-26',
]);

/**
 * Resolve the effective data source.
 *
 * @param {Object} opts
 * @param {string} opts.league   - 'mens' or 'womens'
 * @param {string} opts.season   - e.g. '2025-26'
 * @param {string} [opts.source] - explicit override from req.query.source
 * @returns {'boxscore'|'legacy'}
 */
function resolveSource({ league = 'mens', season = '2025-26', source } = {}) {
  // Explicit override always wins
  if (source === 'boxscore') return 'boxscore';
  if (source === 'legacy') return 'legacy';

  // Auto-select based on available backfills
  const key = `${league}:${season}`;
  return BOXSCORE_AVAILABLE.has(key) ? 'boxscore' : 'legacy';
}

/**
 * Check whether boxscore data is available for a league+season.
 */
function isBoxScoreAvailable(league, season) {
  return BOXSCORE_AVAILABLE.has(`${league}:${season}`);
}

module.exports = { resolveSource, isBoxScoreAvailable, BOXSCORE_AVAILABLE };
