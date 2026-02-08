import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';
import './Matchup.css';
import TeamLogo from './TeamLogo';
import MatchupComparisonBar from './MatchupComparisonBar';

const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:3001');

const RADAR_METRICS = [
  { key: 'efg_pct', label: 'eFG%', higherIsBetter: true },
  { key: 'turnover_pct', label: 'TO%', higherIsBetter: false },
  { key: 'oreb_pct', label: 'OREB%', higherIsBetter: true },
  { key: 'ft_rate', label: 'FT Rate', higherIsBetter: true },
  { key: 'pace', label: 'Pace', higherIsBetter: null },
  { key: 'three_pt_rate', label: '3PT Rate', higherIsBetter: null },
];

function getPercentile(value, allValues, higherIsBetter = true) {
  if (value === null || value === undefined) return 50;
  const sorted = [...allValues].filter(v => v !== null && v !== undefined).sort((a, b) => a - b);
  const rank = sorted.findIndex(v => v >= value);
  const percentile = (rank / sorted.length) * 100;
  return higherIsBetter ? percentile : 100 - percentile;
}

const formatDate = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

function Matchup({ league, season, teams = [], conferences = [] }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const [team1Id, setTeam1Id] = useState(searchParams.get('team1') || '');
  const [team2Id, setTeam2Id] = useState(searchParams.get('team2') || '');
  const [conf1, setConf1] = useState('All Conferences');
  const [conf2, setConf2] = useState('All Conferences');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Sync URL params when teams change
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (team1Id) params.set('team1', team1Id);
    else params.delete('team1');
    if (team2Id) params.set('team2', team2Id);
    else params.delete('team2');
    setSearchParams(params, { replace: true });
  }, [team1Id, team2Id]);

  // Auto-set conference filter when team is pre-selected from URL
  useEffect(() => {
    if (team1Id && teams.length > 0) {
      const t = teams.find(t => String(t.team_id) === String(team1Id));
      if (t && t.conference !== conf1) setConf1(t.conference);
    }
  }, [team1Id, teams]);

  useEffect(() => {
    if (team2Id && teams.length > 0) {
      const t = teams.find(t => String(t.team_id) === String(team2Id));
      if (t && t.conference !== conf2) setConf2(t.conference);
    }
  }, [team2Id, teams]);

  // Fetch matchup data when both teams selected
  useEffect(() => {
    if (!team1Id || !team2Id || team1Id === team2Id) {
      setData(null);
      return;
    }

    const fetchMatchup = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/matchup?team1=${team1Id}&team2=${team2Id}&season=${season}&league=${league}`);
        if (!res.ok) throw new Error('Failed to fetch');
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error('Error fetching matchup:', err);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchMatchup();
  }, [team1Id, team2Id, season, league]);

  const sortedTeams1 = useMemo(() => {
    const filtered = conf1 === 'All Conferences' ? teams : teams.filter(t => t.conference === conf1);
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [teams, conf1]);

  const sortedTeams2 = useMemo(() => {
    const filtered = conf2 === 'All Conferences' ? teams : teams.filter(t => t.conference === conf2);
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [teams, conf2]);

  // Build radar data for dual overlay
  const radarData = useMemo(() => {
    if (!data || !teams.length) return [];

    return RADAR_METRICS.map(metric => {
      const allValues = teams.map(t => parseFloat(t[metric.key]));
      const higherIsBetter = metric.higherIsBetter ?? true;

      const v1 = parseFloat(data.team1.stats[metric.key]);
      const v2 = parseFloat(data.team2.stats[metric.key]);

      return {
        metric: metric.label,
        team1: Math.round(getPercentile(v1, allValues, higherIsBetter)),
        team2: Math.round(getPercentile(v2, allValues, higherIsBetter)),
        fullMark: 100,
      };
    });
  }, [data, teams]);

  const CustomRadarTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="radar-tooltip">
          <p className="tooltip-label">{d.metric}</p>
          {payload.map((p, i) => (
            <p key={i} style={{ color: p.color }}>{p.name}: {p.value}th pctl</p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="matchup-page">
      {/* Team Selectors */}
      <div className="matchup-selectors">
        <div className="matchup-selector-group">
          <span className="matchup-team-label">Team 1</span>
          <div className="filter-group">
            <label htmlFor="conf1-select">Conference</label>
            <select id="conf1-select" value={conf1} onChange={(e) => { setConf1(e.target.value); setTeam1Id(''); }}>
              <option value="All Conferences">All Conferences</option>
              {conferences.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label htmlFor="team1-select">Team</label>
            <select id="team1-select" value={team1Id} onChange={(e) => setTeam1Id(e.target.value)}>
              <option value="">Select a team...</option>
              {sortedTeams1.map(t => <option key={t.team_id} value={t.team_id}>{t.name}</option>)}
            </select>
          </div>
        </div>

        <span className="matchup-vs-label">vs</span>

        <div className="matchup-selector-group">
          <span className="matchup-team-label">Team 2</span>
          <div className="filter-group">
            <label htmlFor="conf2-select">Conference</label>
            <select id="conf2-select" value={conf2} onChange={(e) => { setConf2(e.target.value); setTeam2Id(''); }}>
              <option value="All Conferences">All Conferences</option>
              {conferences.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label htmlFor="team2-select">Team</label>
            <select id="team2-select" value={team2Id} onChange={(e) => setTeam2Id(e.target.value)}>
              <option value="">Select a team...</option>
              {sortedTeams2.map(t => <option key={t.team_id} value={t.team_id}>{t.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Same team warning */}
      {team1Id && team2Id && team1Id === team2Id && (
        <div className="matchup-warning">Select two different teams to compare</div>
      )}

      {/* Empty state */}
      {(!team1Id || !team2Id || team1Id === team2Id) && !loading && (
        <div className="matchup-empty-state">
          <div className="empty-icon">
            <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 6L4 16L12 26" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M36 22L44 32L36 42" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="4" y1="16" x2="36" y2="16" strokeLinecap="round"/>
              <line x1="12" y1="32" x2="44" y2="32" strokeLinecap="round"/>
            </svg>
          </div>
          <p>Select two teams above to preview their matchup</p>
        </div>
      )}

      {loading && <div className="matchup-loading">Loading matchup data...</div>}

      {data && !loading && (
        <div className="matchup-content">
          {/* Prediction Header */}
          <section className="matchup-section matchup-prediction">
            <div className="prediction-team prediction-team-left">
              <TeamLogo logoUrl={data.team1.logo_url} teamName={data.team1.name} size="large" />
              <div className="prediction-team-info">
                <div className="prediction-team-name">{data.team1.name}</div>
                <div className="prediction-team-meta">{data.team1.conference}</div>
                <div className="prediction-team-record">{data.team1.record.wins}-{data.team1.record.losses}</div>
              </div>
            </div>

            <div className="prediction-center">
              {data.prediction ? (
                <>
                  <div className="prediction-label">Predicted Score</div>
                  <div className="prediction-scores">
                    <span className={data.prediction.team1_win_probability >= 50 ? 'score-favored' : 'score-underdog'}>
                      {data.prediction.team1_score}
                    </span>
                    <span className="score-divider">-</span>
                    <span className={data.prediction.team1_win_probability < 50 ? 'score-favored' : 'score-underdog'}>
                      {data.prediction.team2_score}
                    </span>
                  </div>
                  <div className="prediction-prob-bar">
                    <div className="prob-fill prob-fill-left" style={{ width: `${data.prediction.team1_win_probability}%` }} />
                  </div>
                  <div className="prediction-prob-labels">
                    <span>{data.prediction.team1_win_probability}%</span>
                    <span className="prob-label-center">Win Probability</span>
                    <span>{100 - data.prediction.team1_win_probability}%</span>
                  </div>
                </>
              ) : (
                <div className="prediction-unavailable">Prediction unavailable</div>
              )}
            </div>

            <div className="prediction-team prediction-team-right">
              <TeamLogo logoUrl={data.team2.logo_url} teamName={data.team2.name} size="large" />
              <div className="prediction-team-info">
                <div className="prediction-team-name">{data.team2.name}</div>
                <div className="prediction-team-meta">{data.team2.conference}</div>
                <div className="prediction-team-record">{data.team2.record.wins}-{data.team2.record.losses}</div>
              </div>
            </div>
          </section>

          {/* Pace & Style */}
          {data.prediction && (
            <section className="matchup-section matchup-pace">
              <div className="pace-stat">
                <span className="pace-value">{data.prediction.expected_pace}</span>
                <span className="pace-label">Expected Pace</span>
              </div>
              <div className="pace-stat">
                <span className="pace-value">{data.prediction.expected_total}</span>
                <span className="pace-label">Expected Total</span>
              </div>
              <div className="pace-stat">
                <span className="pace-value">{Math.abs(data.prediction.margin)}</span>
                <span className="pace-label">Predicted Margin</span>
              </div>
            </section>
          )}

          {/* Four Factors */}
          <section className="matchup-section">
            <div className="matchup-section-header">
              <h3>Four Factors</h3>
              <span className="section-subtitle">The key metrics that determine game outcomes</span>
            </div>
            <div className="matchup-comparison-header">
              <span className="comparison-team-label">{data.team1.name}</span>
              <span className="comparison-team-label">{data.team2.name}</span>
            </div>
            <MatchupComparisonBar label="eFG%" team1Value={data.team1.stats.efg_pct} team2Value={data.team2.stats.efg_pct} format="pct1" higherIsBetter={true} tooltip="Effective Field Goal % - Adjusts FG% for 3-pointers" />
            <MatchupComparisonBar label="TO%" team1Value={data.team1.stats.turnover_pct} team2Value={data.team2.stats.turnover_pct} format="pct1" higherIsBetter={false} tooltip="Turnover Rate - Lower is better" />
            <MatchupComparisonBar label="OREB%" team1Value={data.team1.stats.oreb_pct} team2Value={data.team2.stats.oreb_pct} format="pct1" higherIsBetter={true} tooltip="Offensive Rebound Rate" />
            <MatchupComparisonBar label="FT Rate" team1Value={data.team1.stats.ft_rate} team2Value={data.team2.stats.ft_rate} format="pct1" higherIsBetter={true} tooltip="Free Throw Rate (FTA / FGA)" />
          </section>

          {/* Key Stats Comparison */}
          <section className="matchup-section">
            <div className="matchup-section-header">
              <h3>Stat Comparison</h3>
            </div>
            <div className="matchup-comparison-header">
              <span className="comparison-team-label">{data.team1.name}</span>
              <span className="comparison-team-label">{data.team2.name}</span>
            </div>

            <div className="comparison-group-label">Scoring</div>
            <MatchupComparisonBar label="PPG" team1Value={data.team1.stats.points_per_game} team2Value={data.team2.stats.points_per_game} format="rating" higherIsBetter={true} />
            <MatchupComparisonBar label="Adj ORTG" team1Value={data.team1.stats.adjusted_offensive_rating} team2Value={data.team2.stats.adjusted_offensive_rating} format="rating" higherIsBetter={true} />
            <MatchupComparisonBar label="Adj DRTG" team1Value={data.team1.stats.adjusted_defensive_rating} team2Value={data.team2.stats.adjusted_defensive_rating} format="rating" higherIsBetter={false} />
            <MatchupComparisonBar label="Adj NET" team1Value={data.team1.stats.adjusted_net_rating} team2Value={data.team2.stats.adjusted_net_rating} format="rating2" higherIsBetter={true} />

            <div className="comparison-group-label">Shooting</div>
            <MatchupComparisonBar label="FG%" team1Value={data.team1.stats.fg_pct} team2Value={data.team2.stats.fg_pct} format="pct1" higherIsBetter={true} />
            <MatchupComparisonBar label="3P%" team1Value={data.team1.stats.fg3_pct} team2Value={data.team2.stats.fg3_pct} format="pct1" higherIsBetter={true} />
            <MatchupComparisonBar label="FT%" team1Value={data.team1.stats.ft_pct} team2Value={data.team2.stats.ft_pct} format="pct1" higherIsBetter={true} />
            <MatchupComparisonBar label="3P Rate" team1Value={data.team1.stats.three_pt_rate} team2Value={data.team2.stats.three_pt_rate} format="pct1" higherIsBetter={null} />
            <MatchupComparisonBar label="Paint Pts" team1Value={data.team1.stats.pts_paint_per_game} team2Value={data.team2.stats.pts_paint_per_game} format="rating" higherIsBetter={true} />
            <MatchupComparisonBar label="FB Pts" team1Value={data.team1.stats.pts_fastbreak_per_game} team2Value={data.team2.stats.pts_fastbreak_per_game} format="rating" higherIsBetter={true} />

            <div className="comparison-group-label">Rebounding</div>
            <MatchupComparisonBar label="OREB%" team1Value={data.team1.stats.oreb_pct} team2Value={data.team2.stats.oreb_pct} format="pct1" higherIsBetter={true} />
            <MatchupComparisonBar label="DREB%" team1Value={data.team1.stats.dreb_pct} team2Value={data.team2.stats.dreb_pct} format="pct1" higherIsBetter={true} />
            <MatchupComparisonBar label="RPG" team1Value={data.team1.stats.reb_per_game} team2Value={data.team2.stats.reb_per_game} format="rating" higherIsBetter={true} />

            <div className="comparison-group-label">Playmaking</div>
            <MatchupComparisonBar label="APG" team1Value={data.team1.stats.ast_per_game} team2Value={data.team2.stats.ast_per_game} format="rating" higherIsBetter={true} />
            <MatchupComparisonBar label="TOPG" team1Value={data.team1.stats.to_per_game} team2Value={data.team2.stats.to_per_game} format="rating" higherIsBetter={false} />
            <MatchupComparisonBar label="Pts Off TO" team1Value={data.team1.stats.pts_off_to_per_game} team2Value={data.team2.stats.pts_off_to_per_game} format="rating" higherIsBetter={true} />

            <div className="comparison-group-label">Defense</div>
            <MatchupComparisonBar label="Opp eFG%" team1Value={data.team1.stats.efg_pct_opp} team2Value={data.team2.stats.efg_pct_opp} format="pct1" higherIsBetter={false} />
            <MatchupComparisonBar label="Opp 3P%" team1Value={data.team1.stats.fg3_pct_opp} team2Value={data.team2.stats.fg3_pct_opp} format="pct1" higherIsBetter={false} />
            <MatchupComparisonBar label="SPG" team1Value={data.team1.stats.stl_per_game} team2Value={data.team2.stats.stl_per_game} format="rating" higherIsBetter={true} />
            <MatchupComparisonBar label="BPG" team1Value={data.team1.stats.blk_per_game} team2Value={data.team2.stats.blk_per_game} format="rating" higherIsBetter={true} />
          </section>

          {/* Dual Radar Chart */}
          {radarData.length > 0 && (
            <section className="matchup-section">
              <div className="matchup-section-header">
                <h3>Team Profile Comparison</h3>
                <span className="section-subtitle">National percentile rank overlay</span>
              </div>
              <div className="matchup-radar-wrapper">
                <ResponsiveContainer width="100%" height={340}>
                  <RadarChart data={radarData} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                    <PolarGrid stroke="var(--color-border-secondary)" strokeDasharray="3 3" />
                    <PolarAngleAxis
                      dataKey="metric"
                      tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
                      tickLine={false}
                    />
                    <PolarRadiusAxis
                      angle={90}
                      domain={[0, 100]}
                      tick={{ fill: 'var(--color-text-tertiary)', fontSize: 10 }}
                      tickCount={5}
                      axisLine={false}
                    />
                    <Radar
                      name={data.team1.name}
                      dataKey="team1"
                      stroke="var(--color-matchup-team1, #e67e22)"
                      fill="var(--color-matchup-team1, #e67e22)"
                      fillOpacity={0.15}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Radar
                      name={data.team2.name}
                      dataKey="team2"
                      stroke="var(--color-matchup-team2, #3498db)"
                      fill="var(--color-matchup-team2, #3498db)"
                      fillOpacity={0.15}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, color: 'var(--color-text-secondary)' }} />
                    <Tooltip content={<CustomRadarTooltip />} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {/* Head-to-Head History */}
          {data.head_to_head.length > 0 && (
            <section className="matchup-section">
              <div className="matchup-section-header">
                <h3>Head-to-Head This Season</h3>
              </div>
              <div className="h2h-games">
                {data.head_to_head.map((game, i) => (
                  <div key={i} className="h2h-game">
                    <span className="h2h-date">{formatDate(game.date)}</span>
                    <span className="h2h-location">
                      <span className={`location-badge location-${game.location}`}>
                        {game.location === 'home' ? 'H' : game.location === 'away' ? 'A' : 'N'}
                      </span>
                    </span>
                    <span className={`h2h-score ${game.team1_score > game.team2_score ? 'h2h-win' : 'h2h-loss'}`}>
                      {data.team1.name} {game.team1_score} - {game.team2_score} {data.team2.name}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Top Players */}
          {(data.team1.top_players.length > 0 || data.team2.top_players.length > 0) && (
            <section className="matchup-section">
              <div className="matchup-section-header">
                <h3>Key Players</h3>
              </div>
              <div className="matchup-players-grid">
                <div className="matchup-players-col">
                  <div className="players-col-header">{data.team1.name}</div>
                  {data.team1.top_players.map((p, i) => (
                    <div key={i} className="matchup-player-row">
                      <span className="player-name">{p.name}</span>
                      <span className="player-stats">{p.ppg} PPG / {p.rpg} RPG / {p.apg} APG</span>
                    </div>
                  ))}
                </div>
                <div className="matchup-players-col">
                  <div className="players-col-header">{data.team2.name}</div>
                  {data.team2.top_players.map((p, i) => (
                    <div key={i} className="matchup-player-row">
                      <span className="player-name">{p.name}</span>
                      <span className="player-stats">{p.ppg} PPG / {p.rpg} RPG / {p.apg} APG</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export default Matchup;
