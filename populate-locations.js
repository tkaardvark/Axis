/**
 * Populate Team Locations
 *
 * This script populates the city, state, latitude, and longitude columns
 * in the teams table using the team-locations.js data file and geocoding.
 */

require('dotenv').config();
const { Client } = require('pg');
const https = require('https');
const { teamLocations } = require('./config/team-locations');

// Geocoding using OpenStreetMap's Nominatim (free, no API key required)
function geocode(city, state) {
  return new Promise((resolve, reject) => {
    const query = encodeURIComponent(`${city}, ${state}, USA`);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;

    const options = {
      headers: {
        'User-Agent': 'NAIA-Basketball-Analytics/1.0'
      }
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const results = JSON.parse(data);
          if (results && results.length > 0) {
            resolve({
              latitude: parseFloat(results[0].lat),
              longitude: parseFloat(results[0].lon)
            });
          } else {
            resolve(null);
          }
        } catch (err) {
          reject(err);
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Delay helper for rate limiting
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('='.repeat(60));
  console.log('Team Location Population Script');
  console.log('='.repeat(60));

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✓ Connected to database\n');

    // Get all teams that need location data
    const teamsResult = await client.query(`
      SELECT id, name, league
      FROM teams
      WHERE is_excluded = FALSE
      ORDER BY name
    `);

    console.log(`Found ${teamsResult.rows.length} teams to process\n`);

    let updated = 0;
    let geocoded = 0;
    let notFound = [];

    for (const team of teamsResult.rows) {
      const location = teamLocations[team.name];

      if (location) {
        // Update city and state
        await client.query(`
          UPDATE teams
          SET city = $1, state = $2, updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
        `, [location.city, location.state, team.id]);

        console.log(`✓ ${team.name} → ${location.city}, ${location.state}`);
        updated++;

        // Geocode if we don't have coordinates yet
        const existingCoords = await client.query(`
          SELECT latitude, longitude FROM teams WHERE id = $1
        `, [team.id]);

        if (!existingCoords.rows[0].latitude) {
          try {
            // Rate limit: Nominatim requires max 1 request per second
            await delay(1100);

            const coords = await geocode(location.city, location.state);
            if (coords) {
              await client.query(`
                UPDATE teams
                SET latitude = $1, longitude = $2
                WHERE id = $3
              `, [coords.latitude, coords.longitude, team.id]);
              console.log(`  📍 Geocoded: ${coords.latitude}, ${coords.longitude}`);
              geocoded++;
            } else {
              console.log(`  ⚠️  Could not geocode`);
            }
          } catch (err) {
            console.log(`  ⚠️  Geocoding error: ${err.message}`);
          }
        }
      } else {
        notFound.push(team.name);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Teams with location data: ${updated}`);
    console.log(`Teams geocoded: ${geocoded}`);
    console.log(`Teams not found in location data: ${notFound.length}`);

    if (notFound.length > 0) {
      console.log('\n⚠️  Teams missing from location data:');
      notFound.forEach(name => console.log(`  - "${name}"`));
    }

    // Show final stats
    const stats = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE city IS NOT NULL) as with_city,
        COUNT(*) FILTER (WHERE latitude IS NOT NULL) as with_coords,
        COUNT(*) as total
      FROM teams
      WHERE is_excluded = FALSE
    `);

    console.log('\n📊 Database Stats:');
    console.log(`  Teams with city/state: ${stats.rows[0].with_city}/${stats.rows[0].total}`);
    console.log(`  Teams with coordinates: ${stats.rows[0].with_coords}/${stats.rows[0].total}`);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

main();
