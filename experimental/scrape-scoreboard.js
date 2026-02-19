/**
 * Experimental: Scoreboard Scraper
 *
 * Scrapes the NAIA Presto Sports scoreboard to discover:
 *   1. All game dates in a season (from the date picker)
 *   2. All box score URLs for a given date
 *
 * This module is used by import-box-scores.js — it doesn't write to the DB.
 */

const https = require('https');
const http = require('http');

const BASE_URL = 'https://naiastats.prestosports.com';

const LEAGUE_PATHS = {
  mens: 'mbkb',
  womens: 'wbkb',
};

/**
 * Fetch a URL and return the response body as a string
 */
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
    const client = parsedUrl.startsWith('https') ? https : http;
    client.get(parsedUrl, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Scrape the scoreboard page for a given date to get all box score URLs
 *
 * Returns game metadata including type flags extracted from the event card
 * CSS classes: conf, division, exhibition, postseason.
 *
 * @param {string} date - ISO date string (YYYY-MM-DD)
 * @param {string} league - "mens" or "womens"
 * @returns {Promise<Array<{
 *   boxScoreUrl: string,
 *   awayTeam: string,
 *   homeTeam: string,
 *   status: string,
 *   isConference: boolean,
 *   isDivision: boolean,
 *   isExhibition: boolean,
 *   isPostseason: boolean,
 *   season: string|null
 * }>>}
 */
async function getBoxScoreUrlsForDate(date, league = 'mens') {
  const sport = LEAGUE_PATHS[league];
  const url = `${BASE_URL}/sports/${sport}/scoreboard?d=${date}`;

  const html = await fetchPage(url);
  const results = [];
  const seenFiles = new Set(); // Deduplicate: same game can appear via /conf/XYZ/ path

  // Find all box score links
  // Pattern: href="/sports/mbkb/2025-26/boxscores/20260217_nysm.xml"
  const boxScoreRegex = new RegExp(
    `href="(/sports/${sport}/[^"]*?/boxscores/[^"]+\\.xml)"`,
    'g',
  );

  let match;
  while ((match = boxScoreRegex.exec(html)) !== null) {
    const boxScoreUrl = match[1];

    // Deduplicate by filename (e.g., "20260217_nysm.xml")
    const fileMatch = boxScoreUrl.match(/boxscores\/([^/]+\.xml)$/);
    const fileName = fileMatch ? fileMatch[1] : boxScoreUrl;
    if (seenFiles.has(fileName)) continue;
    seenFiles.add(fileName);

    // Extract game type flags from the event card's CSS classes
    // Walk backward from the box score link to find the card div with "event-row" class
    const eventRowPos = html.lastIndexOf('event-row', match.index);
    const classStart = eventRowPos !== -1 ? html.lastIndexOf('class="', eventRowPos) : -1;
    const classEnd = classStart !== -1 ? html.indexOf('"', classStart + 7) : -1;
    const classString = classStart !== -1 && classEnd !== -1
      ? html.substring(classStart + 7, classEnd)
      : '';
    const classes = classString.split(/\s+/);

    const isConference = classes.includes('conf');
    const isDivision = classes.includes('division');
    const isExhibition = classes.includes('exhibition');
    const isPostseason = classes.includes('postseason');

    // Extract season from URL path (e.g. "2025-26" from "/sports/mbkb/2025-26/boxscores/...")
    const seasonMatch = boxScoreUrl.match(/\/sports\/\w+\/([\d]+-[\d]+)\//);
    const season = seasonMatch ? seasonMatch[1] : null;

    // Extract team names from a window around the box score link
    // Use the region from the event-row div to the box score link (team names precede the link)
    const cardHtml = eventRowPos !== -1
      ? html.substring(eventRowPos, match.index + 200)
      : '';

    const teamNames = [];
    const teamRegex = /<span class="team-name"\s+title="([^"]+)">/g;
    let teamMatch;
    while ((teamMatch = teamRegex.exec(cardHtml)) !== null) {
      const name = teamMatch[1].trim();
      if (name) teamNames.push(name);
    }

    // Extract status
    const statusMatch = cardHtml.match(/cal-status[^>]*>\s*([\s\S]*?)\s*<\/div>/);
    const status = statusMatch ? statusMatch[1].replace(/<[^>]*>/g, '').trim() : 'Unknown';

    results.push({
      boxScoreUrl,
      awayTeam: teamNames[0] || 'Unknown',
      homeTeam: teamNames[1] || 'Unknown',
      status,
      isConference,
      isDivision,
      isExhibition,
      isPostseason,
      season,
    });
  }

  return results;
}

/**
 * Get all game dates for a season from the scoreboard date picker
 *
 * @param {string} league - "mens" or "womens"
 * @returns {Promise<string[]>} Array of ISO date strings
 */
async function getAllGameDates(league = 'mens') {
  const sport = LEAGUE_PATHS[league];
  // Fetch the scoreboard page (any date — it shows all dates in the picker)
  const url = `${BASE_URL}/sports/${sport}/scoreboard`;
  const html = await fetchPage(url);

  const dates = new Set();
  const dateRegex = new RegExp(`scoreboard\\?d=(\\d{4}-\\d{2}-\\d{2})`, 'g');

  let match;
  while ((match = dateRegex.exec(html)) !== null) {
    dates.add(match[1]);
  }

  // Sort chronologically
  return Array.from(dates).sort();
}

/**
 * Filter dates to a specific season range
 */
function filterDatesToSeason(dates, season) {
  // Season like "2025-26" means Oct 2025 through April 2026
  const parts = season.split('-');
  const startYear = parseInt(parts[0]);
  const endYearShort = parseInt(parts[1]);
  const endYear = startYear + (endYearShort < 50 ? (endYearShort > parseInt(parts[0].slice(2)) ? 0 : 100) : 0);
  // Actually, for "2025-26", games run from ~Oct 2025 to ~Apr 2026
  const seasonStart = `${startYear}-08-01`;
  const seasonEnd = `${startYear + 1}-05-01`;

  return dates.filter(d => d >= seasonStart && d <= seasonEnd);
}

/**
 * Filter dates to a specific range
 */
function filterDatesToRange(dates, fromDate, toDate) {
  return dates.filter(d => {
    if (fromDate && d < fromDate) return false;
    if (toDate && d > toDate) return false;
    return true;
  });
}

/**
 * Fetch box score HTML for a given URL
 */
async function fetchBoxScoreHtml(boxScoreUrl) {
  const fullUrl = boxScoreUrl.startsWith('http') ? boxScoreUrl : `${BASE_URL}${boxScoreUrl}`;
  return fetchPage(fullUrl);
}

module.exports = {
  getBoxScoreUrlsForDate,
  getAllGameDates,
  filterDatesToSeason,
  filterDatesToRange,
  fetchBoxScoreHtml,
  fetchPage,
  BASE_URL,
  LEAGUE_PATHS,
};
