import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './TeamModal.css';
import TeamLogo from './TeamLogo';
import { API_URL } from '../utils/api';
import { formatColumnValue, formatDate } from '../utils/formatters';
import SkeletonLoader from './SkeletonLoader';
import useFocusTrap from '../hooks/useFocusTrap';
import { SCOUT_STAT_GROUPS as STAT_GROUPS } from '../utils/statGroups';

function TeamModal({ team, season = '2025-26', onClose, sourceParam = '' }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusTrapRef = useFocusTrap();
  const [splits, setSplits] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statGroup, setStatGroup] = useState('Overview');

  const handleViewScoutReport = () => {
    // Navigate to scout page with current params and team selection
    const params = new URLSearchParams(searchParams);
    params.set('team', team.team_id);
    params.delete('teamModal');
    onClose();
    navigate(`/app/scout?${params.toString()}`);
  };

  useEffect(() => {
    if (!team) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [splitsRes, scheduleRes] = await Promise.all([
          fetch(`${API_URL}/api/teams/${team.team_id}/splits?season=${season}${sourceParam}`),
          fetch(`${API_URL}/api/teams/${team.team_id}/schedule?season=${season}${sourceParam}`)
        ]);
        const splitsData = await splitsRes.json();
        const scheduleData = await scheduleRes.json();
        setSplits(splitsData.splits || []);
        setSchedule(scheduleData.games || []);
      } catch (err) {
        console.error('Error fetching team data:', err);
        setError('Failed to load team data. Please try again.');
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

  // Format value based on column format (uses shared formatter)
  const formatValue = (split, col) => formatColumnValue(split, col);

  // Find overall and conference splits for header
  const overallSplit = splits.find(s => s.split_name === 'Overall');
  const confSplit = splits.find(s => s.split_name === 'Conference');

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
                {team.naia_wins !== undefined ? `${team.naia_wins}-${team.naia_losses}` : '-'}
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
            {error ? (
              <div className="modal-no-data">{error}</div>
            ) : loading ? (
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
                          <span className={`result-${game.result === 'W' ? 'win' : 'loss'}${game.is_forfeit ? ' forfeit' : ''}`}>
                            {game.result}{game.is_forfeit ? ' (F)' : ''}
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
