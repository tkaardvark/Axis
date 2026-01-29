/**
 * NAIA Team Logo Scraper
 *
 * This script fetches team logos from athletic websites.
 * Most NAIA schools use SIDEARM Sports for their athletics sites.
 *
 * Usage: node scrape-logos.js
 */

require('dotenv').config();
const { Client } = require('pg');
const https = require('https');
const http = require('http');

// Configuration
const CONCURRENT_REQUESTS = 3;
const DELAY_BETWEEN_BATCHES = 500;
const REQUEST_TIMEOUT = 10000;

/**
 * Make an HTTP/HTTPS GET request
 */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const timeout = setTimeout(() => {
      reject(new Error('Request timeout'));
    }, REQUEST_TIMEOUT);

    protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        clearTimeout(timeout);
        fetchUrl(res.headers.location).then(resolve).catch(reject);
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        clearTimeout(timeout);
        resolve({ data, statusCode: res.statusCode });
      });
      res.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    }).on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Extract logo URL from HTML content
 * Looks for common logo patterns in athletic websites
 */
function extractLogoUrl(html, baseUrl) {
  const patterns = [
    // SIDEARM Sports CDN patterns (most common for NAIA)
    /https:\/\/dxbhsrqyrr690\.cloudfront\.net[^"'\s]*logo[^"'\s]*\.(png|svg|jpg|webp)/gi,
    /https:\/\/dbukjj6eu5tsf\.cloudfront\.net[^"'\s]*logo[^"'\s]*\.(png|svg|jpg|webp)/gi,
    // SIDEARM convert URLs
    /https:\/\/images\.sidearmdev\.com\/convert\?url=[^"'\s]+logo[^"'\s]*/gi,
    // Direct logo paths
    /\/images\/logos\/site\/site\.(png|svg|jpg|webp)/gi,
    // Generic logo patterns
    /https?:\/\/[^"'\s]+\/[^"'\s]*logo[_-]?primary[^"'\s]*\.(png|svg|jpg|webp)/gi,
    /https?:\/\/[^"'\s]+\/[^"'\s]*primary[_-]?logo[^"'\s]*\.(png|svg|jpg|webp)/gi,
  ];

  for (const pattern of patterns) {
    const matches = html.match(pattern);
    if (matches && matches.length > 0) {
      // Filter out common non-team logos
      const filtered = matches.filter(url =>
        !url.includes('naia') &&
        !url.includes('footer') &&
        !url.includes('sponsor') &&
        !url.includes('conference') &&
        !url.includes('nccaa')
      );
      if (filtered.length > 0) {
        let logoUrl = filtered[0];
        // Decode URL-encoded characters if present
        if (logoUrl.includes('%')) {
          try {
            logoUrl = decodeURIComponent(logoUrl);
          } catch (e) {}
        }
        // Handle convert URLs - extract the actual image URL
        if (logoUrl.includes('sidearmdev.com/convert')) {
          const match = logoUrl.match(/url=([^&]+)/);
          if (match) {
            logoUrl = decodeURIComponent(match[1]);
          }
        }
        return logoUrl;
      }
    }
  }

  // Try to find any image that looks like a logo
  const imgPattern = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = imgPattern.exec(html)) !== null) {
    const src = match[1];
    if (src.includes('logo') && !src.includes('naia') && !src.includes('footer')) {
      // Make absolute URL if relative
      if (src.startsWith('/')) {
        const urlObj = new URL(baseUrl);
        return `${urlObj.protocol}//${urlObj.host}${src}`;
      }
      return src;
    }
  }

  return null;
}

/**
 * Map school name to likely athletic website domain
 * Extended mapping with many more NAIA schools
 */
function getAthleticWebsiteUrl(schoolName) {
  // Clean the school name
  const name = schoolName
    .replace(/\([^)]+\)/g, '') // Remove state abbreviations
    .trim()
    .toLowerCase();

  // Extensive known mappings for NAIA schools
  const knownMappings = {
    // Top ranked schools
    'grace': 'gclancers.com',
    'freed-hardeman': 'fhuathletics.com',
    'cumberlands': 'ucpatriots.com',
    'indiana wesleyan': 'iwuwildcats.com',
    'pikeville': 'upikebears.com',
    'langston': 'lulions.com',
    'lsu shreveport': 'lsusathletics.com',
    'graceland': 'athletics.graceland.edu',
    'columbia': 'gocougars.ccis.edu',
    'northwestern': 'nwciowa.edu/athletics',

    // Common NAIA schools
    'marian': 'muknights.com',
    'saint francis': 'sfcougars.com',
    'oklahoma wesleyan': 'okwueagles.com',
    'bethel': 'bethelroyal.com',
    'taylor': 'taylortrojans.com',
    'huntington': 'huntingtonforesters.com',
    'spring arbor': 'arborsports.com',
    'mount vernon nazarene': 'mvnuathletics.com',
    'davenport': 'dupanthers.com',
    'cornerstone': 'cugoldeneagles.com',
    'aquinas': 'aquinassaints.com',
    'madonna': 'madonnacrusaders.com',
    'campbellsville': 'campbellsvilletigers.com',
    'lindsey wilson': 'lindseywilsonathletics.com',
    'georgetown': 'georgetownathletics.com',
    'midway': 'goeagles.com',
    'thomas more': 'tmusaints.com',
    'brescia': 'bresciasports.com',
    'rio grande': 'rioredstorm.com',
    'shawnee state': 'ssubears.com',
    'point park': 'pointparkpioneers.com',
    'ohio christian': 'ocutrailblazers.com',
    'central methodist': 'caborathletics.com',
    'william penn': 'wpstatesmen.com',
    'grand view': 'grandviewvikings.com',
    'mount mercy': 'mountmercyathletics.com',
    'morningside': 'morningsideathletics.com',
    'dordt': 'dordtdefenders.com',
    'northwestern': 'nwcraiders.com',
    'dakota wesleyan': 'dwutigers.com',
    'jamestown': 'gojimmies.com',
    'valley city state': 'vcsuvikings.com',
    'dickinson state': 'dickinsonstateblue.com',
    'mayville state': 'mayvillestateathletics.com',
    'university of saint mary': 'stmarysports.com',
    'baker': 'bakerwildcats.com',
    'benedictine': 'benuraven.com',
    'avila': 'avilaeagles.com',
    'evangel': 'evangelcrusaders.com',
    'missouri valley': 'goviking.com',
    'central christian': 'ccctigers.com',
    'sterling': 'sterlingathletics.com',
    'southwestern': 'moundbuilderathletics.com',
    'tabor': 'taborbluejays.com',
    'friends': 'friendsathletics.com',
    'kansas wesleyan': 'kwucoyotes.com',
    'bethany': 'bethanyswedesathletics.com',
    'oklahoma city': 'okstarsathletics.com',
    'oklahoma panhandle': 'opsuaggies.com',
    'southwestern assemblies': 'saguathletics.com',
    'wayland baptist': 'wbupioneers.com',
    'lubbock christian': 'lcuchaps.com',
    'texas wesleyan': 'txwesrams.com',
    'our lady of the lake': 'ollsports.com',
    'huston-tillotson': 'htramathletics.com',
    'jarvis christian': 'jarvisbulldogs.com',
    'wiley': 'wileywildcats.com',
    'paul quinn': 'paulquinntigers.com',
    'dillard': 'dillardathletics.com',
    'xavier louisiana': 'xugoldnuggets.com',
    'talladega': 'talladegatornadoes.com',
    'edward waters': 'ewctigers.com',
    'southeastern': 'gosufire.com',
    'warner': 'warnersports.com',
    'webber international': 'webberwarriors.com',
    'keiser': 'kuseahawks.com',
    'thomas': 'thomasnighthawks.com',
    'florida memorial': 'fmulions.com',
    'ave maria': 'amugyrenes.com',
    'blue mountain': 'gotoppers.com',
    'william carey': 'wmcareyathletics.com',
    'loyola new orleans': 'loyolawolfpack.com',
    'southern new orleans': 'gosuknights.com',
    'doane': 'doanetigers.com',
    'concordia': 'cunebulldogs.com',
    'hastings': 'hastingsbroncos.com',
    'midland': 'gomidland.com',
    'peru state': 'perustatesports.com',
    'college of saint mary': 'csmflames.com',
    'york': 'yorkpanthers.com',
    'bellevue': 'bellevuebruins.com',
    'vanguard': 'vulions.com',
    'westmont': 'westmontwarriors.com',
    'fresno pacific': 'fpusunbirds.com',
    'masters': 'gomustangs.com',
    'menlo': 'menlooaks.com',
    'cal maritime': 'calkeelathletics.com',
    'antelope valley': 'avpioneers.com',
    'arizona christian': 'acufirestorm.com',
    'ottawa arizona': 'ottawaazathletics.com',
    'rocky mountain': 'gobattlin.com',
    'montana tech': 'godiggers.com',
    'montana western': 'umwbulldogs.com',
    'providence': 'gocuprovidence.com',
    'corban': 'corbanwarriors.com',
    'warner pacific': 'warnerpacificknights.com',
    'multnomah': 'multnomahsaints.com',
    'evergreen state': 'evergreengeoduckathletics.com',
    'walla walla': 'wwuwolves.com',
    'british columbia': 'gothunderbirds.ca',
    'southern oregon': 'sousports.com',
    'oregon tech': 'oitathletics.com',
    'eastern oregon': 'eousports.com',
    'college of idaho': 'yotesonline.com',
    'northwest': 'nwcrusaders.com',
  };

  // Check known mappings first
  for (const [key, domain] of Object.entries(knownMappings)) {
    if (name.includes(key)) {
      return `https://${domain}`;
    }
  }

  // Generate likely domain patterns
  const simplified = name
    .replace(/university|college|of/g, '')
    .replace(/\s+/g, '')
    .replace(/[^a-z]/g, '');

  // Try common athletic site patterns
  return `https://${simplified}athletics.com`;
}

/**
 * Try multiple URL patterns to find the athletic website
 */
async function findAthleticWebsite(schoolName) {
  const baseUrl = getAthleticWebsiteUrl(schoolName);
  const urlsToTry = [
    baseUrl,
    baseUrl.replace('athletics.com', 'sports.com'),
    baseUrl.replace('athletics.com', '.sidearmsports.com'),
  ];

  for (const url of urlsToTry) {
    try {
      const { data, statusCode } = await fetchUrl(url);
      if (statusCode === 200 && data.length > 1000) {
        return { url, html: data };
      }
    } catch (e) {
      // Try next URL
    }
  }

  return null;
}

/**
 * Fetch logo for a single team
 */
async function fetchTeamLogo(team) {
  try {
    const website = await findAthleticWebsite(team.name);
    if (!website) {
      return { team_id: team.team_id, name: team.name, logo_url: null, error: 'Website not found' };
    }

    const logoUrl = extractLogoUrl(website.html, website.url);
    if (logoUrl) {
      // Verify the logo URL works
      try {
        const { statusCode } = await fetchUrl(logoUrl);
        if (statusCode === 200) {
          return { team_id: team.team_id, name: team.name, logo_url: logoUrl, website: website.url };
        }
      } catch (e) {
        // Logo URL doesn't work, return null
      }
    }

    return { team_id: team.team_id, name: team.name, logo_url: null, website: website.url, error: 'Logo not found' };
  } catch (err) {
    return { team_id: team.team_id, name: team.name, logo_url: null, error: err.message };
  }
}

/**
 * Process teams in batches
 */
async function processTeamsInBatches(teams) {
  const results = [];

  console.log(`\nProcessing ${teams.length} teams...`);

  for (let i = 0; i < teams.length; i += CONCURRENT_REQUESTS) {
    const batch = teams.slice(i, i + CONCURRENT_REQUESTS);
    const batchNum = Math.floor(i / CONCURRENT_REQUESTS) + 1;
    const totalBatches = Math.ceil(teams.length / CONCURRENT_REQUESTS);

    process.stdout.write(`  Batch ${batchNum}/${totalBatches}...`);

    const promises = batch.map(team => fetchTeamLogo(team));
    const batchResults = await Promise.all(promises);

    const found = batchResults.filter(r => r.logo_url).length;
    results.push(...batchResults);

    console.log(` ${found}/${batch.length} logos found`);

    if (i + CONCURRENT_REQUESTS < teams.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
    }
  }

  return results;
}

/**
 * Update logo URLs in database
 */
async function updateLogos(client, results) {
  let updated = 0;
  for (const result of results) {
    if (result.logo_url) {
      await client.query(
        'UPDATE teams SET logo_url = $1 WHERE team_id = $2',
        [result.logo_url, result.team_id]
      );
      updated++;
    }
  }
  return updated;
}

/**
 * Main function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('NAIA Team Logo Scraper');
  console.log('='.repeat(60));

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✓ Connected to database');

    // Get all teams
    const teamsResult = await client.query(
      'SELECT team_id, name FROM teams WHERE logo_url IS NULL ORDER BY name'
    );
    const teams = teamsResult.rows;

    console.log(`Found ${teams.length} teams without logos`);

    if (teams.length === 0) {
      console.log('All teams already have logos!');
      return;
    }

    const startTime = Date.now();

    // Process teams
    const results = await processTeamsInBatches(teams);

    // Update database
    console.log('\n💾 UPDATING DATABASE');
    console.log('-'.repeat(40));
    const updated = await updateLogos(client, results);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Teams processed: ${teams.length}`);
    console.log(`Logos found: ${results.filter(r => r.logo_url).length}`);
    console.log(`Logos updated in DB: ${updated}`);
    console.log(`Time elapsed: ${elapsed} seconds`);

    // List teams without logos
    const missing = results.filter(r => !r.logo_url);
    if (missing.length > 0 && missing.length <= 20) {
      console.log('\n⚠️  Teams without logos:');
      missing.forEach(r => console.log(`  - ${r.name}: ${r.error || 'Unknown error'}`));
    } else if (missing.length > 20) {
      console.log(`\n⚠️  ${missing.length} teams without logos (too many to list)`);
    }

    console.log('\n✅ Logo scraping complete!');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
