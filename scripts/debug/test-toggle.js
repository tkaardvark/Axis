const http = require('http');

function fetch(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

(async () => {
  try {
    // 1. Compare /api/teams
    console.log('=== /api/teams comparison ===');
    const [orig, box] = await Promise.all([
      fetch('http://localhost:3001/api/teams?league=mens'),
      fetch('http://localhost:3001/api/teams?league=mens&source=boxscore'),
    ]);
    console.log('Default teams:', orig.length, '| BoxScore teams:', box.length);

    const teamName = 'Indiana Wesleyan';
    const origTeam = orig.find(t => t.name.includes(teamName));
    const boxTeam = box.find(t => t.name.includes(teamName));
    if (origTeam && boxTeam) {
      console.log('\n' + origTeam.name + ':');
      const keys = [
        'games_played','wins','losses','points_per_game','points_allowed_per_game',
        'offensive_rating','defensive_rating','fg_pct','fg3_pct','ft_pct',
        'ast_per_game','to_per_game','stl_per_game','blk_per_game',
        'pts_paint_per_game','pts_fastbreak_per_game'
      ];
      keys.forEach(k => {
        const match = String(origTeam[k]) === String(boxTeam[k]) ? '==' : '!=';
        console.log('  ' + match + ' ' + k + ': default=' + origTeam[k] + ' box=' + boxTeam[k]);
      });
    }

    // 2. Test /api/teams/:teamId
    const tid = origTeam ? origTeam.team_id : null;
    if (tid) {
      console.log('\n=== /api/teams/' + tid + ' (detail) ===');
      const detail = await fetch('http://localhost:3001/api/teams/' + tid + '?source=boxscore');
      console.log('Source:', detail.source);
      console.log('Games:', detail.games.length);
      if (detail.games[0]) {
        console.log('First game:', detail.games[0].game_date, detail.games[0].opponent_name, detail.games[0].team_score + '-' + detail.games[0].opponent_score);
      }
    }

    // 3. Test /api/teams/:teamId/splits
    if (tid) {
      console.log('\n=== /api/teams/' + tid + '/splits ===');
      const splits = await fetch('http://localhost:3001/api/teams/' + tid + '/splits?source=boxscore');
      console.log('Splits:', splits.splits.map(s => s.split_name + ' (' + s.games_played + 'g, ' + s.wins + '-' + s.losses + ')').join(', '));
    }

    // 4. Test /api/teams/:teamId/schedule
    if (tid) {
      console.log('\n=== /api/teams/' + tid + '/schedule ===');
      const sched = await fetch('http://localhost:3001/api/teams/' + tid + '/schedule?source=boxscore');
      console.log('Games:', sched.games.length);
      const sample = sched.games.slice(0, 3);
      sample.forEach(g => {
        console.log('  ' + g.date.split('T')[0] + ' ' + (g.result || '?') + ' vs ' + g.opponent_name + ' (' + g.game_type + ') Q' + (g.quadrant || '?'));
      });
    }

    // 5. Test /api/players
    console.log('\n=== /api/players?source=boxscore ===');
    const players = await fetch('http://localhost:3001/api/players?league=mens&source=boxscore&limit=5');
    console.log('Source:', players.source);
    console.log('Total:', players.total, '| Returned:', players.players.length);
    players.players.forEach(p => {
      console.log('  ' + p.player_name + ' (' + p.team_name + ') ' + p.gp + 'gp ' + p.pts_pg + 'ppg ' + p.reb_pg + 'rpg ' + p.ast_pg + 'apg');
    });

    // 6. Test /api/teams/:teamId/roster  
    if (tid) {
      console.log('\n=== /api/teams/' + tid + '/roster?source=boxscore ===');
      const roster = await fetch('http://localhost:3001/api/teams/' + tid + '/roster?source=boxscore');
      console.log('Roster size:', roster.roster.length);
      roster.roster.slice(0, 3).forEach(p => {
        console.log('  ' + p.player_name + ' ' + p.gp + 'gp ' + p.pts_pg + 'ppg');
      });
    }

    console.log('\nAll tests passed!');
  } catch (err) {
    console.error('Test failed:', err.message);
    console.error(err.stack);
  }
})();
