/**
 * Calculate the percentile rank (0-100) for a value within a distribution.
 * Used by Matchup and TeamRadarChart for radar chart visualization.
 *
 * @param {*} value – the value to rank
 * @param {Array} allValues – the full distribution
 * @param {boolean} [higherIsBetter=true] – true if higher values are better
 * @returns {number} percentile 0-100 (defaults to 50 if value is null)
 */
export function getPercentile(value, allValues, higherIsBetter = true) {
  if (value === null || value === undefined) return 50;
  const sorted = [...allValues].filter(v => v !== null && v !== undefined).sort((a, b) => a - b);
  const rank = sorted.findIndex(v => v >= value);
  const percentile = (rank / sorted.length) * 100;
  return higherIsBetter ? percentile : 100 - percentile;
}
