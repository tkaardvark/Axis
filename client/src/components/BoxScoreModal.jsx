import { useState, useEffect } from 'react';
import './BoxScoreModal.css';
import TeamLogo from './TeamLogo';

const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:3001');

function BoxScoreModal({ gameId, season, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gameId) return;

    const fetchBoxScore = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/games/${gameId}/boxscore?season=${season}`);
        if (!res.ok) throw new Error('Failed to fetch');
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error('Error fetching box score:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchBoxScore();
  }, [gameId, season]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const formatPct = (val) => {
    if (val === null || val === undefined) return '-';
    return (val * 100).toFixed(1) + '%';
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (!gameId) return null;

  return (
    <div className="boxscore-overlay" onClick={handleOverlayClick}>
      <div className="boxscore-modal">
        <button className="boxscore-close" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {loading ? (
          <div className="boxscore-loading">Loading box score...</div>
        ) : !data ? (
          <div className="boxscore-loading">Box score unavailable</div>
        ) : (
          <>
            <div className="boxscore-header">
              <div className="boxscore-team-side">
                <TeamLogo logoUrl={data.team.logo_url} teamName={data.team.name} size="medium" />
                <div className="boxscore-team-name">{data.team.name}</div>
              </div>
              <div className="boxscore-score-center">
                <div className="boxscore-final-label">{formatDate(data.date)}</div>
                <div className="boxscore-final-score">
                  <span className={data.team.score > data.opponent.score ? 'score-winner' : 'score-loser'}>{data.team.score}</span>
                  <span className="score-separator">-</span>
                  <span className={data.opponent.score > data.team.score ? 'score-winner' : 'score-loser'}>{data.opponent.score}</span>
                </div>
                <div className="boxscore-location">
                  <span className={`location-badge location-${data.location}`}>
                    {data.location === 'home' ? 'Home' : data.location === 'away' ? 'Away' : 'Neutral'}
                  </span>
                </div>
              </div>
              <div className="boxscore-team-side">
                <TeamLogo logoUrl={data.opponent.logo_url} teamName={data.opponent.name} size="medium" />
                <div className="boxscore-team-name">{data.opponent.name}</div>
              </div>
            </div>

            <div className="boxscore-body">
              <table className="boxscore-table">
                <thead>
                  <tr>
                    <th className="stat-label-col"></th>
                    <th className="stat-value-col">{data.team.name}</th>
                    <th className="stat-value-col">{data.opponent.name}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="boxscore-section-header"><td colSpan="3">Shooting</td></tr>
                  <StatRow label="Field Goals" team={`${data.team.stats.fgm || 0}-${data.team.stats.fga || 0}`} opp={`${data.opponent.stats.fgm || 0}-${data.opponent.stats.fga || 0}`} />
                  <StatRow label="FG%" team={formatPct(data.team.stats.fg_pct)} opp={formatPct(data.opponent.stats.fg_pct)} />
                  <StatRow label="3-Pointers" team={`${data.team.stats.fgm3 || 0}-${data.team.stats.fga3 || 0}`} opp={`${data.opponent.stats.fgm3 || 0}-${data.opponent.stats.fga3 || 0}`} />
                  <StatRow label="3P%" team={formatPct(data.team.stats.fg3_pct)} opp={formatPct(data.opponent.stats.fg3_pct)} />
                  <StatRow label="Free Throws" team={`${data.team.stats.ftm || 0}-${data.team.stats.fta || 0}`} opp={`${data.opponent.stats.ftm || 0}-${data.opponent.stats.fta || 0}`} />
                  <StatRow label="FT%" team={formatPct(data.team.stats.ft_pct)} opp={formatPct(data.opponent.stats.ft_pct)} />

                  <tr className="boxscore-section-header"><td colSpan="3">Rebounds</td></tr>
                  <StatRow label="Offensive" team={data.team.stats.oreb} opp={data.opponent.stats.oreb} higherBetter />
                  <StatRow label="Defensive" team={data.team.stats.dreb} opp={data.opponent.stats.dreb} higherBetter />
                  <StatRow label="Total" team={data.team.stats.treb} opp={data.opponent.stats.treb} higherBetter />

                  <tr className="boxscore-section-header"><td colSpan="3">Playmaking</td></tr>
                  <StatRow label="Assists" team={data.team.stats.ast} opp={data.opponent.stats.ast} higherBetter />
                  <StatRow label="Turnovers" team={data.team.stats.turnovers} opp={data.opponent.stats.turnovers} lowerBetter />

                  <tr className="boxscore-section-header"><td colSpan="3">Defense</td></tr>
                  <StatRow label="Steals" team={data.team.stats.stl} opp={data.opponent.stats.stl} higherBetter />
                  <StatRow label="Blocks" team={data.team.stats.blk} opp={data.opponent.stats.blk} higherBetter />
                  <StatRow label="Fouls" team={data.team.stats.pf} opp={data.opponent.stats.pf} lowerBetter />

                  {(data.team.stats.pts_paint != null || data.opponent.stats.pts_paint != null) && (
                    <>
                      <tr className="boxscore-section-header"><td colSpan="3">Scoring Breakdown</td></tr>
                      <StatRow label="Paint Points" team={data.team.stats.pts_paint} opp={data.opponent.stats.pts_paint} higherBetter />
                      <StatRow label="Fastbreak Pts" team={data.team.stats.pts_fastbreak} opp={data.opponent.stats.pts_fastbreak} higherBetter />
                      {data.team.stats.pts_bench != null && (
                        <StatRow label="Bench Points" team={data.team.stats.pts_bench} opp={null} />
                      )}
                      <StatRow label="Pts Off TO" team={data.team.stats.pts_turnovers} opp={data.opponent.stats.pts_turnovers} higherBetter />
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatRow({ label, team, opp, higherBetter, lowerBetter }) {
  const teamVal = typeof team === 'number' ? team : null;
  const oppVal = typeof opp === 'number' ? opp : null;

  let teamClass = '';
  let oppClass = '';

  if (teamVal !== null && oppVal !== null) {
    if (higherBetter) {
      if (teamVal > oppVal) teamClass = 'stat-advantage';
      else if (oppVal > teamVal) oppClass = 'stat-advantage';
    } else if (lowerBetter) {
      if (teamVal < oppVal) teamClass = 'stat-advantage';
      else if (oppVal < teamVal) oppClass = 'stat-advantage';
    }
  }

  return (
    <tr>
      <td className="stat-label-col">{label}</td>
      <td className={`stat-value-col ${teamClass}`}>{team ?? '-'}</td>
      <td className={`stat-value-col ${oppClass}`}>{opp ?? '-'}</td>
    </tr>
  );
}

export default BoxScoreModal;
