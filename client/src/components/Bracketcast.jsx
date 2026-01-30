import { useState, useEffect, useMemo } from 'react';
import './Bracketcast.css';
import TeamLogo from './TeamLogo';

const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:3001');

// Tooltip descriptions for bracketcast columns
const TOOLTIPS = {
  rpi_rank: 'RPI Rank - Team ranking based on Rating Percentage Index',
  area: 'Geographic Area - East, Midwest, North, South, or West',
  record: 'Total Record - All games including non-NAIA (excludes exhibitions)',
  total_win_pct: 'Total WP - Win percentage from all games (used for overall evaluation)',
  naia_win_pct: 'NAIA WP - Win percentage from NAIA games only (used in RPI formula)',
  rpi: 'RPI - Rating Percentage Index: WP(0.30) + OWP(0.50) + OOWP(0.20)',
  q1: 'Quadrant 1 Record - Wins/Losses vs top opponents (Home: 1-45, Neutral: 1-55, Away: 1-65)',
  q2: 'Quadrant 2 Record - Wins/Losses vs good opponents (Home: 46-90, Neutral: 56-105, Away: 66-120)',
  q3: 'Quadrant 3 Record - Wins/Losses vs average opponents (Home: 91-135, Neutral: 106-150, Away: 121-165)',
  q4: 'Quadrant 4 Record - Wins/Losses vs weaker opponents (Home: 136+, Neutral: 150+, Away: 166+)',
  qwp: 'Quad Win Points - Q1 win = 4pts, Q2 win = 2pts, Q3 win = 1pt, Q4 win = 0.5pts',
  pcr: 'Primary Criteria Ranking - Composite rank from Overall Win %, RPI, and QWP',
  net_efficiency: 'Net Efficiency - Offensive Rating minus Defensive Rating',
  sos: 'Strength of Schedule - Average quality of opponents faced',
  sos_rank: 'SOS Rank - Strength of Schedule ranking',
  owp: 'OWP - Opponent Win Percentage (NAIA games only)',
  oowp: 'OOWP - Opponent\'s Opponent Win Percentage (NAIA games only)',
};

const COLUMNS = [
  { key: 'rpi_rank', label: 'Rank', sortKey: 'rpi_rank' },
  { key: 'team', label: 'Team' },
  { key: 'area', label: 'Area', sortKey: 'area' },
  { key: 'record', label: 'Record', sortKey: 'total_wins' },
  { key: 'q1', label: 'Q1', sortKey: 'q1_wins' },
  { key: 'q2', label: 'Q2', sortKey: 'q2_wins' },
  { key: 'q3', label: 'Q3', sortKey: 'q3_wins' },
  { key: 'q4', label: 'Q4', sortKey: 'q4_wins' },
  { key: 'qwp', label: 'QWP', sortKey: 'qwp' },
  { key: 'rpi', label: 'RPI', sortKey: 'rpi' },
  { key: 'pcr', label: 'PCR', sortKey: 'pcr' },
  { key: 'sos_rank', label: 'SOS Rank', sortKey: 'sos_rank' },
  { key: 'sos', label: 'SOS', sortKey: 'sos' },
  { key: 'total_win_pct', label: 'Total WP', sortKey: 'total_win_pct' },
  { key: 'naia_win_pct', label: 'NAIA WP', sortKey: 'naia_win_pct' },
  { key: 'owp', label: 'OWP', sortKey: 'owp' },
  { key: 'oowp', label: 'OOWP', sortKey: 'oowp' },
];

function Bracketcast({ league, onTeamClick }) {
  const [data, setData] = useState({ teams: [], bracket: {}, pods: [] });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('table'); // 'table', 'bracket', or 'pods'
  const [sort, setSort] = useState({ key: 'rpi_rank', dir: 'asc' });

  useEffect(() => {
    const fetchBracketcast = async () => {
      setLoading(true);
      try {
        const response = await fetch(`${API_URL}/api/bracketcast?league=${league}`);
        const result = await response.json();
        setData(result);
      } catch (error) {
        console.error('Failed to fetch bracketcast:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBracketcast();
  }, [league]);

  const handleSort = (col) => {
    const sortKey = col.sortKey || col.key;
    if (sortKey === 'team') return; // Don't sort by team name column

    if (sort.key === sortKey) {
      setSort({ key: sortKey, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
    } else {
      // Default to descending for most stats, ascending for rank
      const defaultDir = (sortKey === 'rpi_rank' || sortKey === 'pcr') ? 'asc' : 'desc';
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

  if (loading) {
    return (
      <main className="main-content bracketcast-page">
        <div className="page-header">
          <h1>NAIA {league === 'mens' ? "Men's" : "Women's"} Basketball Bracketcast</h1>
        </div>
        <div className="loading">Loading bracketcast data...</div>
      </main>
    );
  }

  return (
    <main className="main-content bracketcast-page">
      <div className="page-header">
        <h1>NAIA {league === 'mens' ? "Men's" : "Women's"} Basketball Bracketcast</h1>
        <p className="page-subtitle">Selection Committee Criteria & Bracket Projection</p>
      </div>

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
                {sortedTeams.map((team) => (
                  <tr
                    key={team.team_id}
                    className={team.projected_seed ? 'in-bracket' : 'bubble'}
                  >
                    <td className="col-rpi_rank">
                      {team.rpi_rank || '-'}
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
                    <td className="col-rpi">
                      {team.rpi ? team.rpi.toFixed(3) : '-'}
                    </td>
                    <td className="col-pcr">
                      {team.pcr || '-'}
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
            Teams grouped by seed tier. #1 seeds (1-16 RPI), #2 seeds (17-32 RPI), etc.
          </p>
          <div className="bracket-grid">
            {['quad1', 'quad2', 'quad3', 'quad4'].map((quadKey, quadIdx) => (
              <div key={quadKey} className="bracket-quad">
                <h3 className="quad-header">#{quadIdx + 1} Seeds</h3>
                <div className="quad-teams">
                  {data.bracket[quadKey]?.map((team) => (
                    <div key={team.team_id} className="bracket-team">
                      <span className="seed-number">{team.rpi_rank}</span>
                      <div className="bracket-team-info">
                        <span className="bracket-team-name">{team.name}</span>
                        <span className="bracket-team-record">{team.record}</span>
                      </div>
                    </div>
                  ))}
                  {/* Fill empty slots if fewer than 16 teams */}
                  {data.bracket[quadKey]?.length < 16 &&
                    Array.from({ length: 16 - (data.bracket[quadKey]?.length || 0) }).map((_, i) => (
                      <div key={`empty-${i}`} className="bracket-team empty">
                        <span className="seed-number">{(data.bracket[quadKey]?.length || 0) + i + 1}</span>
                        <div className="bracket-team-info">
                          <span className="bracket-team-name">TBD</span>
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
