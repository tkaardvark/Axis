import { useState, useEffect, useMemo } from 'react';
import './Bracketcast.css';
import TeamLogo from './TeamLogo';

const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:3001');

// Tooltip descriptions for bracketcast columns
const TOOLTIPS = {
  rank: 'Rank - Dynamic ranking based on current sort column',
  rpi_rank: 'RPI Rank - Team ranking based on Rating Percentage Index',
  area: 'Geographic Area - East, Midwest, North, South, or West',
  record: 'Total Record - All games including non-NAIA (excludes exhibitions)',
  total_win_pct: 'Total WP - Win percentage from all games (used for overall evaluation)',
  naia_win_pct: 'NAIA WP - Win percentage from NAIA games only (used in RPI formula)',
  rpi: 'RPI - Rating Percentage Index: WP(0.30) + OWP(0.50) + OOWP(0.20)',
  q1: 'Quadrant 1 Record - Wins/Losses vs top opponents (Home: 1-45, Neutral: 55, Away: 65)',
  q2: 'Quadrant 2 Record - Wins/Losses vs good opponents (Home: 46-90, Neutral: 56-105, Away: 66-120)',
  q3: 'Quadrant 3 Record - Wins/Losses vs average opponents (Home: 91-135, Neutral: 106-150, Away: 121-165)',
  q4: 'Quadrant 4 Record - Wins/Losses vs weaker opponents (Home: 136+, Neutral: 150+, Away: 166+)',
  qwp: 'Quad Win Points - Q1 win = 4pts, Q2 win = 2pts, Q3 win = 1pt, Q4 win = 0.5pts',
  pcr: 'Primary Criteria Ranking - Composite rank from Overall Win %, RPI, and QWP',
  pr: 'Projected Rank - PCR with conference champions guaranteed top 64',
  net_efficiency: 'Net Efficiency - Offensive Rating minus Defensive Rating',
  sos: 'Strength of Schedule - Average quality of opponents faced',
  sos_rank: 'SOS Rank - Strength of Schedule ranking',
  owp: 'OWP - Opponent Win Percentage (NAIA games only)',
  oowp: 'OOWP - Opponent\'s Opponent Win Percentage (NAIA games only)',
};

const COLUMNS = [
  { key: 'rank', label: 'Rank' }, // Dynamic rank based on current sort
  { key: 'team', label: 'Team' },
  { key: 'area', label: 'Area', sortKey: 'area' },
  { key: 'record', label: 'Record', sortKey: 'total_wins' },
  { key: 'q1', label: 'Q1', sortKey: 'q1_wins' },
  { key: 'q2', label: 'Q2', sortKey: 'q2_wins' },
  { key: 'q3', label: 'Q3', sortKey: 'q3_wins' },
  { key: 'q4', label: 'Q4', sortKey: 'q4_wins' },
  { key: 'qwp', label: 'QWP', sortKey: 'qwp' },
  { key: 'rpi_rank', label: 'RPI Rank', sortKey: 'rpi_rank' },
  { key: 'rpi', label: 'RPI', sortKey: 'rpi' },
  { key: 'pcr', label: 'PCR', sortKey: 'pcr' },
  { key: 'pr', label: 'PR', sortKey: 'pr' },
  { key: 'sos_rank', label: 'SOS Rank', sortKey: 'sos_rank' },
  { key: 'sos', label: 'SOS', sortKey: 'sos' },
  { key: 'total_win_pct', label: 'Total WP', sortKey: 'total_win_pct' },
  { key: 'naia_win_pct', label: 'NAIA WP', sortKey: 'naia_win_pct' },
  { key: 'owp', label: 'OWP', sortKey: 'owp' },
  { key: 'oowp', label: 'OOWP', sortKey: 'oowp' },
];

// Stats where lower values are better (for determining sort direction)
const LOWER_IS_BETTER = new Set([
  'rpi_rank', 'pcr', 'pr', 'sos_rank'
]);

function Bracketcast({ league, season, onTeamClick }) {
  const [data, setData] = useState({ teams: [], bracket: {}, pods: [] });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('table'); // 'table', 'bracket', or 'pods'
  const [sort, setSort] = useState({ key: 'pr', dir: 'asc' });
  const [expandedTeams, setExpandedTeams] = useState(new Set()); // Track expanded teams in Seed Groups
  const [asOfDate, setAsOfDate] = useState(''); // User-selected cutoff date (empty = use all data)

  useEffect(() => {
    const fetchBracketcast = async () => {
      setLoading(true);
      try {
        let url = `${API_URL}/api/bracketcast?league=${league}&season=${season}`;
        if (asOfDate) {
          url += `&asOfDate=${asOfDate}`;
        }
        const response = await fetch(url);
        const result = await response.json();
        setData(result);
      } catch (error) {
        console.error('Failed to fetch bracketcast:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBracketcast();
  }, [league, season, asOfDate]);

  const handleSort = (col) => {
    const sortKey = col.sortKey || col.key;
    if (sortKey === 'team' || col.key === 'rank') return; // Don't sort by team name or rank column

    if (sort.key === sortKey) {
      setSort({ key: sortKey, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
    } else {
      // Default to ascending for "lower is better" stats, descending for others
      const defaultDir = LOWER_IS_BETTER.has(sortKey) ? 'asc' : 'desc';
      setSort({ key: sortKey, dir: defaultDir });
    }
  };

  const calcQWP = (team) =>
    (team.q1_wins || 0) * 4 +
    (team.q2_wins || 0) * 2 +
    (team.q3_wins || 0) * 1 +
    (team.q4_wins || 0) * 0.5;

  const sortedTeams = useMemo(() => {
    if (!data.teams || data.teams.length === 0) return [];

    // Add QWP to each team
    const teamsWithQWP = data.teams.map(t => ({ ...t, qwp: calcQWP(t) }));

    // Rank by each criteria (descending — higher is better)
    const rankDesc = (arr, key) => {
      const sorted = [...arr].sort((a, b) => (b[key] || 0) - (a[key] || 0));
      const ranks = {};
      sorted.forEach((t, i) => { ranks[t.team_id] = i + 1; });
      return ranks;
    };

    const winPctRanks = rankDesc(teamsWithQWP, 'total_win_pct');
    const rpiRanks = rankDesc(teamsWithQWP, 'rpi');
    const qwpRanks = rankDesc(teamsWithQWP, 'qwp');

    // Compute average rank for each team
    const teamsWithAvg = teamsWithQWP.map(t => ({
      ...t,
      pcr_avg: (winPctRanks[t.team_id] + rpiRanks[t.team_id] + qwpRanks[t.team_id]) / 3,
    }));

    // Sort by average rank to assign final PCR position
    const byAvg = [...teamsWithAvg].sort((a, b) => a.pcr_avg - b.pcr_avg);
    const pcrMap = {};
    byAvg.forEach((t, i) => { pcrMap[t.team_id] = i + 1; });

    const teamsWithPCR = teamsWithAvg.map(t => ({ ...t, pcr: pcrMap[t.team_id] }));

    return teamsWithPCR.sort((a, b) => {
      const key = sort.key;
      let aVal = a[key];
      let bVal = b[key];

      // Handle null values
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;

      // String comparison for area
      if (key === 'area') {
        return sort.dir === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      // Numeric comparison
      aVal = parseFloat(aVal) || 0;
      bVal = parseFloat(bVal) || 0;
      return sort.dir === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [data.teams, sort]);

  const getSortIndicator = (col) => {
    const sortKey = col.sortKey || col.key;
    if (sort.key !== sortKey) return null;
    return sort.dir === 'desc' ? ' ▼' : ' ▲';
  };

  const formatQuadrant = (wins, losses) => {
    return `${wins}-${losses}`;
  };

  const getQuadrantClass = (wins, losses, quadrant) => {
    // Color coding based on quadrant performance
    if (quadrant === 1 && wins > 0) return 'quad-good';
    if (quadrant === 4 && losses > 0) return 'quad-bad';
    return '';
  };

  const toggleTeamExpanded = (teamId) => {
    setExpandedTeams(prev => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      return next;
    });
  };

  // Format the as of date
  const formattedAsOfDate = useMemo(() => {
    if (!data.asOfDate) return null;
    const date = new Date(data.asOfDate);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [data.asOfDate]);

  if (loading) {
    return (
      <main className="main-content bracketcast-page">
        <div className="page-header">
          <h1>Bracketcast</h1>
        </div>
        <div className="loading">Loading bracketcast data...</div>
      </main>
    );
  }

  return (
    <main className="main-content bracketcast-page">
      <div className="page-header">
        <h1>Bracketcast</h1>
        <p className="page-subtitle">Selection committee criteria rankings and projected 64-team national tournament bracket</p>
      </div>

      <div className="bracketcast-controls">
        <div className="view-toggle">
          <button
            className={`view-btn ${view === 'table' ? 'active' : ''}`}
            onClick={() => setView('table')}
          >
            Selection Table
          </button>
          <button
            className={`view-btn ${view === 'pods' ? 'active' : ''}`}
            onClick={() => setView('pods')}
          >
            Opening Round Pods
          </button>
          <button
            className={`view-btn ${view === 'bracket' ? 'active' : ''}`}
            onClick={() => setView('bracket')}
          >
            Seed Groups
          </button>
        </div>

        <div className="date-filter">
          <label htmlFor="asOfDate">As of Date:</label>
          <input
            type="date"
            id="asOfDate"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
          />
          {asOfDate && (
            <button 
              className="clear-date-btn"
              onClick={() => setAsOfDate('')}
              title="Clear date filter"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {view === 'table' ? (
        <div className="bracketcast-table-wrapper">
          <div className="bracketcast-table-container">
            <table className="bracketcast-table">
              <thead>
                <tr>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={`col-${col.key} ${col.sortKey ? 'sortable' : ''}`}
                      onClick={() => col.sortKey && handleSort(col)}
                      title={TOOLTIPS[col.key] || col.label}
                    >
                      {col.label}{getSortIndicator(col)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedTeams.map((team, index) => (
                  <tr
                    key={team.team_id}
                    className={team.pr && team.pr <= 64 ? 'in-bracket' : 'bubble'}
                  >
                    <td className="col-rank">
                      {index + 1}
                    </td>
                    <td className="col-team">
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
                          <span className="team-conference">{team.conference || ''}</span>
                        </div>
                      </div>
                    </td>
                    <td className="col-area">
                      <span className={`area-badge area-${team.area?.toLowerCase()}`}>
                        {team.area}
                      </span>
                    </td>
                    <td className="col-record">
                      {team.total_wins}-{team.total_losses}
                    </td>
                    <td className={`col-quadrant ${getQuadrantClass(team.q1_wins, team.q1_losses, 1)}`}>
                      {formatQuadrant(team.q1_wins, team.q1_losses)}
                    </td>
                    <td className={`col-quadrant ${getQuadrantClass(team.q2_wins, team.q2_losses, 2)}`}>
                      {formatQuadrant(team.q2_wins, team.q2_losses)}
                    </td>
                    <td className={`col-quadrant ${getQuadrantClass(team.q3_wins, team.q3_losses, 3)}`}>
                      {formatQuadrant(team.q3_wins, team.q3_losses)}
                    </td>
                    <td className={`col-quadrant ${getQuadrantClass(team.q4_wins, team.q4_losses, 4)}`}>
                      {formatQuadrant(team.q4_wins, team.q4_losses)}
                    </td>
                    <td className="col-qwp">
                      {team.qwp % 1 === 0 ? team.qwp.toFixed(0) : team.qwp.toFixed(1)}
                    </td>
                    <td className="col-rpi_rank">
                      {team.rpi_rank || '-'}
                    </td>
                    <td className="col-rpi">
                      {team.rpi ? team.rpi.toFixed(3) : '-'}
                    </td>
                    <td className="col-pcr">
                      {team.pcr || '-'}
                    </td>
                    <td className="col-pr">
                      {team.pr || '-'}
                    </td>
                    <td className="col-sos_rank">
                      {team.sos_rank || '-'}
                    </td>
                    <td className="col-sos">
                      {team.sos ? team.sos.toFixed(3) : '-'}
                    </td>
                    <td className="col-total_win_pct">
                      {team.total_win_pct ? team.total_win_pct.toFixed(3) : '-'}
                    </td>
                    <td className="col-naia_win_pct">
                      {team.naia_win_pct ? team.naia_win_pct.toFixed(3) : '-'}
                    </td>
                    <td className="col-owp">
                      {team.owp ? team.owp.toFixed(3) : '-'}
                    </td>
                    <td className="col-oowp">
                      {team.oowp ? team.oowp.toFixed(3) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : view === 'pods' ? (
        <div className="pods-projection">
          <p className="pods-description">
            Opening round pods based on geography and conference separation.
            Each #1 seed hosts their pod. Teams travel to the host site for the first two rounds.
          </p>
          <div className="pods-grid">
            {data.pods?.map((pod) => (
              <div key={pod.podNumber} className="pod-card">
                <div className="pod-header">
                  <span className="pod-number">Pod {pod.podNumber}</span>
                  <span className="pod-location">
                    {pod.host.city}, {pod.host.state}
                  </span>
                </div>
                <div className="pod-teams">
                  {/* Host team (seed 1) */}
                  <div className="pod-team host">
                    <span className="pod-seed">1</span>
                    <div className="pod-team-info">
                      <span className="pod-team-name">{pod.host.name}</span>
                      <span className="pod-team-record">{pod.host.record}</span>
                    </div>
                    <span className="pod-distance host-badge">HOST</span>
                  </div>
                  {/* Other teams (seeds 2-4) */}
                  {pod.teams.map((team) => (
                    <div key={team.team_id} className="pod-team">
                      <span className="pod-seed">{team.seed}</span>
                      <div className="pod-team-info">
                        <span className="pod-team-name">{team.name}</span>
                        <span className="pod-team-record">{team.record}</span>
                      </div>
                      <span className="pod-distance">
                        {team.distance === Infinity ? '?' : `${team.distance} mi`}
                      </span>
                    </div>
                  ))}
                  {/* Fill empty slots if fewer than 3 visiting teams */}
                  {pod.teams.length < 3 &&
                    Array.from({ length: 3 - pod.teams.length }).map((_, i) => (
                      <div key={`empty-${i}`} className="pod-team empty">
                        <span className="pod-seed">{pod.teams.length + 2 + i}</span>
                        <div className="pod-team-info">
                          <span className="pod-team-name">TBD</span>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bracket-projection">
          <p className="bracket-description">
            Teams grouped by seed tier. Click a team to see their 4 closest potential host sites.
          </p>
          <div className="bracket-grid">
            {['quad1', 'quad2', 'quad3', 'quad4'].map((quadKey, quadIdx) => (
              <div key={quadKey} className="bracket-quad">
                <h3 className="quad-header">#{quadIdx + 1} Seeds</h3>
                <div className="quad-teams">
                  {data.bracket[quadKey]?.map((team, teamIdx) => (
                    <div key={team.team_id} className="bracket-team-wrapper">
                      <div 
                        className={`bracket-team ${team.isHost ? 'is-host' : 'expandable'} ${expandedTeams.has(team.team_id) ? 'expanded' : ''}`}
                        onClick={() => !team.isHost && toggleTeamExpanded(team.team_id)}
                      >
                        <span className="seed-number">{quadIdx * 16 + teamIdx + 1}</span>
                        <div className="bracket-team-info">
                          <span className="bracket-team-name">{team.name}</span>
                          <span className="bracket-team-meta">
                            {team.city && team.state ? `${team.city}, ${team.state}` : team.conference}
                          </span>
                        </div>
                        <div className="bracket-team-right">
                          <span className="bracket-team-record">{team.record}</span>
                          {team.isHost ? (
                            <span className="host-badge">HOST</span>
                          ) : (
                            <span className={`expand-icon ${expandedTeams.has(team.team_id) ? 'expanded' : ''}`}>
                              ▶
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Expandable potential hosts section */}
                      {expandedTeams.has(team.team_id) && team.potentialHosts && (
                        <div className="potential-hosts">
                          <div className="potential-hosts-header">Most Likely Host Sites:</div>
                          {team.potentialHosts.map((host, idx) => (
                            <div 
                              key={host.team_id} 
                              className={`potential-host ${host.hasConferenceConflict ? 'conf-conflict' : ''}`}
                            >
                              <span className="potential-host-rank">{idx + 1}.</span>
                              <div className="potential-host-info">
                                <span className="potential-host-name">{host.name}</span>
                                <span className="potential-host-location">
                                  {host.city}, {host.state}
                                </span>
                              </div>
                              <span className="potential-host-distance">
                                {host.distance === Infinity ? '?' : `${host.distance.toLocaleString()} mi`}
                              </span>
                            </div>
                          ))}
                          {team.potentialHosts.some(h => h.hasConferenceConflict) && (
                            <div className="conf-conflict-note">
                              * Strikethrough = same conference (unlikely)
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {/* Fill empty slots if fewer than 16 teams */}
                  {data.bracket[quadKey]?.length < 16 &&
                    Array.from({ length: 16 - (data.bracket[quadKey]?.length || 0) }).map((_, i) => (
                      <div key={`empty-${i}`} className="bracket-team-wrapper">
                        <div className="bracket-team empty">
                          <span className="seed-number">{(data.bracket[quadKey]?.length || 0) + i + 1}</span>
                          <div className="bracket-team-info">
                            <span className="bracket-team-name">TBD</span>
                          </div>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

export default Bracketcast;
