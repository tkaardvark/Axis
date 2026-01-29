/**
 * NAIA Team JSON URL Scraper (Fast Version)
 * 
 * This script extracts team JSON URLs directly from HTML source using simple HTTP requests.
 * Much faster than Puppeteer since we don't need to render JavaScript.
 * 
 * The JSON URLs are embedded in the team page HTML, so we can use curl/fetch to get them.
 * 
 * Usage: node scrape-team-urls.js
 * Output: team-urls.json
 */

const fs = require('fs');
const https = require('https');

// Configuration
const BASE_URL = 'https://naiastats.prestosports.com';
const LEAGUES = {
  mens: '/sports/mbkb/2025-26/teams?view=teamstats&r=0&pos=',
  womens: '/sports/wbkb/2025-26/teams?view=teamstats&r=0&pos='
};

// Rate limiting - be nice to the server
const CONCURRENT_REQUESTS = 10;  // Number of parallel requests
const DELAY_BETWEEN_BATCHES = 500;  // ms delay between batches

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
  
  const startTime = Date.now();
  const results = {
    mens: [],
    womens: [],
    metadata: {
      scrapedAt: new Date().toISOString(),
      season: '2025-26'
    }
  };
  
  try {
    // Process Men's Basketball
    console.log('\n📊 MEN\'S BASKETBALL');
    console.log('-'.repeat(40));
    const mensData = await getTeamSlugs(LEAGUES.mens);
    results.mens = await processTeamsInBatches(mensData.slugs, mensData.sportPath);
    console.log(`✅ Men's: ${results.mens.length} JSON URLs collected`);
    
    // Process Women's Basketball
    console.log('\n📊 WOMEN\'S BASKETBALL');
    console.log('-'.repeat(40));
    const womensData = await getTeamSlugs(LEAGUES.womens);
    results.womens = await processTeamsInBatches(womensData.slugs, womensData.sportPath);
    console.log(`✅ Women's: ${results.womens.length} JSON URLs collected`);
    
    // Save results
    const outputPath = 'team-urls.json';
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
