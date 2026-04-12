/**
 * Calculate the percentile rank of a value within a distribution.
 *
 * @param {*} teamValue     – the value to rank
 * @param {Array} allValues – the full distribution
 * @param {boolean} higherBetter – true if higher values are better
 * @returns {number|null} percentile 0-100, or null if invalid
 */
function calculatePercentile(teamValue, allValues, higherBetter) {
  if (teamValue === null || teamValue === undefined) return null;
  const validValues = allValues.filter(v => v !== null && v !== undefined && !isNaN(v));
  if (validValues.length === 0) return null;
  const val = parseFloat(teamValue);
  const countBelow = higherBetter
    ? validValues.filter(v => parseFloat(v) < val).length
    : validValues.filter(v => parseFloat(v) > val).length;
  return Math.round((countBelow / validValues.length) * 100);
}

module.exports = { calculatePercentile };
