/**
 * Shared formatting utilities for stat values and dates.
 *
 * Centralises logic that was previously duplicated across
 * Scout, TeamModal, TeamsTable, Matchup, Conferences, BoxScoreModal, and Players.
 */

/**
 * Format a numeric stat value according to its format type.
 *
 * @param {*} value  – raw value (number, string, null, undefined)
 * @param {string} format – one of: int, pct1, pct3, rating, rating2
 * @returns {string|*}
 */
export function formatStatValue(value, format) {
  if (value === null || value === undefined) return '-';

  switch (format) {
    case 'int':
      return Math.round(Number(value));
    case 'pct1':
      return (parseFloat(value) * 100).toFixed(1);
    case 'pct3':
      return parseFloat(value).toFixed(3);
    case 'rating':
      return parseFloat(value).toFixed(1);
    case 'rating2':
      return parseFloat(value).toFixed(2);
    default:
      return value;
  }
}

/**
 * Format a column-aware stat value from a data row (split / team object).
 * Handles the special 'record' format.
 *
 * @param {object} row  – data row (split, team object, etc.)
 * @param {object} col  – column config with { key, format }
 * @returns {string|*}
 */
export function formatColumnValue(row, col) {
  if (col.format === 'record') {
    const wins = row.wins ?? '-';
    const losses = row.losses ?? '-';
    return `${wins}-${losses}`;
  }
  return formatStatValue(row[col.key], col.format);
}

/**
 * Format a date string for compact display (e.g. "Feb 26").
 *
 * @param {string} dateStr  – ISO date string
 * @returns {string}
 */
export function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * Format a date string with the year included (e.g. "Feb 26, 2026").
 *
 * @param {string} dateStr  – ISO date string
 * @returns {string}
 */
export function formatDateWithYear(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
