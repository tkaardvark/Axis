import { useState, useEffect, useMemo, useCallback } from 'react';
import './Players.css';
import TeamLogo from './TeamLogo';
import ViewToggle from './ViewToggle';
import PlayerVisualizations from './PlayerVisualizations';

import { API_URL } from '../utils/api';
import { normalizeYear, normalizePosition } from '../utils/normalizers';
import { TOOLTIPS } from '../utils/tooltips';
import SkeletonLoader from './SkeletonLoader';
import { exportToCSV } from '../utils/csv';

// Stat group configurations for players
const STAT_GROUPS = {
  Overview: {
    columns: [
      { key: 'gp', label: 'GP', format: 'int' },
      { key: 'min_pg', label: 'MPG', format: 'rating1' },
      { key: 'pts_pg', label: 'PPG', format: 'rating1' },
      { key: 'reb_pg', label: 'RPG', format: 'rating1' },
      { key: 'ast_pg', label: 'APG', format: 'rating1' },
      { key: 'stl_pg', label: 'SPG', format: 'rating1' },
      { key: 'blk_pg', label: 'BPG', format: 'rating1' },
      { key: 'fg_pct', label: 'FG%', format: 'pct1' },
      { key: 'fg3_pct', label: '3P%', format: 'pct1' },
      { key: 'ft_pct', label: 'FT%', format: 'pct1' },
    ],
    defaultSort: { key: 'pts_pg', dir: 'DESC' },
  },
  Scoring: {
    columns: [
      { key: 'gp', label: 'GP', format: 'int' },
      { key: 'pts', label: 'PTS', format: 'int' },
      { key: 'pts_pg', label: 'PPG', format: 'rating1' },
      { key: 'fgm', label: 'FGM', format: 'int' },
      { key: 'fga', label: 'FGA', format: 'int' },
      { key: 'fg_pct', label: 'FG%', format: 'pct1' },
      { key: 'fg3m', label: '3PM', format: 'int' },
      { key: 'fg3a', label: '3PA', format: 'int' },
      { key: 'fg3_pct', label: '3P%', format: 'pct1' },
      { key: 'ftm', label: 'FTM', format: 'int' },
      { key: 'fta', label: 'FTA', format: 'int' },
      { key: 'ft_pct', label: 'FT%', format: 'pct1' },
    ],
    defaultSort: { key: 'pts_pg', dir: 'DESC' },
  },
  Rebounds: {
    columns: [
      { key: 'gp', label: 'GP', format: 'int' },
      { key: 'reb', label: 'REB', format: 'int' },
      { key: 'reb_pg', label: 'RPG', format: 'rating1' },
      { key: 'oreb', label: 'OREB', format: 'int' },
      { key: 'oreb_pg', label: 'ORPG', format: 'rating1' },
      { key: 'dreb', label: 'DREB', format: 'int' },
      { key: 'dreb_pg', label: 'DRPG', format: 'rating1' },
    ],
    defaultSort: { key: 'reb_pg', dir: 'DESC' },
  },
  Playmaking: {
    columns: [
      { key: 'gp', label: 'GP', format: 'int' },
      { key: 'ast', label: 'AST', format: 'int' },
      { key: 'ast_pg', label: 'APG', format: 'rating1' },
      { key: 'turnovers', label: 'TO', format: 'int' },
      { key: 'to_pg', label: 'TOPG', format: 'rating1', lowerIsBetter: true },
      { key: 'ast_to_ratio', label: 'AST/TO', format: 'rating2' },
    ],
    defaultSort: { key: 'ast_pg', dir: 'DESC' },
  },
  Defense: {
    columns: [
      { key: 'gp', label: 'GP', format: 'int' },
      { key: 'stl', label: 'STL', format: 'int' },
      { key: 'stl_pg', label: 'SPG', format: 'rating1' },
      { key: 'blk', label: 'BLK', format: 'int' },
      { key: 'blk_pg', label: 'BPG', format: 'rating1' },
      { key: 'pf', label: 'PF', format: 'int' },
    ],
    defaultSort: { key: 'stl_pg', dir: 'DESC' },
  },
  Clutch: {
    columns: [
      { key: 'gp', label: 'GP', format: 'int' },
      { key: 'clutch_games', label: 'CG', format: 'int' },
      { key: 'clutch_pts', label: 'CPTS', format: 'int' },
      { key: 'clutch_ppg', label: 'CPPG', format: 'rating1' },
      { key: 'clutch_fgm', label: 'CFGM', format: 'int' },
      { key: 'clutch_fga', label: 'CFGA', format: 'int' },
      { key: 'clutch_fg_pct', label: 'CFG%', format: 'pct1' },
      { key: 'clutch_ftm', label: 'CFTM', format: 'int' },
      { key: 'clutch_fta', label: 'CFTA', format: 'int' },
      { key: 'clutch_ft_pct', label: 'CFT%', format: 'pct1' },
      { key: 'clutch_ast', label: 'CAST', format: 'int' },
      { key: 'clutch_reb', label: 'CREB', format: 'int' },
      { key: 'clutch_to', label: 'CTO', format: 'int' },
    ],
    defaultSort: { key: 'clutch_fgm', dir: 'DESC' },
    boxscoreOnly: true,
  },
};

// Year options for filter
const YEAR_OPTIONS = [
  { value: '', label: 'All Years' },
  { value: 'Fr', label: 'Freshman' },
  { value: 'So', label: 'Sophomore' },
  { value: 'Jr', label: 'Junior' },
  { value: 'Sr', label: 'Senior' },
];

// Position options for filter
const POSITION_OPTIONS = [
  { value: '', label: 'All Positions' },
  { value: 'G', label: 'Guard' },
  { value: 'F', label: 'Forward' },
  { value: 'C', label: 'Center' },
];

function Players({ league, season, conferences, sourceParam = '' }) {
  const [players, setPlayers] = useState([]);
  const [allPlayers, setAllPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vizLoading, setVizLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [statGroup, setStatGroup] = useState('Overview');
  const [view, setView] = useState('table');
  const [filters, setFilters] = useState({
    conference: '',
    team: '',
    position: '',
    year: '',
    minGp: 5,
  });
  const [sort, setSort] = useState(STAT_GROUPS.Overview.defaultSort);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  // Fetch teams for dropdown
  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const url = `${API_URL}/api/teams?league=${league}&season=${season}${sourceParam}`;
        const response = await fetch(url);
        const data = await response.json();
        // Sort teams alphabetically by name
        const sortedTeams = (Array.isArray(data) ? data : []).sort((a, b) => 
          a.name.localeCompare(b.name)
        );
        setTeams(sortedTeams);
      } catch (error) {
        console.error('Error fetching teams:', error);
        setTeams([]);
      }
    };
    fetchTeams();
  }, [league, season]);

  // Filter teams based on selected conference
  const filteredTeams = useMemo(() => {
    if (!filters.conference) return teams;
    return teams.filter(t => t.conference === filters.conference);
  }, [teams, filters.conference]);

  // Fetch players when filters/sort change
  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${API_URL}/api/players?league=${league}&season=${season}${sourceParam}`;
      url += `&sort_by=${sort.key}&sort_order=${sort.dir}`;
      url += `&limit=${pageSize}&offset=${page * pageSize}`;
      url += `&min_gp=${filters.minGp}`;
      if (statGroup === 'Clutch') {
        url += `&stat_group=Clutch`;
      }
      
      if (filters.conference) {
        url += `&conference=${encodeURIComponent(filters.conference)}`;
      }
      if (filters.team) {
        url += `&team=${encodeURIComponent(filters.team)}`;
      }
      if (filters.position) {
        url += `&position=${encodeURIComponent(filters.position)}`;
      }
      if (filters.year) {
        url += `&year=${encodeURIComponent(filters.year)}`;
      }

      const response = await fetch(url);
      const data = await response.json();
      setPlayers(data.players || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('Error fetching players:', error);
      setPlayers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [league, season, sort, page, filters, sourceParam, statGroup]);

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  // Fetch all players for visualizations
  const fetchAllPlayers = useCallback(async () => {
    setVizLoading(true);
    try {
      // Fetch all players for visualizations (no limit)
      const url = `${API_URL}/api/players?league=${league}&season=${season}${sourceParam}&sort_by=pts_pg&sort_order=DESC&limit=10000&min_gp=0`;
      const response = await fetch(url);
      const data = await response.json();
      setAllPlayers(data.players || []);
    } catch (error) {
      console.error('Error fetching all players:', error);
      setAllPlayers([]);
    } finally {
      setVizLoading(false);
    }
  }, [league, season, sourceParam]);

  // Fetch all players when switching to visualizations view
  useEffect(() => {
    if (view === 'charts' && allPlayers.length === 0) {
      fetchAllPlayers();
    }
  }, [view, allPlayers.length, fetchAllPlayers]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [filters, sort]);

  // Reset sort when stat group changes
  useEffect(() => {
    const groupConfig = STAT_GROUPS[statGroup];
    if (groupConfig) {
      setSort(groupConfig.defaultSort);
    }
  }, [statGroup]);

  // Filter allPlayers for visualizations based on current filters
  const filteredPlayersForViz = useMemo(() => {
    if (!allPlayers || allPlayers.length === 0) return [];
    
    return allPlayers.filter(player => {
      // Conference filter
      // Conference filter
      if (filters.conference && player.conference !== filters.conference) {
        return false;
      }
      // Team filter
      if (filters.team && player.team_name !== filters.team) {
        return false;
      }
      // Position filter
      if (filters.position && player.position !== filters.position) {
        return false;
      }
      // Year/Class filter
      if (filters.year) {
        const normalizedPlayerYear = normalizeYear(player.year);
        const normalizedFilterYear = normalizeYear(filters.year);
        if (normalizedPlayerYear !== normalizedFilterYear) {
          return false;
        }
      }
      // Min games filter
      if (filters.minGp && player.gp < filters.minGp) {
        return false;
      }
      return true;
    });
  }, [allPlayers, filters]);

  const handleSort = (col) => {
    const key = col.key;
    if (sort.key === key) {
      setSort({ key, dir: sort.dir === 'DESC' ? 'ASC' : 'DESC' });
    } else {
      setSort({ key, dir: col.lowerIsBetter ? 'ASC' : 'DESC' });
    }
  };

  const formatValue = (value, format) => {
    if (value === null || value === undefined) return '-';
    
    switch (format) {
      case 'int':
        return Math.round(value);
      case 'rating1':
        return parseFloat(value).toFixed(1);
      case 'rating2':
        return parseFloat(value).toFixed(2);
      case 'pct1':
        return `${parseFloat(value).toFixed(1)}%`;
      default:
        return value;
    }
  };

  const groupConfig = STAT_GROUPS[statGroup];
  const columns = groupConfig?.columns || STAT_GROUPS.Overview.columns;

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="players-page">
      <div className="page-header">
        <h1>Players</h1>
        <p className="page-subtitle">
          Individual player statistics for {league === 'mens' ? "men's" : "women's"} basketball
        </p>
      </div>

      {/* View Toggle */}
      <ViewToggle activeView={view} onViewChange={setView} />

      {/* Filters */}
      <div className="players-filters">
        <div className="filter-row">
          <div className="filter-group">
            <label>Conference</label>
            <select
              value={filters.conference}
              onChange={(e) => setFilters(f => ({ ...f, conference: e.target.value, team: '' }))}
            >
              <option value="">All Conferences</option>
              {conferences.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Team</label>
            <select
              value={filters.team}
              onChange={(e) => setFilters(f => ({ ...f, team: e.target.value }))}
            >
              <option value="">All Teams</option>
              {filteredTeams.map(t => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Position</label>
            <select
              value={filters.position}
              onChange={(e) => setFilters(f => ({ ...f, position: e.target.value }))}
            >
              {POSITION_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Class</label>
            <select
              value={filters.year}
              onChange={(e) => setFilters(f => ({ ...f, year: e.target.value }))}
            >
              {YEAR_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Min Games</label>
            <input
              type="number"
              min="0"
              max="50"
              value={filters.minGp}
              onChange={(e) => setFilters(f => ({ ...f, minGp: parseInt(e.target.value) || 0 }))}
            />
          </div>

          <div className="filter-actions">
            <button 
              className="reset-btn" 
              onClick={() => setFilters({
                conference: '',
                team: '',
                position: '',
                year: '',
                minGp: 5,
              })}
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {view === 'table' ? (
        <>
          {/* Stat Group Tabs */}
          <div className="stat-group-tabs">
            {Object.keys(STAT_GROUPS).filter(group => {
              // Only show boxscoreOnly tabs when not in legacy mode
              if (STAT_GROUPS[group].boxscoreOnly && sourceParam === '&source=legacy') {
                return false;
              }
              return true;
            }).map(group => (
              <button
                key={group}
                className={`stat-group-tab ${statGroup === group ? 'active' : ''}`}
                onClick={() => setStatGroup(group)}
              >
                {group}
              </button>
            ))}
          </div>

      {/* Table */}
      <div className="players-table-wrapper">
        <div className="teams-table-toolbar">
          <span className="teams-count">{total} players</span>
          <button className="export-csv-btn" onClick={() => {
            const csvCols = [
              { key: 'name', label: 'Player' },
              { key: 'team_name', label: 'Team' },
              { key: 'position', label: 'Pos' },
              { key: 'year', label: 'Year' },
              ...columns.map(c => ({ key: c.key, label: c.label })),
            ];
            exportToCSV(players, csvCols, `axis-players-${statGroup.toLowerCase()}`, (row, colKey) => {
              if (colKey === 'position') return normalizePosition(row.position);
              if (colKey === 'year') return normalizeYear(row.year);
              const val = row[colKey];
              if (val === null || val === undefined) return '';
              return val;
            });
          }} title="Export to CSV">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </button>
        </div>
        {loading ? (
          <SkeletonLoader variant="table" rows={10} />
        ) : (
          <div className="players-table-container">
            <table className="players-table">
              <thead>
                <tr>
                  <th className="rank-col">#</th>
                  <th className="player-col">Player</th>
                  <th className="team-col">Team</th>
                  <th className="pos-col">Pos</th>
                  <th className="year-col">Yr</th>
                  {columns.map(col => (
                    <th
                      key={col.key}
                      className={`stat-col sortable ${sort.key === col.key ? 'sorted' : ''}`}
                      onClick={() => handleSort(col)}
                      title={TOOLTIPS[col.key] || col.label}
                    >
                      {col.label}
                      {sort.key === col.key && (
                        <span className="sort-arrow">{sort.dir === 'DESC' ? '▼' : '▲'}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {players.map((player, index) => (
                  <tr key={player.player_id}>
                    <td className="rank-col">{page * pageSize + index + 1}</td>
                    <td className="player-col">
                      <span className="player-uniform">#{player.uniform}</span>
                      <span className="player-name">{player.first_name} {player.last_name}</span>
                    </td>
                    <td className="team-col">
                      <div className="team-cell">
                        <TeamLogo
                          logoUrl={player.team_logo_url}
                          teamName={player.team_name}
                          primaryColor={player.team_primary_color}
                          size={24}
                        />
                        <span className="team-name">{player.team_name}</span>
                      </div>
                    </td>
                    <td className="pos-col">{normalizePosition(player.position)}</td>
                    <td className="year-col">{normalizeYear(player.year)}</td>
                    {columns.map(col => (
                      <td key={col.key} className="stat-col">
                        {formatValue(player[col.key], col.format)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  disabled={page === 0}
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                >
                  Previous
                </button>
                <span className="page-info">
                  Page {page + 1} of {totalPages} ({total} players)
                </span>
                <button
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
        </>
      ) : (
        <PlayerVisualizations
          players={filteredPlayersForViz}
          loading={vizLoading}
          isAllConferences={!filters.conference}
        />
      )}
    </div>
  );
}

export default Players;
