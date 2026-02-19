import { useState, useMemo, useCallback } from 'react';
import './TeamsTable.css';
import TeamLogo from './TeamLogo';
import SkeletonLoader from './SkeletonLoader';
import { TOOLTIPS } from '../utils/tooltips';
import { exportToCSV } from '../utils/csv';

// Columns that should show sub-rankings with conditional formatting
// sortLowerFirst: true means lower values get rank 1 (like defense)
// All columns show orange for good rankings for visual consistency
const RANKED_COLUMNS = {
  adjusted_net_rating: { sortLowerFirst: false },
  adjusted_offensive_rating: { sortLowerFirst: false },
  adjusted_defensive_rating: { sortLowerFirst: true },  // Lower defensive rating = better
};

// Column definitions for each stat group
const STAT_GROUPS = {
  Efficiency: {
    columns: [
      { key: 'record', label: 'Record', format: 'record', sortKey: 'wins' },
      { key: 'adjusted_net_rating', label: 'AdjNET', format: 'rating2', showRank: true },
      { key: 'adjusted_offensive_rating', label: 'AdjO', format: 'rating2', showRank: true },
      { key: 'adjusted_defensive_rating', label: 'AdjD', format: 'rating2', lowerIsBetter: true, showRank: true },
      { key: 'oreb_pct', label: 'OREB%', format: 'pct1' },
      { key: 'dreb_pct', label: 'DREB%', format: 'pct1' },
      { key: 'turnover_pct', label: 'TO%', format: 'pct1', lowerIsBetter: true },
      { key: 'ft_rate', label: 'FT Rate', format: 'pct1' },
      { key: 'pace', label: 'Pace', format: 'rating' },
    ],
    defaultSort: { key: 'adjusted_net_rating', dir: 'desc' },
  },
  Offense: {
    columns: [
      { key: 'offensive_rating', label: 'ORTG', format: 'rating' },
      { key: 'points_per_game', label: 'PPG', format: 'rating' },
      { key: 'efg_pct', label: 'eFG%', format: 'pct1' },
      { key: 'fg_pct', label: 'FG%', format: 'pct1' },
      { key: 'fg3_pct', label: '3P%', format: 'pct1' },
      { key: 'ft_pct', label: 'FT%', format: 'pct1' },
      { key: 'ast_per_game', label: 'APG', format: 'rating' },
      { key: 'to_per_game', label: 'TOPG', format: 'rating', lowerIsBetter: true },
      { key: 'three_pt_rate', label: '3P Rate', format: 'pct1' },
      { key: 'ft_rate', label: 'FT Rate', format: 'pct1' },
      { key: 'pts_paint_per_game', label: 'Paint', format: 'rating' },
      { key: 'pts_fastbreak_per_game', label: 'Fastbreak', format: 'rating' },
      { key: 'oreb_pct', label: 'OREB%', format: 'pct1' },
    ],
    defaultSort: { key: 'offensive_rating', dir: 'desc' },
  },
  Defense: {
    columns: [
      { key: 'defensive_rating', label: 'DRTG', format: 'rating', lowerIsBetter: true },
      { key: 'points_allowed_per_game', label: 'PAPG', format: 'rating', lowerIsBetter: true },
      { key: 'efg_pct_opp', label: 'Opp eFG%', format: 'pct1', lowerIsBetter: true },
      { key: 'fg_pct_opp', label: 'Opp FG%', format: 'pct1', lowerIsBetter: true },
      { key: 'fg3_pct_opp', label: 'Opp 3P%', format: 'pct1', lowerIsBetter: true },
      { key: 'opp_ast_per_game', label: 'Opp APG', format: 'rating', lowerIsBetter: true },
      { key: 'turnover_pct_opp', label: 'Forced TO%', format: 'pct1' },
      { key: 'opp_pts_paint_per_game', label: 'Opp Paint', format: 'rating', lowerIsBetter: true },
      { key: 'opp_pts_fastbreak_per_game', label: 'Opp FB', format: 'rating', lowerIsBetter: true },
      { key: 'oreb_pct_opp', label: 'Opp OREB%', format: 'pct1', lowerIsBetter: true },
      { key: 'reb_per_game', label: 'RPG', format: 'rating' },
      { key: 'oreb_per_game', label: 'ORPG', format: 'rating' },
      { key: 'dreb_per_game', label: 'DRPG', format: 'rating' },
      { key: 'stl_per_game', label: 'SPG', format: 'rating' },
      { key: 'blk_per_game', label: 'BPG', format: 'rating' },
    ],
    defaultSort: { key: 'defensive_rating', dir: 'asc' },
  },
  Experimental: {
    columns: [
      { key: 'record', label: 'Record', format: 'record', sortKey: 'wins' },
      { key: 'qwi', label: 'QWI', format: 'rating2' },
      { key: 'power_index', label: 'Power Index', format: 'rating2' },
    ],
    defaultSort: { key: 'power_index', dir: 'desc' },
  },
  GameFlow: {
    columns: [
      { key: 'record', label: 'Record', format: 'record', sortKey: 'wins' },
      { key: 'lead_changes_per_game', label: 'LC/G', format: 'rating' },
      { key: 'ties_per_game', label: 'Ties/G', format: 'rating' },
      { key: 'avg_largest_lead', label: 'Avg Lead', format: 'rating' },
      { key: 'avg_opp_largest_lead', label: 'Opp Lead', format: 'rating', lowerIsBetter: true },
      { key: 'close_record', label: 'Close', format: 'record', sortKey: 'close_wins' },
      { key: 'blowout_record', label: 'Blowout', format: 'record', sortKey: 'blowout_wins' },
      { key: 'half_lead_win_pct', label: 'Lead@Half W%', format: 'pct1' },
      { key: 'comeback_win_pct', label: 'Comeback W%', format: 'pct1' },
      { key: 'second_chance_per_game', label: '2nd Ch', format: 'rating' },
      { key: 'opp_second_chance_per_game', label: 'Opp 2nd', format: 'rating', lowerIsBetter: true },
      { key: 'runs_scored_per_game', label: '10-0 Run', format: 'rating2' },
      { key: 'runs_allowed_per_game', label: '10-0 Alwd', format: 'rating2', lowerIsBetter: true },
    ],
    defaultSort: { key: 'avg_largest_lead', dir: 'desc' },
  },
};

function TeamsTable({ teams, loading, statGroup = 'Overview', onTeamClick, onConferenceClick }) {
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
    if (key === 'close_record') {
      return `${team.close_wins || 0}-${team.close_losses || 0}`;
    }
    if (key === 'blowout_record') {
      return `${team.blowout_wins || 0}-${team.blowout_losses || 0}`;
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
        <SkeletonLoader variant="table" rows={10} />
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

  const handleExportCSV = useCallback(() => {
    const exportColumns = [
      { key: 'name', label: 'Team' },
      { key: 'conference', label: 'Conference' },
      ...columns.map(col => ({ key: col.key, label: col.label })),
    ];
    exportToCSV(
      sortedTeams,
      exportColumns,
      `axis-teams-${statGroup.toLowerCase()}`,
      (row, colKey) => {
        if (colKey === 'name' || colKey === 'conference') return row[colKey];
        const col = columns.find(c => c.key === colKey);
        if (!col) return row[colKey];
        return formatValue(row, col);
      }
    );
  }, [sortedTeams, columns, statGroup, formatValue]);

  return (
    <div className="teams-table-wrapper">
      <div className="teams-table-toolbar">
        <span className="teams-count">{totalTeams} teams</span>
        <button className="export-csv-btn" onClick={handleExportCSV} title="Export to CSV">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export CSV
        </button>
      </div>
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
                        {team.is_conference_champion && <span className="champion-badge" title="Conference Champion (Auto-Bid)">🏆</span>}
                      </span>
                      <span
                        className="team-conference team-conference-clickable"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onConferenceClick && team.conference) {
                            onConferenceClick(team.conference);
                          }
                        }}
                      >
                        {team.conference || ''}
                      </span>
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
