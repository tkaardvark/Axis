import { useState, useEffect, useMemo } from 'react';
import './BoxScoreModal.css';
import TeamLogo from './TeamLogo';
import ScoreChart from './ScoreChart';
import { API_URL } from '../utils/api';
import SkeletonLoader from './SkeletonLoader';
import useFocusTrap from '../hooks/useFocusTrap';

/**
 * Parse game clock string (e.g., "15:32") to seconds remaining in period
 */
function parseClockToSeconds(clock) {
  if (!clock) return 0;
  const parts = clock.split(':');
  if (parts.length !== 2) return 0;
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

/**
 * Get game format based on league
 * Men's basketball: 2 halves (20 min each)
 * Women's basketball: 4 quarters (10 min each)
 */
function getGameFormat(league) {
  if (league === 'womens') {
    return { periodLength: 600, regulationPeriods: 4, otLength: 300 }; // 10-min quarters, 5-min OT
  }
  return { periodLength: 1200, regulationPeriods: 2, otLength: 300 }; // 20-min halves, 5-min OT
}

/**
 * Calculate elapsed game time in seconds from period and clock
 * Handles both halves (2x20min) and quarters (4x10min) formats
 */
function getElapsedSeconds(period, clock, format) {
  const clockSeconds = parseClockToSeconds(clock);
  const { periodLength, regulationPeriods, otLength } = format;
  
  if (period <= regulationPeriods) {
    // Regulation period
    return (period - 1) * periodLength + (periodLength - clockSeconds);
  } else {
    // Overtime period
    const regulationTime = regulationPeriods * periodLength;
    const otPeriod = period - regulationPeriods;
    return regulationTime + (otPeriod - 1) * otLength + (otLength - clockSeconds);
  }
}

/**
 * Format seconds to "M:SS" display string
 */
function formatDroughtTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Compute game flow stats from score_progression:
 *  - largest lead for each team
 *  - largest scoring run for each team
 *  - longest scoring drought for each team
 */
function computeGameFlow(scoreProgression, league) {
  if (!scoreProgression || scoreProgression.length < 2) return null;

  const format = getGameFormat(league);

  let awayLargestLead = 0;
  let homeLargestLead = 0;

  // For largest run: track consecutive unanswered points
  let awayLargestRun = 0;
  let homeLargestRun = 0;
  let currentRunTeam = null; // 'away' | 'home'
  let currentRunPts = 0;

  // For longest drought: track time since last score for each team
  let awayLongestDrought = 0;
  let homeLongestDrought = 0;
  let awayLastScoreTime = 0; // Start of game
  let homeLastScoreTime = 0; // Start of game

  let prevAway = 0;
  let prevHome = 0;

  for (const p of scoreProgression) {
    const diff = p.awayScore - p.homeScore;
    if (diff > 0 && diff > awayLargestLead) awayLargestLead = diff;
    if (diff < 0 && -diff > homeLargestLead) homeLargestLead = -diff;

    // Determine who scored
    const awayScored = p.awayScore - prevAway;
    const homeScored = p.homeScore - prevHome;
    const currentTime = getElapsedSeconds(p.period, p.clock, format);

    if (awayScored > 0) {
      // Calculate drought ending for away team
      const droughtDuration = currentTime - awayLastScoreTime;
      if (droughtDuration > awayLongestDrought) awayLongestDrought = droughtDuration;
      awayLastScoreTime = currentTime;

      if (currentRunTeam === 'away') {
        currentRunPts += awayScored;
      } else {
        currentRunTeam = 'away';
        currentRunPts = awayScored;
      }
      if (currentRunPts > awayLargestRun) awayLargestRun = currentRunPts;
    }
    if (homeScored > 0) {
      // Calculate drought ending for home team
      const droughtDuration = currentTime - homeLastScoreTime;
      if (droughtDuration > homeLongestDrought) homeLongestDrought = droughtDuration;
      homeLastScoreTime = currentTime;

      if (currentRunTeam === 'home') {
        currentRunPts += homeScored;
      } else {
        currentRunTeam = 'home';
        currentRunPts = homeScored;
      }
      if (currentRunPts > homeLargestRun) homeLargestRun = currentRunPts;
    }

    prevAway = p.awayScore;
    prevHome = p.homeScore;
  }

  return {
    awayLargestLead,
    homeLargestLead,
    awayLargestRun,
    homeLargestRun,
    awayLongestDrought: awayLongestDrought > 0 ? formatDroughtTime(awayLongestDrought) : null,
    homeLongestDrought: homeLongestDrought > 0 ? formatDroughtTime(homeLongestDrought) : null,
  };
}

function BoxScoreModal({ gameId, season, onClose, sourceParam = '' }) {
  const focusTrapRef = useFocusTrap();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gameId) return;

    const fetchBoxScore = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/games/${gameId}/boxscore?season=${season}${sourceParam}`);
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
  }, [gameId, season, sourceParam]);

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
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  };

  const gameFlow = useMemo(() => {
    if (!data?.score_progression) return null;
    return computeGameFlow(data.score_progression, data.league);
  }, [data]);

  if (!gameId) return null;

  return (
    <div className="boxscore-overlay" onClick={handleOverlayClick} role="presentation">
      <div className="boxscore-modal" ref={focusTrapRef} role="dialog" aria-modal="true" aria-label="Box Score">
        <button className="boxscore-close" onClick={onClose} aria-label="Close box score">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {loading ? (
          <SkeletonLoader variant="modal" />
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

            {data.score_progression && data.score_progression.length > 1 && (
              <ScoreChart
                scoreProgression={data.score_progression}
                awayName={data.team.name}
                homeName={data.opponent.name}
              />
            )}

            {/* Linescore */}
            {data.period_scores && (
              <div className="boxscore-linescore">
                <table className="linescore-table">
                  <thead>
                    <tr>
                      <th className="linescore-team-col"></th>
                      {(data.period_scores.away || []).map((_, i) => (
                        <th key={i} className="linescore-period-col">
                          {i < 2 ? `${i + 1}H` : `OT${i - 1}`}
                        </th>
                      ))}
                      <th className="linescore-total-col">T</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="linescore-team-col">{data.team.name}</td>
                      {(data.period_scores.away || []).map((s, i) => (
                        <td key={i} className="linescore-period-col">{s}</td>
                      ))}
                      <td className="linescore-total-col">{data.team.score}</td>
                    </tr>
                    <tr>
                      <td className="linescore-team-col">{data.opponent.name}</td>
                      {(data.period_scores.home || []).map((s, i) => (
                        <td key={i} className="linescore-period-col">{s}</td>
                      ))}
                      <td className="linescore-total-col">{data.opponent.score}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

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

                  {(data.lead_changes != null || gameFlow) && (
                    <>
                      <tr className="boxscore-section-header"><td colSpan="3">Game Flow</td></tr>
                      {data.lead_changes != null && (
                        <CenterRow label="Lead Changes" value={data.lead_changes} />
                      )}
                      {data.ties != null && (
                        <CenterRow label="Times Tied" value={data.ties} />
                      )}
                      {gameFlow && (
                        <StatRow label="Largest Lead" team={gameFlow.awayLargestLead || '-'} opp={gameFlow.homeLargestLead || '-'} higherBetter />
                      )}
                      {gameFlow && (
                        <StatRow label="Largest Run" team={gameFlow.awayLargestRun > 0 ? `${gameFlow.awayLargestRun}-0` : '-'} opp={gameFlow.homeLargestRun > 0 ? `${gameFlow.homeLargestRun}-0` : '-'} />
                      )}
                      {gameFlow && (gameFlow.awayLongestDrought || gameFlow.homeLongestDrought) && (
                        <StatRow label="Longest Drought" team={gameFlow.awayLongestDrought || '-'} opp={gameFlow.homeLongestDrought || '-'} lowerBetter />
                      )}
                      {data.attendance != null && data.attendance > 0 && (
                        <CenterRow label="Attendance" value={data.attendance.toLocaleString()} />
                      )}
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

function CenterRow({ label, value }) {
  return (
    <tr>
      <td className="stat-label-col">{label}</td>
      <td className="stat-value-col stat-center-value" colSpan="2">{value}</td>
    </tr>
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
