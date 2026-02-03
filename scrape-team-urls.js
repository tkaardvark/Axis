/**
 * NAIA Team JSON URL Scraper (Fast Version)
 *
 * This script extracts team JSON URLs directly from HTML source using simple HTTP requests.
 * Much faster than Puppeteer since we don't need to render JavaScript.
 *
 * The JSON URLs are embedded in the team page HTML, so we can use curl/fetch to get them.
 *
 * Usage: node scrape-team-urls.js [--season 2024-25]
 * Output: team-urls-{season}.json
 */

const fs = require('fs');
const https = require('https');

// Parse --season argument (default: 2025-26)
const args = process.argv.slice(2);
const seasonIdx = args.indexOf('--season');
const SEASON = seasonIdx !== -1 && args[seasonIdx + 1] ? args[seasonIdx + 1] : '2025-26';

// Configuration
const BASE_URL = 'https://naiastats.prestosports.com';
const LEAGUES = {
  mens: `/sports/mbkb/${SEASON}/teams?view=teamstats&r=0&pos=`,
  womens: `/sports/wbkb/${SEASON}/teams?view=teamstats&r=0&pos=`
};

// Rate limiting - be nice to the server
const CONCURRENT_REQUESTS = 10;  // Number of parallel requests
const DELAY_BETWEEN_BATCHES = 500;  // ms delay between batches

/**
 * EXTRA TEAMS - Teams that don't appear on the main teams listing page
 * These are typically conference-only teams that need to be added manually.
 * Format: { slug: 'teamslug', league: 'mens' | 'womens' }
 * 
 * To find a team's slug, go to their page on naiastats.prestosports.com
 * and look at the URL, e.g., /sports/mbkb/2025-26/teams/governorsstate
 */
const EXTRA_TEAMS = [
  // Governors State (Chicagoland Conference) - only shows on conference page, not main listing
  { slug: 'governorsstate', league: 'mens' },
  // Paul Quinn (Red River Conference) - only shows on conference page, not main listing
  { slug: 'paulquinn', league: 'mens' },
  // UHSP (American Midwest Conference) - only shows on conference page, not main listing
  { slug: 'uhsp', league: 'mens' },
];

/**
 * Make an HTTPS GET request and return the response body
 */
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Extract team slugs from the teams listing page
 * Example: /sports/mbkb/2025-26/teams/gracein -> gracein
 */
async function getTeamSlugs(leaguePath) {
  console.log(`\nFetching team list from: ${BASE_URL}${leaguePath}`);
  
  const html = await fetchPage(`${BASE_URL}${leaguePath}`);
  
  // Extract the sport path (e.g., /sports/mbkb/2025-26)
  // leaguePath looks like: /sports/mbkb/2025-26/teams?view=teamstats&r=0&pos=
  const sportPath = leaguePath.split('/teams')[0];
  
  // Match team slugs from URLs like /sports/mbkb/2025-26/teams/gracein
  const regex = new RegExp(`${sportPath}/teams/([a-z0-9]+)`, 'g');
  
  const slugs = new Set();
  let match;
  while ((match = regex.exec(html)) !== null) {
    slugs.add(match[1]);
  }
  
  const uniqueSlugs = Array.from(slugs);
  console.log(`Found ${uniqueSlugs.length} teams`);
  
  return { slugs: uniqueSlugs, sportPath };
}

/**
 * Extract JSON URL from a team page's HTML source
 * Looks for: prestosports-downloads.s3.us-west-2.amazonaws.com/teamData/xxxxx.json
 */
async function getTeamJsonUrl(teamPageUrl) {
  try {
    const html = await fetchPage(teamPageUrl);
    
    // Look for the teamData JSON URL in the HTML
    const match = html.match(/prestosports-downloads\.s3\.us-west-2\.amazonaws\.com\/teamData\/[a-z0-9]+\.json/);
    
    if (match) {
      return `https://${match[0]}`;
    }
    return null;
  } catch (error) {
    console.error(`  Error fetching ${teamPageUrl}: ${error.message}`);
    return null;
  }
}

/**
 * Process teams in batches with concurrency limit
 */
async function processTeamsInBatches(teamSlugs, sportPath) {
  const jsonUrls = [];
  
  console.log(`Processing ${teamSlugs.length} teams in batches of ${CONCURRENT_REQUESTS}...`);
  
  for (let i = 0; i < teamSlugs.length; i += CONCURRENT_REQUESTS) {
    const batch = teamSlugs.slice(i, i + CONCURRENT_REQUESTS);
    const batchNum = Math.floor(i / CONCURRENT_REQUESTS) + 1;
    const totalBatches = Math.ceil(teamSlugs.length / CONCURRENT_REQUESTS);
    
    process.stdout.write(`  Batch ${batchNum}/${totalBatches} (${i + 1}-${Math.min(i + CONCURRENT_REQUESTS, teamSlugs.length)} of ${teamSlugs.length})...`);
    
    // Process batch in parallel
    const promises = batch.map(slug => {
      const teamUrl = `${BASE_URL}${sportPath}/teams/${slug}`;
      return getTeamJsonUrl(teamUrl);
    });
    
    const results = await Promise.all(promises);
    
    // Count successes
    const successCount = results.filter(url => url !== null).length;
    console.log(` found ${successCount} URLs`);
    
    // Add successful results
    results.forEach(url => {
      if (url) jsonUrls.push(url);
    });
    
    // Small delay between batches to be nice to the server
    if (i + CONCURRENT_REQUESTS < teamSlugs.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
    }
  }
  
  return jsonUrls;
}

/**
 * Main function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('NAIA Team JSON URL Scraper (Fast Version)');
  console.log('='.repeat(60));
  
  console.log(`Season: ${SEASON}`);

  const startTime = Date.now();
  const results = {
    mens: [],
    womens: [],
    metadata: {
      scrapedAt: new Date().toISOString(),
      season: SEASON
    }
  };
  
  try {
    // Process Men's Basketball
    console.log('\n📊 MEN\'S BASKETBALL');
    console.log('-'.repeat(40));
    const mensData = await getTeamSlugs(LEAGUES.mens);
    
    // Add extra men's teams that don't appear on the main listing
    const extraMensSlugs = EXTRA_TEAMS.filter(t => t.league === 'mens').map(t => t.slug);
    const allMensSlugs = [...new Set([...mensData.slugs, ...extraMensSlugs])];
    if (extraMensSlugs.length > 0) {
      console.log(`  + Adding ${extraMensSlugs.length} extra teams: ${extraMensSlugs.join(', ')}`);
    }
    
    results.mens = await processTeamsInBatches(allMensSlugs, mensData.sportPath);
    console.log(`✅ Men's: ${results.mens.length} JSON URLs collected`);
    
    // Process Women's Basketball
    console.log('\n📊 WOMEN\'S BASKETBALL');
    console.log('-'.repeat(40));
    const womensData = await getTeamSlugs(LEAGUES.womens);
    
    // Add extra women's teams that don't appear on the main listing
    const extraWomensSlugs = EXTRA_TEAMS.filter(t => t.league === 'womens').map(t => t.slug);
    const allWomensSlugs = [...new Set([...womensData.slugs, ...extraWomensSlugs])];
    if (extraWomensSlugs.length > 0) {
      console.log(`  + Adding ${extraWomensSlugs.length} extra teams: ${extraWomensSlugs.join(', ')}`);
    }
    
    results.womens = await processTeamsInBatches(allWomensSlugs, womensData.sportPath);
    results.womens = await processTeamsInBatches(womensData.slugs, womensData.sportPath);
    console.log(`✅ Women's: ${results.womens.length} JSON URLs collected`);
    
    // Save results (per-season file)
    const outputPath = `team-urls-${SEASON}.json`;
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Men's teams:   ${results.mens.length}`);
    console.log(`Women's teams: ${results.womens.length}`);
    console.log(`Total:         ${results.mens.length + results.womens.length}`);
    console.log(`Time elapsed:  ${elapsed} seconds`);
    console.log(`\n💾 Saved to: ${outputPath}`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the scraper
main();
