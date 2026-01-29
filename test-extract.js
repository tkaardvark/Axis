require('dotenv').config();
const https = require('https');

// Fetch JSON from URL
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function test() {
  const url = 'https://prestosports-downloads.s3.us-west-2.amazonaws.com/teamData/ciyc89i3pl1qqivl.json';
  const teamId = 'gjjg68o96u18nogw';
  
  const json = await fetchJson(url);
  const events = json.events || [];
  
  console.log('Total events:', events.length);
  console.log('\nProcessing each event:');
  
  let gamesExtracted = 0;
  let gamesSkipped = 0;
  
  for (const eventData of events) {
    const event = eventData.event;
    if (!event) {
      console.log('  SKIP: No event object');
      gamesSkipped++;
      continue;
    }
    
    // Skip games that haven't been played yet
    if (!event.resultAsObject || !event.resultAsObject.hasScores) {
      console.log('  SKIP: No scores yet -', event.teams?.[1]?.name || 'unknown');
      gamesSkipped++;
      continue;
    }
    
    // Find our team and opponent
    const teams = event.teams || [];
    const usTeam = teams.find(t => t.teamId === teamId);
    const opponent = teams.find(t => t.teamId !== teamId);
    
    if (!usTeam || !opponent) {
      console.log('  SKIP: Missing team data - usTeam:', !!usTeam, 'opponent:', !!opponent);
      console.log('    Teams array:', teams.map(t => ({ id: t.teamId, name: t.name })));
      gamesSkipped++;
      continue;
    }
    
    const date = new Date(event.date).toISOString().split('T')[0];
    console.log(`  EXTRACTED: ${date} vs ${opponent.name} (${opponent.teamId})`);
    gamesExtracted++;
  }
  
  console.log('\n--- Summary ---');
  console.log('Games extracted:', gamesExtracted);
  console.log('Games skipped:', gamesSkipped);
}

test();
