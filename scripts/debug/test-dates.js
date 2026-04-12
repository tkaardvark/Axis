require('dotenv').config();
const https = require('https');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  const json = await fetchJson('https://prestosports-downloads.s3.us-west-2.amazonaws.com/teamData/0cv5q3be19t1greg.json');
  const teamId = json.attributes.teamId;
  console.log('Oregon Tech teamId:', teamId);
  
  const events = json.events || [];
  for (const eventData of events) {
    const event = eventData.event;
    if (!event) continue;
    
    const opponent = event.teams?.find(t => t.teamId !== teamId);
    if (!opponent) continue;
    if (!opponent.name.includes('Corban') && !opponent.name.includes('Bushnell')) continue;
    
    let gameDate;
    if (eventData.eventDateFormatted) {
      const timestampDate = new Date(event.date);
      const year = timestampDate.getFullYear();
      gameDate = new Date(eventData.eventDateFormatted + ', ' + year);
      if (isNaN(gameDate.getTime())) gameDate = timestampDate;
    } else {
      gameDate = new Date(event.date);
    }
    
    console.log('vs', opponent.name, '- eventDateFormatted:', eventData.eventDateFormatted, '-> Final:', gameDate.toISOString().split('T')[0]);
  }
}
main().catch(console.error);
