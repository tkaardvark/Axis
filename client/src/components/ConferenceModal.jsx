import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './ConferenceModal.css';
import TeamLogo from './TeamLogo';
import { API_URL } from '../utils/api';
import SkeletonLoader from './SkeletonLoader';
import useFocusTrap from '../hooks/useFocusTrap';

// Helper to format date as YYYY-MM-DD for API
const formatDateForAPI = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper to format date for display
const formatDateForDisplay = (date) => {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

function ConferenceModal({ conferenceName, league, season, onClose, onTeamClick, sourceParam = '' }) {
  const focusTrapRef = useFocusTrap();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [games, setGames] = useState([]);
  const [gamesLoading, setGamesLoading] = useState(false);

  // Fetch teams
  useEffect(() => {
    if (!conferenceName) return;

    const fetchTeams = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `${API_URL}/api/teams?league=${league}&season=${season}&conference=${encodeURIComponent(conferenceName)}${sourceParam}`
        );
        const data = await response.json();
        setTeams(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Error fetching conference teams:', error);
        setTeams([]);
      } finally {
        setLoading(false);
      }
    };

    fetchTeams();
  }, [conferenceName, league, season]);

  // Fetch games for selected date
  useEffect(() => {
    if (!conferenceName) return;

    const fetchGames = async () => {
      setGamesLoading(true);
      try {
        const dateStr = formatDateForAPI(selectedDate);
        const response = await fetch(
          `${API_URL}/api/conferences/${encodeURIComponent(conferenceName)}/games?league=${league}&season=${season}&date=${dateStr}${sourceParam}`
        );
        const data = await response.json();
        setGames(data.games || []);
      } catch (error) {
        console.error('Error fetching conference games:', error);
        setGames([]);
      } finally {
        setGamesLoading(false);
      }
    };

    fetchGames();
  }, [conferenceName, league, season, selectedDate]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Sort teams by conference record (wins desc, then losses asc)
  const sortedTeams = useMemo(() => {
    return [...teams].sort((a, b) => {
      const aWins = a.conf_wins || 0;
      const bWins = b.conf_wins || 0;
      const aLosses = a.conf_losses || 0;
      const bLosses = b.conf_losses || 0;

      // First by wins (desc)
      if (bWins !== aWins) return bWins - aWins;
      // Then by losses (asc)
      return aLosses - bLosses;
    });
  }, [teams]);

  // Calculate RPI ranks for display
  const rpiRanks = useMemo(() => {
    const sorted = [...teams]
      .filter(t => t.rpi != null)
      .sort((a, b) => (b.rpi || 0) - (a.rpi || 0));

    const ranks = {};
    sorted.forEach((team, idx) => {
      ranks[team.team_id] = idx + 1;
    });
    return ranks;
  }, [teams]);

  if (!conferenceName) return null;

  const handleTeamClick = (team) => {
    onClose();
    if (onTeamClick) {
      onTeamClick(team);
    }
  };

  const handleViewConferencePage = () => {
    const params = new URLSearchParams(searchParams);
    params.set('conference', conferenceName);
    params.delete('conferenceModal');
    onClose();
    navigate(`/conferences?${params.toString()}`);
  };

  const handlePrevDay = () => {
    setSelectedDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() - 1);
      return newDate;
    });
  };

  const handleNextDay = () => {
    setSelectedDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + 1);
      return newDate;
    });
  };

  const handleToday = () => {
    setSelectedDate(new Date());
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div className="conference-modal-content" onClick={(e) => e.stopPropagation()} ref={focusTrapRef} role="dialog" aria-modal="true" aria-labelledby="conference-modal-title">
        <button className="modal-close" onClick={onClose} aria-label="Close modal">×</button>

        {/* Conference Header */}
        <div className="conference-modal-header">
          <h2 id="conference-modal-title" className="conference-modal-title">{conferenceName}</h2>
          <span className="conference-modal-subtitle">
            {teams.length} Teams • {season} Season
          </span>
        </div>

        {/* Conference Page Link */}
        <div className="modal-conference-link">
          <button className="conference-link-btn" onClick={handleViewConferencePage}>
            View Full Conference Page →
          </button>
        </div>

        {/* Teams Table */}
        <div className="conference-modal-body">
          {loading ? (
            <SkeletonLoader variant="modal" />
          ) : sortedTeams.length === 0 ? (
            <div className="modal-no-data">No teams found</div>
          ) : (
            <table className="conference-standings-table">
              <thead>
                <tr>
                  <th className="col-rank">Rank</th>
                  <th className="col-team">Team</th>
                  <th className="col-conf-record">Conf Record</th>
                  <th className="col-overall-record">Overall</th>
                  <th className="col-rpi-rank">RPI Rank</th>
                  <th className="col-adj-net">Adj NET</th>
                </tr>
              </thead>
              <tbody>
                {sortedTeams.map((team, index) => (
                  <tr
                    key={team.team_id}
                    className={team.is_conference_champion ? 'conference-champion-row' : ''}
                  >
                    <td className="col-rank">{index + 1}</td>
                    <td className="col-team">
                      <div className="team-info">
                        <TeamLogo logoUrl={team.logo_url} teamName={team.name} />
                        <span
                          className="team-name team-name-clickable"
                          onClick={() => handleTeamClick(team)}
                        >
                          {team.name}
                          {team.is_conference_champion && (
                            <span className="champion-badge" title="Conference Champion (Auto-Bid)">🏆</span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="col-conf-record">
                      <span className="conf-record">
                        {team.conf_wins || 0}-{team.conf_losses || 0}
                      </span>
                    </td>
                    <td className="col-overall-record">
                      {team.wins || 0}-{team.losses || 0}
                    </td>
                    <td className="col-rpi-rank">
                      {team.rpi_rank || rpiRanks[team.team_id] || '-'}
                    </td>
                    <td className="col-adj-net">
                      {team.adjusted_net_rating != null
                        ? Number(team.adjusted_net_rating).toFixed(2)
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Conference Schedule Section */}
          <div className="conference-schedule-section">
            <div className="schedule-header">
              <h3 className="schedule-title">Conference Schedule</h3>
              <div className="date-picker">
                <button className="date-nav-btn" onClick={handlePrevDay} title="Previous day">
                  ‹
                </button>
                <span className="selected-date">{formatDateForDisplay(selectedDate)}</span>
                <button className="date-nav-btn" onClick={handleNextDay} title="Next day">
                  ›
                </button>
                <button className="today-btn" onClick={handleToday}>
                  Today
                </button>
              </div>
            </div>

            <div className="schedule-games">
              {gamesLoading ? (
                <SkeletonLoader variant="table" rows={4} />
              ) : games.length === 0 ? (
                <div className="no-games">No games scheduled for this date</div>
              ) : (
                <div className="games-grid">
                  {games.map((game) => (
                    <div
                      key={game.game_id}
                      className={`game-card ${game.is_completed ? 'completed' : 'upcoming'}`}
                    >
                      <div className="game-matchup">
                        <div className="game-team-row">
                          <TeamLogo logoUrl={game.away_team.logo_url} teamName={game.away_team.name} />
                          <span className="game-team-name">{game.away_team.name}</span>
                          {game.is_completed && (
                            <span className={`game-score ${game.away_team.score > game.home_team.score ? 'winner' : ''}`}>
                              {game.away_team.score}
                            </span>
                          )}
                        </div>
                        <div className="game-team-row">
                          <TeamLogo logoUrl={game.home_team.logo_url} teamName={game.home_team.name} />
                          <span className="game-team-name">{game.home_team.name}</span>
                          {game.is_completed && (
                            <span className={`game-score ${game.home_team.score > game.away_team.score ? 'winner' : ''}`}>
                              {game.home_team.score}
                            </span>
                          )}
                        </div>
                      </div>
                      {game.is_completed && (
                        <div className="game-status final">Final</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConferenceModal;
