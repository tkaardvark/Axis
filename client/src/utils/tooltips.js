/**
 * Consolidated tooltip descriptions for all stat columns across the site.
 * Merged from TeamsTable, Scout, and Bracketcast definitions.
 * Import this instead of defining TOOLTIPS locally in each component.
 */
export const TOOLTIPS = {
  // ── Basic Stats ──
  games_played: 'Games Played - Total NAIA games played this season',
  record: 'Win-Loss Record',
  wins: 'Total Wins',
  losses: 'Total Losses',
  win_pct: 'NAIA Win Percentage - Wins / Games Played (NAIA games only)',

  // ── Ratings ──
  adjusted_net_rating: 'Adjusted Net Rating - Offensive Rating minus Defensive Rating, adjusted for strength of schedule. Higher is better.',
  adjusted_offensive_rating: 'Adjusted Offensive Rating - Points per 100 possessions, adjusted for opponent defensive strength',
  adjusted_defensive_rating: 'Adjusted Defensive Rating - Points allowed per 100 possessions, adjusted for opponent offensive strength. Lower is better.',
  net_rating: 'Net Rating (ORTG - DRTG) - Points scored minus points allowed per 100 possessions. Shows overall team efficiency margin.',
  net_efficiency: 'Net Efficiency - Offensive Rating minus Defensive Rating',
  offensive_rating: 'Offensive Rating - Points scored per 100 possessions. Higher is better.',
  defensive_rating: 'Defensive Rating - Points allowed per 100 possessions. Lower is better.',

  // ── Schedule Strength ──
  strength_of_schedule: 'Strength of Schedule - Average quality of opponents faced',
  sos: 'Strength of Schedule - Average quality of opponents faced',
  sos_rank: 'SOS Rank - Strength of Schedule ranking',
  nsos: 'Net Strength of Schedule - Average opponent net rating',
  osos: 'Offensive SOS - Average opponent offensive rating',
  dsos: 'Defensive SOS - Average opponent defensive rating',
  rpi: 'RPI - Rating Percentage Index: WP(0.30) + OWP(0.50) + OOWP(0.20)',
  rpi_rank: 'RPI Rank - Team ranking based on Rating Percentage Index',
  opponent_win_pct: 'Opponent Win Percentage - Average win% of opponents faced',
  opponent_opponent_win_pct: "Opponents' Opponent Win% - Average win% of opponents' opponents",
  owp: 'OWP - Opponent Win Percentage (NAIA games only)',
  oowp: "OOWP - Opponent's Opponent Win Percentage (NAIA games only)",

  // ── Four Factors ──
  efg_pct: 'Effective Field Goal % - Adjusts FG% to account for 3-pointers being worth more. Formula: (FGM + 0.5 × 3PM) / FGA',
  efg_pct_opp: 'Opponent eFG% - Measures defensive effectiveness at limiting efficient shooting. Lower is better.',
  turnover_pct: 'Turnover Percentage - Turnovers per 100 possessions. Lower is better.',
  turnover_pct_opp: 'Opponent Turnover% - Turnovers forced per 100 opponent possessions. Higher is better.',
  to_rate: 'Turnover Rate - Turnovers per 100 possessions. Lower is better.',
  to_rate_opp: 'Opponent Turnover Rate - Turnovers forced per 100 opponent possessions. Higher is better (more forced turnovers).',
  oreb_pct: 'Offensive Rebound % - Percentage of available offensive rebounds grabbed. Shows second-chance opportunity creation.',
  dreb_pct: 'Defensive Rebound % - Percentage of available defensive rebounds grabbed. Shows ability to end opponent possessions.',
  oreb_pct_opp: 'Opponent Offensive Rebound % - Percentage of offensive rebounds allowed to opponent. Lower is better.',
  dreb_pct_opp: 'Opponent DREB% - % of defensive rebounds by opponents',
  ft_rate: 'Free Throw Rate - Free throw attempts per field goal attempt. Shows ability to get to the line.',
  ft_pct: 'Free Throw Percentage',

  // ── Shooting ──
  points_per_game: 'Points Per Game',
  points_allowed_per_game: 'Points Allowed Per Game',
  fg_pct: 'Field Goal Percentage',
  fg3_pct: 'Three-Point Field Goal Percentage',
  fg_pct_opp: 'Opponent FG% - Field goal percentage allowed. Lower is better.',
  fg3_pct_opp: 'Opponent 3P% - Three-point percentage allowed. Lower is better.',
  three_pt_rate: '3-Point Rate - Percentage of field goal attempts that are 3-pointers. Shows how often a team shoots from deep.',
  pts_paint_per_game: 'Points in Paint Per Game - Shows inside scoring ability.',
  pts_fastbreak_per_game: 'Fastbreak Points Per Game - Shows transition offense success.',

  // ── Rebounding ──
  reb_per_game: 'Rebounds Per Game',
  oreb_per_game: 'Offensive Rebounds Per Game',
  dreb_per_game: 'Defensive Rebounds Per Game',
  stl_per_game: 'Steals Per Game',
  blk_per_game: 'Blocks Per Game',
  stl_pct: 'Steal Percentage - Steals per 100 opponent possessions',
  blk_pct: 'Block Percentage - Blocks per 100 opponent 2-point attempts',

  // ── Playmaking ──
  pace: 'Pace - Possessions per game. Measures game tempo.',
  possessions_per_game: 'Possessions Per Game - Estimates game tempo. Higher = faster pace, more possessions per game.',
  ast_per_game: 'Assists Per Game',
  to_per_game: 'Turnovers Per Game. Lower is better.',
  ast_to_ratio: 'Assist-to-Turnover Ratio - Higher values indicate better ball control and decision making.',
  pf_per_game: 'Personal Fouls Per Game',
  pts_off_to_per_game: 'Points Off Turnovers Per Game',
  opp_pts_off_to_per_game: 'Opponent Points Off Turnovers - Points given up from turnovers. Lower is better.',
  pts_bench_per_game: 'Bench Points Per Game - Points from non-starters',
  pts_second_chance_per_game: 'Second Chance Points Per Game',
  pts_second_chance_per_game_opp: 'Opponent Second Chance Points Per Game',
  pts_off_to_per_game_opp: 'Opponent Points Off Turnovers Per Game',

  // ── Defense ──
  opp_pts_paint_per_game: 'Opponent Points in Paint - Paint points allowed. Lower is better.',
  pts_paint_per_game_opp: 'Opponent Points in Paint Per Game',
  opp_pts_fastbreak_per_game: 'Opponent Fastbreak Points - Fastbreak points allowed. Lower is better.',
  pts_fastbreak_per_game_opp: 'Opponent Fastbreak Points Per Game',
  opp_ast_per_game: 'Opponent Assists Per Game - Assists allowed. Lower is better.',

  // ── Experimental ──
  qwi: 'Quality Win Index - Weighted sum of quadrant wins minus quadrant losses. Q1W×1.0 - Q1L×0.25 + Q2W×0.6 - Q2L×0.5 + Q3W×0.3 - Q3L×0.75 + Q4W×0.1 - Q4L×1.0',
  power_index: 'Power Index - Composite metric: 35% AdjORTG + 35% Inverted AdjDRTG + 15% SOS + 7.5% NAIA Win% + 7.5% QWI',

  // ── Game Flow ──
  lead_changes_per_game: 'Lead Changes Per Game - Average number of lead changes. Higher values indicate more competitive games.',
  ties_per_game: 'Times Tied Per Game - Average number of ties. Higher values indicate more back-and-forth games.',
  avg_largest_lead: 'Average Largest Lead - Average of the largest lead held in each game. Higher means more dominant performances.',
  avg_opp_largest_lead: 'Average Opponent Largest Lead - Average of the largest lead opponents hold. Lower is better.',
  close_record: 'Close Game Record - Win-Loss record in games decided by 5 or fewer points.',
  blowout_record: 'Blowout Record - Win-Loss record in games decided by 15 or more points.',
  half_lead_win_pct: 'Lead at Half Win% - Win percentage when leading at halftime. Shows ability to close out games.',
  comeback_win_pct: 'Comeback Win% - Win percentage when trailing at halftime. Shows resilience and second-half adjustments.',
  second_chance_per_game: 'Second Chance Points Per Game - Points scored on offensive rebounds.',
  opp_second_chance_per_game: 'Opponent Second Chance Pts - Second chance points allowed per game. Lower is better.',
  runs_scored_per_game: '10-0 Runs Per Game - Average number of 10+ point unanswered scoring runs per game.',
  runs_allowed_per_game: '10-0 Runs Allowed Per Game - Average 10+ point unanswered runs allowed per game. Lower is better.',

  // ── Bracketcast-specific ──
  rank: 'Rank - Dynamic ranking based on current sort column',
  area: 'Geographic Area - East, Midwest, North, South, or West',
  total_win_pct: 'Total WP - Win percentage from all games (used for overall evaluation)',
  naia_win_pct: 'NAIA WP - Win percentage from NAIA games only (used in RPI formula)',
  q1: 'Quadrant 1 Record - Wins/Losses vs top opponents (Home: 1-45, Neutral: 55, Away: 65)',
  q2: 'Quadrant 2 Record - Wins/Losses vs good opponents (Home: 46-90, Neutral: 56-105, Away: 66-120)',
  q3: 'Quadrant 3 Record - Wins/Losses vs average opponents (Home: 91-135, Neutral: 106-150, Away: 121-165)',
  q4: 'Quadrant 4 Record - Wins/Losses vs weaker opponents (Home: 136+, Neutral: 150+, Away: 166+)',
  qwp: 'Quad Win Points - Q1 win = 4pts, Q2 win = 2pts, Q3 win = 1pt, Q4 win = 0.5pts',
  pcr: 'Primary Criteria Ranking - Composite rank from Overall Win %, RPI, and QWP',
  pr: 'Projected Rank - PCR with conference champions guaranteed top 64',
};
