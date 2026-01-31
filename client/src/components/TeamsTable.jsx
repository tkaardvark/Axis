import { useState, useMemo } from 'react';
import './TeamsTable.css';
import TeamLogo from './TeamLogo';

// Columns that should show sub-rankings with conditional formatting
// sortLowerFirst: true means lower values get rank 1 (like defense)
// All columns show orange for good rankings for visual consistency
const RANKED_COLUMNS = {
  adjusted_net_rating: { sortLowerFirst: false },
  adjusted_offensive_rating: { sortLowerFirst: false },
  adjusted_defensive_rating: { sortLowerFirst: true },  // Lower defensive rating = better
};

// Tooltip descriptions for all stats
const TOOLTIPS = {
  // Basic stats
  games_played: 'Games Played - Total NAIA games played this season',
  record: 'Win-Loss Record',
  wins: 'Total Wins',
  losses: 'Total Losses',
  win_pct: 'NAIA Win Percentage - Wins / Games Played (NAIA games only)',

  // Ratings
  adjusted_net_rating: 'Adjusted Net Rating - Offensive Rating minus Defensive Rating, adjusted for strength of schedule. Higher is better.',
  adjusted_offensive_rating: 'Adjusted Offensive Rating - Points per 100 possessions, adjusted for opponent defensive strength',
  adjusted_defensive_rating: 'Adjusted Defensive Rating - Points allowed per 100 possessions, adjusted for opponent offensive strength. Lower is better.',
  net_rating: 'Net Rating - Offensive Rating minus Defensive Rating (unadjusted)',
  offensive_rating: 'Offensive Rating (ORTG) - Points scored per 100 possessions',
  defensive_rating: 'Defensive Rating (DRTG) - Points allowed per 100 possessions. Lower is better.',

  // Schedule strength
  strength_of_schedule: 'Strength of Schedule - Average quality of opponents faced',
  nsos: 'Net Strength of Schedule - Average opponent net rating',
  osos: 'Offensive SOS - Average opponent offensive rating',
  dsos: 'Defensive SOS - Average opponent defensive rating',
  rpi: 'Rating Percentage Index - 25% Win%, 50% Opp Win%, 25% Opp Opp Win%',
  opponent_win_pct: 'Opponent Win Percentage - Average win% of opponents faced',
  opponent_opponent_win_pct: "Opponents' Opponent Win% - Average win% of opponents' opponents",

  // Four Factors
  efg_pct: 'Effective FG% - (FGM + 0.5 × 3PM) / FGA. Accounts for 3-pointers being worth more.',
  efg_pct_opp: 'Opponent Effective FG% - eFG% allowed to opponents. Lower is better.',
  turnover_pct: 'Turnover Percentage - Turnovers per 100 possessions. Lower is better.',
  turnover_pct_opp: 'Opponent Turnover% - Turnovers forced per 100 opponent possessions',
  oreb_pct: 'Offensive Rebound% - % of available offensive rebounds grabbed',
  dreb_pct: 'Defensive Rebound% - % of available defensive rebounds grabbed',
  oreb_pct_opp: 'Opponent OREB% - % of offensive rebounds allowed. Lower is better.',
  dreb_pct_opp: 'Opponent DREB% - % of defensive rebounds by opponents',
  ft_rate: 'Free Throw Rate - FTA / FGA. Measures ability to get to the line.',
  ft_pct: 'Free Throw Percentage - FTM / FTA',

  // Shooting
  points_per_game: 'Points Per Game - Average points scored',
  points_allowed_per_game: 'Points Allowed Per Game - Average points given up. Lower is better.',
  fg_pct: 'Field Goal Percentage - FGM / FGA',
  fg3_pct: '3-Point Percentage - 3PM / 3PA',
  fg_pct_opp: 'Opponent FG% - FG% allowed. Lower is better.',
  fg3_pct_opp: 'Opponent 3P% - 3P% allowed. Lower is better.',
  three_pt_rate: '3-Point Rate - 3PA / FGA. Measures shot selection.',
  pts_paint_per_game: 'Points in Paint Per Game',
  pts_fastbreak_per_game: 'Fastbreak Points Per Game',

  // Rebounding
  reb_per_game: 'Rebounds Per Game - Total rebounds',
  oreb_per_game: 'Offensive Rebounds Per Game',
  dreb_per_game: 'Defensive Rebounds Per Game',
  stl_per_game: 'Steals Per Game',
  blk_per_game: 'Blocks Per Game',

  // Playmaking
  ast_per_game: 'Assists Per Game',
  to_per_game: 'Turnovers Per Game. Lower is better.',
  pts_off_to_per_game: 'Points Off Turnovers Per Game - Points scored from opponent turnovers',
  opp_pts_off_to_per_game: 'Opponent Points Off Turnovers - Points given up from turnovers. Lower is better.',
  pts_bench_per_game: 'Bench Points Per Game - Points from non-starters',
  pf_per_game: 'Personal Fouls Per Game',

  // Defense
  opp_pts_paint_per_game: 'Opponent Points in Paint - Paint points allowed. Lower is better.',
  opp_pts_fastbreak_per_game: 'Opponent Fastbreak Points - Fastbreak points allowed. Lower is better.',

  // Experimental
  qwi: 'Quality Win Index - Weighted sum of quadrant wins minus quadrant losses. Q1W×1.0 - Q1L×0.25 + Q2W×0.6 - Q2L×0.5 + Q3W×0.3 - Q3L×0.75 + Q4W×0.1 - Q4L×1.0',
  power_index: 'Power Index - Composite metric: 35% AdjORTG + 35% Inverted AdjDRTG + 15% SOS + 7.5% NAIA Win% + 7.5% QWI',
};

// Column definitions for each stat group
const STAT_GROUPS = {
  Overview: {
    columns: [
      { key: 'games_played', label: 'GP', format: 'int' },
      { key: 'record', label: 'Record', format: 'record', sortKey: 'wins' },
      { key: 'win_pct', label: 'NAIA Win%', format: 'pct3' },
      { key: 'adjusted_net_rating', label: 'AdjNET', format: 'rating2', showRank: true },
      { key: 'adjusted_offensive_rating', label: 'AdjO', format: 'rating2', showRank: true },
      { key: 'adjusted_defensive_rating', label: 'AdjD', format: 'rating2', lowerIsBetter: true, showRank: true },
      { key: 'net_rating', label: 'NET', format: 'rating2' },
      { key: 'offensive_rating', label: 'ORTG', format: 'rating2' },
      { key: 'defensive_rating', label: 'DRTG', format: 'rating2', lowerIsBetter: true },
    ],
    defaultSort: { key: 'adjusted_net_rating', dir: 'desc' },
  },
  Shooting: {
    columns: [
      { key: 'games_played', label: 'GP', format: 'int' },
      { key: 'record', label: 'Record', format: 'record', sortKey: 'wins' },
      { key: 'points_per_game', label: 'PPG', format: 'rating' },
      { key: 'offensive_rating', label: 'ORTG', format: 'rating' },
      { key: 'efg_pct', label: 'eFG%', format: 'pct1' },
      { key: 'fg_pct', label: 'FG%', format: 'pct1' },
      { key: 'fg3_pct', label: '3P%', format: 'pct1' },
      { key: 'ft_pct', label: 'FT%', format: 'pct1' },
      { key: 'three_pt_rate', label: '3P Rate', format: 'pct1' },
      { key: 'ft_rate', label: 'FT Rate', format: 'pct1' },
      { key: 'pts_paint_per_game', label: 'Paint', format: 'rating' },
      { key: 'pts_fastbreak_per_game', label: 'Fastbreak', format: 'rating' },
    ],
    defaultSort: { key: 'offensive_rating', dir: 'desc' },
  },
  Rebounding: {
    columns: [
      { key: 'games_played', label: 'GP', format: 'int' },
      { key: 'record', label: 'Record', format: 'record', sortKey: 'wins' },
      { key: 'reb_per_game', label: 'RPG', format: 'rating' },
      { key: 'oreb_per_game', label: 'ORPG', format: 'rating' },
      { key: 'dreb_per_game', label: 'DRPG', format: 'rating' },
      { key: 'oreb_pct', label: 'OREB%', format: 'pct1' },
      { key: 'dreb_pct', label: 'DREB%', format: 'pct1' },
      { key: 'oreb_pct_opp', label: 'Opp OREB%', format: 'pct1', lowerIsBetter: true },
    ],
    defaultSort: { key: 'reb_per_game', dir: 'desc' },
  },
  Playmaking: {
    columns: [
      { key: 'games_played', label: 'GP', format: 'int' },
      { key: 'record', label: 'Record', format: 'record', sortKey: 'wins' },
      { key: 'ast_per_game', label: 'APG', format: 'rating' },
      { key: 'to_per_game', label: 'TOPG', format: 'rating', lowerIsBetter: true },
      { key: 'turnover_pct', label: 'TO%', format: 'pct1', lowerIsBetter: true },
      { key: 'turnover_pct_opp', label: 'Forced TO%', format: 'pct1' },
      { key: 'pts_off_to_per_game', label: 'Pts Off TO', format: 'rating' },
      { key: 'opp_pts_off_to_per_game', label: 'Opp Pts Off TO', format: 'rating', lowerIsBetter: true },
    ],
    defaultSort: { key: 'ast_per_game', dir: 'desc' },
  },
  Defense: {
    columns: [
      { key: 'games_played', label: 'GP', format: 'int' },
      { key: 'record', label: 'Record', format: 'record', sortKey: 'wins' },
      { key: 'points_allowed_per_game', label: 'PAPG', format: 'rating', lowerIsBetter: true },
      { key: 'defensive_rating', label: 'DRTG', format: 'rating', lowerIsBetter: true },
      { key: 'efg_pct_opp', label: 'Opp eFG%', format: 'pct1', lowerIsBetter: true },
      { key: 'fg_pct_opp', label: 'Opp FG%', format: 'pct1', lowerIsBetter: true },
      { key: 'fg3_pct_opp', label: 'Opp 3P%', format: 'pct1', lowerIsBetter: true },
      { key: 'stl_per_game', label: 'SPG', format: 'rating' },
      { key: 'blk_per_game', label: 'BPG', format: 'rating' },
      { key: 'opp_pts_paint_per_game', label: 'Opp Paint', format: 'rating', lowerIsBetter: true },
      { key: 'opp_pts_fastbreak_per_game', label: 'Opp FB', format: 'rating', lowerIsBetter: true },
    ],
    defaultSort: { key: 'defensive_rating', dir: 'asc' },
  },
  Schedule: {
    columns: [
      { key: 'games_played', label: 'GP', format: 'int' },
      { key: 'record', label: 'Record', format: 'record', sortKey: 'wins' },
      { key: 'win_pct', label: 'NAIA Win%', format: 'pct3' },
      { key: 'nsos', label: 'Net SOS', format: 'rating2' },
      { key: 'osos', label: 'Off SOS', format: 'rating2' },
      { key: 'dsos', label: 'Def SOS', format: 'rating2' },
      { key: 'opponent_win_pct', label: 'Opp Win%', format: 'pct1' },
      { key: 'opponent_opponent_win_pct', label: "Opp's Opp Win%", format: 'pct1' },
    ],
    defaultSort: { key: 'nsos', dir: 'desc' },
  },
  Experimental: {
    columns: [
      { key: 'games_played', label: 'GP', format: 'int' },
      { key: 'record', label: 'Record', format: 'record', sortKey: 'wins' },
      { key: 'qwi', label: 'QWI', format: 'rating2' },
      { key: 'power_index', label: 'Power Index', format: 'rating2' },
    ],
    defaultSort: { key: 'power_index', dir: 'desc' },
  },
};

function TeamsTable({ teams, loading, statGroup = 'Overview', onTeamClick }) {
  const groupConfig = STAT_GROUPS[statGroup] || STAT_GROUPS.Overview;
  const { columns, defaultSort } = groupConfig;

  const [sort, setSort] = useState({ key: defaultSort.key, dir: defaultSort.dir });

  // Reset sort when stat group changes
  useMemo(() => {
    setSort({ key: defaultSort.key, dir: defaultSort.dir });
  }, [statGroup, defaultSort.key, defaultSort.dir]);

  // Calculate rankings for sub-ranked columns (for inline display)
  const subRankings = useMemo(() => {
    if (!teams || teams.length === 0) return {};

    // Sub-rankings for specific columns
    const subRanks = {};
    Object.entries(RANKED_COLUMNS).forEach(([key, config]) => {
      const sorted = [...teams]
        .filter(t => t[key] != null)
        .sort((a, b) => {
          const aVal = parseFloat(a[key]) || 0;
          const bVal = parseFloat(b[key]) || 0;
          // For sortLowerFirst (like defense), lower values get rank 1
          return config.sortLowerFirst ? aVal - bVal : bVal - aVal;
        });

      subRanks[key] = {};
      sorted.forEach((team, idx) => {
        subRanks[key][team.team_id] = idx + 1;
      });
    });

    return subRanks;
  }, [teams]);

  // Calculate dynamic rank based on current sort column
  const dynamicRankings = useMemo(() => {
    if (!teams || teams.length === 0) return {};

    const sortKey = sort.key;
    // Find the column config to determine if lower is better
    const allColumns = Object.values(STAT_GROUPS).flatMap(g => g.columns);
    const colConfig = allColumns.find(c => (c.sortKey || c.key) === sortKey);
    const lowerIsBetter = colConfig?.lowerIsBetter || false;

    // Sort teams by the current sort key
    const sorted = [...teams]
      .filter(t => {
        if (sortKey === 'name') return true;
        return t[sortKey] != null;
      })
      .sort((a, b) => {
        if (sortKey === 'name') {
          return (a.name || '').localeCompare(b.name || '');
        }
        const aVal = parseFloat(a[sortKey]) || 0;
        const bVal = parseFloat(b[sortKey]) || 0;
        // Rank 1 = best. For lowerIsBetter, lowest value is best.
        return lowerIsBetter ? aVal - bVal : bVal - aVal;
      });

    const ranks = {};
    sorted.forEach((team, idx) => {
      ranks[team.team_id] = idx + 1;
    });

    return ranks;
  }, [teams, sort.key]);

  // Get label for what the rank column is showing
  const getRankLabel = () => {
    const sortKey = sort.key;
    const allColumns = Object.values(STAT_GROUPS).flatMap(g => g.columns);
    const colConfig = allColumns.find(c => (c.sortKey || c.key) === sortKey);
    if (colConfig) {
      return colConfig.label;
    }
    if (sortKey === 'name') return 'Name';
    return 'Rank';
  };

  const handleSort = (col) => {
    const sortKey = col.sortKey || col.key;
    if (col.format === 'record' || col.format === 'naiaRecord') {
      const newDir = sort.key === sortKey && sort.dir === 'desc' ? 'asc' : 'desc';
      setSort({ key: sortKey, dir: newDir });
      return;
    }

    if (sort.key === sortKey) {
      setSort({ key: sortKey, dir: sort.dir === 'desc' ? 'asc' : 'desc' });
    } else {
      setSort({ key: sortKey, dir: col.lowerIsBetter ? 'asc' : 'desc' });
    }
  };

  const handleRankSort = () => {
    // Toggle direction on current sort key when clicking rank
    setSort({ key: sort.key, dir: sort.dir === 'desc' ? 'asc' : 'desc' });
  };

  const handleTeamSort = () => {
    if (sort.key === 'name') {
      setSort({ key: 'name', dir: sort.dir === 'asc' ? 'desc' : 'asc' });
    } else {
      setSort({ key: 'name', dir: 'asc' });
    }
  };

  // Sort teams for display
  const sortedTeams = useMemo(() => {
    if (!teams || teams.length === 0) return [];

    return [...teams].sort((a, b) => {
      const key = sort.key;

      if (key === 'name') {
        const aVal = a.name || '';
        const bVal = b.name || '';
        return sort.dir === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      const aVal = parseFloat(a[key]) || 0;
      const bVal = parseFloat(b[key]) || 0;
      return sort.dir === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [teams, sort.key, sort.dir]);

  // Format cell value based on format type
  const formatValue = (team, col) => {
    const { key, format } = col;

    if (key === 'record') {
      return `${team.wins || 0}-${team.losses || 0}`;
    }
    if (key === 'naia_record') {
      return `${team.naia_wins || 0}-${team.naia_losses || 0}`;
    }

    const value = team[key];
    if (value === null || value === undefined) return '-';

    switch (format) {
      case 'int':
        return Math.round(Number(value));
      case 'rating':
        return Number(value).toFixed(1);
      case 'rating2':
        // 2 decimal places for adjusted/net ratings
        return Number(value).toFixed(2);
      case 'pct1':
        // Convert decimal to percentage (0.493 -> 49.3%)
        return (Number(value) * 100).toFixed(1);
      case 'pct3':
        // Keep as decimal for RPI-style stats
        return Number(value).toFixed(3);
      default:
        return value;
    }
  };

  // Get color class based on rank percentile
  // Orange = good ranking (low rank number), Blue = bad ranking (high rank number)
  const getRankColorClass = (rank, total) => {
    if (!rank || !total) return '';
    const percentile = rank / total;

    // Top 20% = strong orange, top 40% = light orange
    // Bottom 20% = strong blue, bottom 40% = light blue
    if (percentile <= 0.2) return 'rank-hot';
    if (percentile <= 0.4) return 'rank-warm';
    if (percentile >= 0.8) return 'rank-cold';
    if (percentile >= 0.6) return 'rank-cool';
    return '';
  };

  const getSortIndicator = (colKey) => {
    if (sort.key !== colKey) return null;
    return sort.dir === 'desc' ? ' ▼' : ' ▲';
  };

  if (loading) {
    return (
      <div className="teams-table-container">
        <div className="loading">Loading teams...</div>
      </div>
    );
  }

  if (!teams || teams.length === 0) {
    return (
      <div className="teams-table-container">
        <div className="no-data">No teams found</div>
      </div>
    );
  }

  const totalTeams = teams.length;

  return (
    <div className="teams-table-wrapper">
      <div className="teams-table-container">
        <table className="teams-table">
          <thead>
            <tr>
              <th
                className="col-rank col-sticky col-sticky-rank"
                onClick={handleRankSort}
                title={`Rank by ${getRankLabel()} (click to reverse order)`}
              >
                Rank
              </th>
              <th
                className="col-team col-sticky col-sticky-team"
                onClick={handleTeamSort}
                title="Team Name (click to sort alphabetically)"
              >
                Team{getSortIndicator('name')}
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`col-stat ${col.highlight ? 'col-highlight' : ''}`}
                  onClick={() => handleSort(col)}
                  title={TOOLTIPS[col.key] || col.label}
                >
                  {col.label}{getSortIndicator(col.sortKey || col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedTeams.map((team) => (
              <tr key={team.team_id}>
                <td className="col-rank col-sticky col-sticky-rank">
                  {dynamicRankings[team.team_id] || '-'}
                </td>
                <td className="col-team col-sticky col-sticky-team">
                  <div className="team-info">
                    <TeamLogo logoUrl={team.logo_url} teamName={team.name} />
                    <div className="team-details">
                      <span
                        className="team-name team-name-clickable"
                        onClick={() => onTeamClick && onTeamClick(team)}
                      >
                        {team.name}
                      </span>
                      <span className="team-conference">{team.conference || ''}</span>
                    </div>
                  </div>
                </td>
                {columns.map((col) => {
                  const showSubRank = col.showRank && subRankings[col.key];
                  const subRank = showSubRank ? subRankings[col.key][team.team_id] : null;
                  const colorClass = showSubRank
                    ? getRankColorClass(subRank, totalTeams)
                    : '';

                  return (
                    <td
                      key={col.key}
                      className={`col-stat ${col.highlight ? 'col-highlight' : ''} ${colorClass}`}
                    >
                      <span className="stat-value">{formatValue(team, col)}</span>
                      {showSubRank && subRank && (
                        <span className="sub-rank">{subRank}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default TeamsTable;
