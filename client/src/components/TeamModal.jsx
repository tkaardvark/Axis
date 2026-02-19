import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './TeamModal.css';
import TeamLogo from './TeamLogo';
import { API_URL } from '../utils/api';
import SkeletonLoader from './SkeletonLoader';
import useFocusTrap from '../hooks/useFocusTrap';

// Stat group configurations (same as TeamsTable but without rank columns)
const STAT_GROUPS = {
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

function TeamModal({ team, season = '2025-26', onClose, sourceParam = '' }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusTrapRef = useFocusTrap();
  const [splits, setSplits] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statGroup, setStatGroup] = useState('Overview');

  const handleViewScoutReport = () => {
    // Navigate to scout page with current params and team selection
    const params = new URLSearchParams(searchParams);
    params.set('team', team.team_id);
    params.delete('teamModal');
    onClose();
    navigate(`/scout?${params.toString()}`);
  };

  useEffect(() => {
    if (!team) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [splitsRes, scheduleRes] = await Promise.all([
          fetch(`${API_URL}/api/teams/${team.team_id}/splits?season=${season}${sourceParam}`),
          fetch(`${API_URL}/api/teams/${team.team_id}/schedule?season=${season}${sourceParam}`)
        ]);
        const splitsData = await splitsRes.json();
        const scheduleData = await scheduleRes.json();
        setSplits(splitsData.splits || []);
        setSchedule(scheduleData.games || []);
      } catch (error) {
        console.error('Error fetching team data:', error);
        setSplits([]);
        setSchedule([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [team, season]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  if (!team) return null;

  const columns = STAT_GROUPS[statGroup]?.columns || STAT_GROUPS.Overview.columns;

  // Format value based on column format
  const formatValue = (split, col) => {
    if (col.format === 'record') {
      const wins = split.wins ?? '-';
      const losses = split.losses ?? '-';
      return `${wins}-${losses}`;
    }

    const value = split[col.key];
    if (value === null || value === undefined) return '-';

    switch (col.format) {
      case 'int':
        return parseInt(value);
      case 'pct1':
        return (parseFloat(value) * 100).toFixed(1);
      case 'pct3':
        return parseFloat(value).toFixed(3);
      case 'rating':
        return parseFloat(value).toFixed(1);
      case 'rating2':
        return parseFloat(value).toFixed(2);
      default:
        return value;
    }
  };

  // Find overall and conference splits for header
  const overallSplit = splits.find(s => s.split_name === 'Overall');
  const confSplit = splits.find(s => s.split_name === 'Conference');

  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div className="modal-content" onClick={(e) => e.stopPropagation()} ref={focusTrapRef} role="dialog" aria-modal="true" aria-labelledby="team-modal-title">
        <button className="modal-close" onClick={onClose} aria-label="Close modal">×</button>

        {/* Team Header */}
        <div className="modal-header">
          <div className="modal-team-info">
            <TeamLogo logoUrl={team.logo_url} teamName={team.name} />
            <div className="modal-team-details">
              <h2 id="team-modal-title" className="modal-team-name">{team.name}</h2>
              <span className="modal-team-conference">{team.conference}</span>
            </div>
          </div>
          <div className="modal-records">
            {(team.total_wins !== undefined && team.total_losses !== undefined) && (
              <div className="modal-record">
                <span className="record-label">Total Record</span>
                <span className="record-value">
                  {`${team.total_wins}-${team.total_losses}`}
                </span>
              </div>
            )}
            <div className="modal-record">
              <span className="record-label">NAIA Record</span>
              <span className="record-value">
                {overallSplit ? `${overallSplit.wins}-${overallSplit.losses}` : '-'}
              </span>
            </div>
            <div className="modal-record">
              <span className="record-label">Conference</span>
              <span className="record-value">
                {confSplit ? `${confSplit.wins}-${confSplit.losses}` : '-'}
              </span>
            </div>
          </div>
        </div>

        {/* Scout Report Link */}
        <div className="modal-scout-link">
          <button className="scout-link-btn" onClick={handleViewScoutReport}>
            View Full Scout Report →
          </button>
        </div>

        {/* Scrollable content area */}
        <div className="modal-body">
          {/* Stat Group Selector */}
          <div className="modal-filters">
            <div className="filter-group">
              <label>Stat Group</label>
              <select value={statGroup} onChange={(e) => setStatGroup(e.target.value)}>
                <option value="Overview">Overview</option>
                <option value="Shooting">Shooting</option>
                <option value="Rebounding">Rebounding</option>
                <option value="Playmaking">Playmaking</option>
                <option value="Defense">Defense</option>
              </select>
            </div>
          </div>

          {/* Splits Table */}
          <div className="modal-table-container">
            {loading ? (
              <SkeletonLoader variant="modal" />
            ) : splits.length === 0 ? (
              <div className="modal-no-data">No split data available</div>
            ) : (
              <table className="splits-table">
                <thead>
                  <tr>
                    <th className="col-split">Split</th>
                    {columns.map((col) => (
                      <th key={col.key} className="col-stat">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {splits.map((split) => (
                    <tr key={split.split_name}>
                      <td className="col-split">{split.split_name}</td>
                      {columns.map((col) => (
                        <td key={col.key} className="col-stat">
                          {formatValue(split, col)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Schedule Section */}
          {!loading && schedule.length > 0 && (
            <div className="modal-schedule-section">
              <h3 className="modal-section-title">Schedule & Results</h3>
              <table className="schedule-table">
                <thead>
                  <tr>
                    <th className="col-date">Date</th>
                    <th className="col-location">Loc</th>
                    <th className="col-opponent">Opponent</th>
                    <th className="col-type">Type</th>
                    <th className="col-quad">Quad</th>
                    <th className="col-result">Result</th>
                    <th className="col-score">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((game) => (
                    <tr key={game.game_id} className={!game.is_completed ? 'future-game' : ''}>
                      <td className="col-date">{formatDate(game.date)}</td>
                      <td className="col-location">
                        <span className={`location-badge location-${game.location}`}>
                          {game.location === 'home' ? 'H' : game.location === 'away' ? 'A' : 'N'}
                        </span>
                      </td>
                      <td className="col-opponent">
                        {game.opponent_name}
                      </td>
                      <td className="col-type">
                        <span className={`game-type-badge game-type-${game.game_type.toLowerCase().replace(/[-\s]/g, '')}`}>
                          {game.game_type}
                        </span>
                      </td>
                      <td className="col-quad">
                        {game.quadrant ? (
                          <span className={`quad-badge quad-${game.quadrant}`}>
                            Q{game.quadrant}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="col-result">
                        {game.is_completed ? (
                          <span className={`result-${game.result === 'W' ? 'win' : 'loss'}`}>
                            {game.result}
                          </span>
                        ) : game.prediction ? (
                          <span className={`result-predicted result-${game.prediction.predicted_result === 'W' ? 'win' : 'loss'}`}>
                            {game.prediction.predicted_result}
                            <span className="win-prob">{game.prediction.win_probability}%</span>
                          </span>
                        ) : (
                          <span className="result-upcoming">-</span>
                        )}
                      </td>
                      <td className="col-score">
                        {game.is_completed ? (
                          `${game.team_score}-${game.opponent_score}`
                        ) : game.prediction ? (
                          <span className="score-predicted">
                            {game.prediction.team_score}-{game.prediction.opponent_score}
                          </span>
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TeamModal;
