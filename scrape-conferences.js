/**
 * Conference Scraper
 * 
 * Scrapes NAIA stats to get conference assignments for each team
 * and updates the teams table in the database.
 */

require('dotenv').config();
const https = require('https');
const { Client } = require('pg');

const CONFERENCES = {
  mens: [
    { slug: 'American_Midwest', name: 'American Midwest Conference' },
    { slug: 'Appalachian', name: 'Appalachian Athletic Conference' },
    { slug: 'California_Pacific', name: 'California Pacific Conference' },
    { slug: 'Cascade', name: 'Cascade Collegiate Conference' },
    { slug: 'Chicagoland', name: 'Chicagoland Collegiate Athletic Conference' },
    { slug: 'Continental', name: 'Continental Athletic Conference' },
    { slug: 'Crossroads', name: 'Crossroads League' },
    { slug: 'Frontier', name: 'Frontier Conference' },
    { slug: 'Great_Plains', name: 'Great Plains Athletic Conference' },
    { slug: 'Great_Southwest', name: 'Great Southwest Athletic Conference' },
    { slug: 'HBCU_Conference', name: 'HBCU Athletic Conference' },
    { slug: 'Heart_of_America', name: 'Heart of America Athletic Conference' },
    { slug: 'KCAC', name: 'Kansas Collegiate Athletic Conference' },
    { slug: 'Mid-South', name: 'Mid-South Conference' },
    { slug: 'North_Star', name: 'North Star Athletic Association' },
    { slug: 'Red_River', name: 'Red River Athletic Conference' },
    { slug: 'River_States', name: 'River States Conference' },
    { slug: 'Sooner', name: 'Sooner Athletic Conference' },
    { slug: 'Southern_States', name: 'Southern States Athletic Conference' },
    { slug: 'The_Sun', name: 'The Sun Conference' },
    { slug: 'Wolverine-Hoosier', name: 'Wolverine-Hoosier Athletic Conference' },
  ],
  womens: [
    { slug: 'American_Midwest', name: 'American Midwest Conference' },
    { slug: 'Appalachian', name: 'Appalachian Athletic Conference' },
    { slug: 'California_Pacific', name: 'California Pacific Conference' },
    { slug: 'Cascade', name: 'Cascade Collegiate Conference' },
    { slug: 'Chicagoland', name: 'Chicagoland Collegiate Athletic Conference' },
    { slug: 'Continental', name: 'Continental Athletic Conference' },
    { slug: 'Crossroads', name: 'Crossroads League' },
    { slug: 'Frontier', name: 'Frontier Conference' },
    { slug: 'Great_Plains', name: 'Great Plains Athletic Conference' },
    { slug: 'Great_Southwest', name: 'Great Southwest Athletic Conference' },
    { slug: 'HBCU_Conference', name: 'HBCU Athletic Conference' },
    { slug: 'Heart_of_America', name: 'Heart of America Athletic Conference' },
    { slug: 'KCAC', name: 'Kansas Collegiate Athletic Conference' },
    { slug: 'Mid-South', name: 'Mid-South Conference' },
    { slug: 'North_Star', name: 'North Star Athletic Association' },
    { slug: 'Red_River', name: 'Red River Athletic Conference' },
    { slug: 'River_States', name: 'River States Conference' },
    { slug: 'Sooner', name: 'Sooner Athletic Conference' },
    { slug: 'Southern_States', name: 'Southern States Athletic Conference' },
    { slug: 'The_Sun', name: 'The Sun Conference' },
    { slug: 'Wolverine-Hoosier', name: 'Wolverine-Hoosier Athletic Conference' },
  ]
};

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function getTeamsInConference(sport, confSlug) {
  const sportCode = sport === 'mens' ? 'mbkb' : 'wbkb';
  const url = `https://naiastats.prestosports.com/sports/${sportCode}/2024-25/conf/${confSlug}/teams?view=teamstats&r=0&pos=`;
  
  try {
    const html = await fetchHtml(url);
    
    // Extract team names from links like: <a href="/sports/mbkb/2024-25/conf/Crossroads/teams/gracein">Grace (Ind.)</a>
    const teamPattern = /<a href="\/sports\/[mw]bkb\/2024-25\/conf\/[^/]+\/teams\/[^"]+">([^<]+)<\/a>/g;
    const teams = new Set();
    let match;
    
    while ((match = teamPattern.exec(html)) !== null) {
      const teamName = match[1].trim();
      if (teamName && teamName !== 'Total' && teamName !== 'Avg') {
        teams.add(teamName);
      }
    }
    
    return Array.from(teams);
  } catch (err) {
    console.error(`Error fetching ${confSlug}: ${err.message}`);
    return [];
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Conference Assignment Scraper');
  console.log('='.repeat(60));
  
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('✓ Connected to database\n');
    
    // Build a map of team_id to conference
    const teamConferences = {};
    
    // Process men's conferences
    console.log("📊 MEN'S CONFERENCES");
    console.log('-'.repeat(40));
    
    for (const conf of CONFERENCES.mens) {
      const teams = await getTeamsInConference('mens', conf.slug);
      console.log(`  ${conf.name}: ${teams.length} teams`);
      
      for (const teamName of teams) {
        // Map by team name
        teamConferences[teamName] = { conference: conf.name, league: 'mens' };
      }
      
      // Small delay to be nice to the server
      await new Promise(r => setTimeout(r, 100));
    }
    
    // Process women's conferences
    console.log("\n📊 WOMEN'S CONFERENCES");
    console.log('-'.repeat(40));
    
    for (const conf of CONFERENCES.womens) {
      const teams = await getTeamsInConference('womens', conf.slug);
      console.log(`  ${conf.name}: ${teams.length} teams`);
      
      for (const teamName of teams) {
        teamConferences[teamName + '_womens'] = { conference: conf.name, league: 'womens', name: teamName };
      }
      
      await new Promise(r => setTimeout(r, 100));
    }
    
    // Update database
    console.log('\n💾 UPDATING DATABASE');
    console.log('-'.repeat(40));
    
    let updated = 0;
    
    // Update men's teams by name
    for (const [key, data] of Object.entries(teamConferences)) {
      if (data.league === 'mens') {
        const result = await client.query(`
          UPDATE teams 
          SET conference = $1, updated_at = CURRENT_TIMESTAMP
          WHERE name = $2 AND league = 'mens'
        `, [data.conference, key]);
        
        if (result.rowCount > 0) {
          updated += result.rowCount;
        }
      } else {
        // Women's teams
        const result = await client.query(`
          UPDATE teams 
          SET conference = $1, updated_at = CURRENT_TIMESTAMP
          WHERE name = $2 AND league = 'womens'
        `, [data.conference, data.name]);
        
        if (result.rowCount > 0) {
          updated += result.rowCount;
        }
      }
    }
    
    console.log(`  Updated ${updated} teams with conference assignments`);
    
    // Show summary
    const summary = await client.query(`
      SELECT conference, league, COUNT(*) as count
      FROM teams
      WHERE conference IS NOT NULL
      GROUP BY conference, league
      ORDER BY league, conference
    `);
    
    console.log('\n📋 CONFERENCE SUMMARY');
    console.log('-'.repeat(40));
    
    let currentLeague = '';
    for (const row of summary.rows) {
      if (row.league !== currentLeague) {
        console.log(`\n  ${row.league.toUpperCase()}:`);
        currentLeague = row.league;
      }
      console.log(`    ${row.conference}: ${row.count}`);
    }
    
    // Check for teams without conferences
    const noConf = await client.query(`
      SELECT name, league FROM teams WHERE conference IS NULL
    `);
    
    if (noConf.rows.length > 0) {
      console.log(`\n⚠️  ${noConf.rows.length} teams without conference assignment:`);
      noConf.rows.slice(0, 10).forEach(t => console.log(`    ${t.name} (${t.league})`));
      if (noConf.rows.length > 10) {
        console.log(`    ... and ${noConf.rows.length - 10} more`);
      }
    }
    
    console.log('\n✅ Conference assignment complete!');
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

main();
