// Shared stat group configurations used by Scout and TeamModal.
// TeamsTable and Players define their own group configs (different column sets).
export const SCOUT_STAT_GROUPS = {
  Overview: {
    columns: [
      { key: 'games_played', label: 'GP', format: 'int' },
      { key: 'record', label: 'Record', format: 'record' },
      { key: 'win_pct', label: 'Win%', format: 'pct3' },
      { key: 'net_rating', label: 'NET', format: 'rating2' },
      { key: 'offensive_rating', label: 'ORTG', format: 'rating' },
      { key: 'defensive_rating', label: 'DRTG', format: 'rating' },
      { key: 'points_per_game', label: 'PPG', format: 'rating' },
      { key: 'points_allowed_per_game', label: 'PAPG', format: 'rating' },
    ],
  },
  Shooting: {
    columns: [
      { key: 'games_played', label: 'GP', format: 'int' },
      { key: 'record', label: 'Record', format: 'record' },
      { key: 'points_per_game', label: 'PPG', format: 'rating' },
      { key: 'offensive_rating', label: 'ORTG', format: 'rating' },
      { key: 'efg_pct', label: 'eFG%', format: 'pct1' },
      { key: 'fg_pct', label: 'FG%', format: 'pct1' },
      { key: 'fg3_pct', label: '3P%', format: 'pct1' },
      { key: 'ft_pct', label: 'FT%', format: 'pct1' },
      { key: 'three_pt_rate', label: '3P Rate', format: 'pct1' },
      { key: 'ft_rate', label: 'FT Rate', format: 'pct1' },
      { key: 'pts_paint_per_game', label: 'Paint', format: 'rating' },
      { key: 'pts_fastbreak_per_game', label: 'FB', format: 'rating' },
    ],
  },
  Rebounding: {
    columns: [
      { key: 'games_played', label: 'GP', format: 'int' },
      { key: 'record', label: 'Record', format: 'record' },
      { key: 'reb_per_game', label: 'RPG', format: 'rating' },
      { key: 'oreb_per_game', label: 'ORPG', format: 'rating' },
      { key: 'dreb_per_game', label: 'DRPG', format: 'rating' },
      { key: 'oreb_pct', label: 'OREB%', format: 'pct1' },
      { key: 'dreb_pct', label: 'DREB%', format: 'pct1' },
      { key: 'oreb_pct_opp', label: 'Opp OREB%', format: 'pct1' },
      { key: 'stl_per_game', label: 'SPG', format: 'rating' },
      { key: 'blk_per_game', label: 'BPG', format: 'rating' },
    ],
  },
  Playmaking: {
    columns: [
      { key: 'games_played', label: 'GP', format: 'int' },
      { key: 'record', label: 'Record', format: 'record' },
      { key: 'ast_per_game', label: 'APG', format: 'rating' },
      { key: 'to_per_game', label: 'TOPG', format: 'rating' },
      { key: 'turnover_pct', label: 'TO%', format: 'pct1' },
      { key: 'turnover_pct_opp', label: 'Forced TO%', format: 'pct1' },
      { key: 'pts_off_to_per_game', label: 'Pts Off TO', format: 'rating' },
      { key: 'pts_bench_per_game', label: 'Bench Pts', format: 'rating' },
    ],
  },
  Defense: {
    columns: [
      { key: 'games_played', label: 'GP', format: 'int' },
      { key: 'record', label: 'Record', format: 'record' },
      { key: 'points_allowed_per_game', label: 'PAPG', format: 'rating' },
      { key: 'defensive_rating', label: 'DRTG', format: 'rating' },
      { key: 'efg_pct_opp', label: 'Opp eFG%', format: 'pct1' },
      { key: 'fg_pct_opp', label: 'Opp FG%', format: 'pct1' },
      { key: 'fg3_pct_opp', label: 'Opp 3P%', format: 'pct1' },
      { key: 'stl_per_game', label: 'SPG', format: 'rating' },
      { key: 'blk_per_game', label: 'BPG', format: 'rating' },
      { key: 'opp_pts_paint_per_game', label: 'Opp Paint', format: 'rating' },
    ],
  },
};
