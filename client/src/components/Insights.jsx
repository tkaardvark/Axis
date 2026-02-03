import { useMemo, useState } from 'react';
import './Insights.css';
import TrapezoidChart from './TrapezoidChart';
import ChampionshipDNA from './ChampionshipDNA';
import InsightScatterChart from './InsightScatterChart';

// Tab configuration
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'shooting', label: 'Shooting' },
  { id: 'rebounding', label: 'Rebounding' },
  { id: 'efficiency', label: 'Efficiency' },
  { id: 'pace', label: 'Pace & Style' },
];

function Insights({ teams, conferences = [], league, season, loading, onTeamClick, embedded = false }) {
  const [activeTab, setActiveTab] = useState('overview');

  // Use all teams passed in (filtering is done by parent via FilterBar)
  const baseFilteredTeams = useMemo(() => {
    if (!teams || teams.length === 0) return [];
    
    // Sort by adjusted_net_rating (best first)
    return [...teams].sort((a, b) => (b.adjusted_net_rating || 0) - (a.adjusted_net_rating || 0));
  }, [teams]);

  // Filter teams with required stats for each visualization
  // Trapezoid of Excellence: limit to top 75 teams by RPI
  const topTeams = useMemo(() => {
    return baseFilteredTeams
      .filter(t => t.adjusted_net_rating != null && t.pace != null && t.rpi != null)
      .sort((a, b) => (b.rpi || 0) - (a.rpi || 0))  // Sort by RPI descending (higher is better)
      .slice(0, 75);  // Top 75 by RPI
  }, [baseFilteredTeams]);

  const top40 = useMemo(() => {
    return baseFilteredTeams
      .filter(t => t.adjusted_net_rating != null && t.adjusted_offensive_rating != null && t.adjusted_defensive_rating != null)
      .slice(0, 40);
  }, [baseFilteredTeams]);

  const shootingTeams = useMemo(() => {
    return baseFilteredTeams
      .filter(t => t.three_pt_rate != null && t.fg3_pct != null && t.ft_rate != null && t.ft_pct != null);
  }, [baseFilteredTeams]);

  const reboundingTeams = useMemo(() => {
    return baseFilteredTeams
      .filter(t => t.oreb_pct != null && t.dreb_pct != null);
  }, [baseFilteredTeams]);

  const efficiencyTeams = useMemo(() => {
    return baseFilteredTeams
      .filter(t => t.offensive_rating != null && t.defensive_rating != null && t.turnover_pct != null);
  }, [baseFilteredTeams]);

  const paceTeams = useMemo(() => {
    return baseFilteredTeams
      .filter(t => t.pace != null && t.pts_paint_per_game != null && t.pts_fastbreak_per_game != null);
  }, [baseFilteredTeams]);

  const leagueLabel = league === 'mens' ? "Men's" : "Women's";

  // Format functions for different stat types
  const pctFormat = (v) => `${(v * 100).toFixed(1)}%`;  // Convert decimal to %: 0.345 -> 34.5%
  const ratingFormat = (v) => v.toFixed(1);              // Ratings: 102.3
  const intFormat = (v) => Math.round(v).toString();     // Integers: 72

  if (loading) {
    if (embedded) {
      return <div className="loading">Loading visualizations...</div>;
    }
    return (
      <main className="main-content insights-page">
        <div className="page-header">
          <h1>Insights</h1>
        </div>
        <div className="loading">Loading insights...</div>
      </main>
    );
  }

  const content = (
    <>

      {/* Tab Navigation */}
      <div className="insights-controls">
        <div className="insights-tab-nav">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`insights-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="insights-tab-content">
          <section className="insight-card">
            <div className="insight-card-header">
              <h2 className="insight-title">Trapezoid of Excellence</h2>
              <p className="insight-description">
                Pace vs. Adjusted Net Rating — top {topTeams.length} teams by RPI
              </p>
            </div>
            <TrapezoidChart teams={topTeams} onTeamClick={onTeamClick} />
          </section>

          <section className="insight-card">
            <div className="insight-card-header">
              <h2 className="insight-title">Championship DNA</h2>
              <p className="insight-description">
                Adj. Defensive Rating vs. Adj. Offensive Rating — top {top40.length} teams by AdjNET
              </p>
            </div>
            <ChampionshipDNA teams={top40} onTeamClick={onTeamClick} />
          </section>
        </div>
      )}

      {/* Shooting Tab */}
      {activeTab === 'shooting' && (
        <div className="insights-tab-content">
          <section className="insight-card">
            <div className="insight-card-header">
              <h2 className="insight-title">3-Point Volume vs Accuracy</h2>
              <p className="insight-description">
                3-Point Rate (% of shots from 3) vs 3-Point Percentage — {shootingTeams.length} teams
              </p>
            </div>
            <InsightScatterChart
              teams={shootingTeams}
              xKey="three_pt_rate"
              yKey="fg3_pct"
              xLabel="3-Point Rate (%)"
              yLabel="3-Point %"
              xFormat={pctFormat}
              yFormat={pctFormat}
              onTeamClick={onTeamClick}
            />
          </section>

          <section className="insight-card">
            <div className="insight-card-header">
              <h2 className="insight-title">Free Throw Volume vs Accuracy</h2>
              <p className="insight-description">
                Free Throw Rate (FTA per FGA) vs Free Throw Percentage — {shootingTeams.length} teams
              </p>
            </div>
            <InsightScatterChart
              teams={shootingTeams}
              xKey="ft_rate"
              yKey="ft_pct"
              xLabel="Free Throw Rate"
              yLabel="Free Throw %"
              xFormat={pctFormat}
              yFormat={pctFormat}
              onTeamClick={onTeamClick}
            />
          </section>

          <section className="insight-card">
            <div className="insight-card-header">
              <h2 className="insight-title">Shooting Efficiency Margin</h2>
              <p className="insight-description">
                Team eFG% vs defensive eFG% allowed. Top-right = elite shooting + elite defense.
              </p>
            </div>
            <InsightScatterChart
              teams={shootingTeams}
              xKey="efg_pct"
              yKey="efg_pct_opp"
              xLabel="Team eFG%"
              yLabel="Opponent eFG% Allowed"
              xFormat={pctFormat}
              yFormat={pctFormat}
              invertY={true}
              onTeamClick={onTeamClick}
            />
          </section>
        </div>
      )}

      {/* Rebounding Tab */}
      {activeTab === 'rebounding' && (
        <div className="insights-tab-content">
          <section className="insight-card">
            <div className="insight-card-header">
              <h2 className="insight-title">Offensive vs Defensive Rebounding</h2>
              <p className="insight-description">
                How well a team creates second chances vs prevents opponent second chances. Top-right = elite on both.
              </p>
            </div>
            <InsightScatterChart
              teams={reboundingTeams}
              xKey="oreb_pct"
              yKey="dreb_pct"
              xLabel="Offensive Rebound %"
              yLabel="Defensive Rebound %"
              xFormat={pctFormat}
              yFormat={pctFormat}
              onTeamClick={onTeamClick}
            />
          </section>
        </div>
      )}

      {/* Efficiency Tab */}
      {activeTab === 'efficiency' && (
        <div className="insights-tab-content">
          <section className="insight-card">
            <div className="insight-card-header">
              <h2 className="insight-title">Offensive vs Defensive Efficiency</h2>
              <p className="insight-description">
                Points scored vs points allowed per 100 possessions. Top-right = elite offense + elite defense.
              </p>
            </div>
            <InsightScatterChart
              teams={efficiencyTeams}
              xKey="offensive_rating"
              yKey="defensive_rating"
              xLabel="Offensive Rating"
              yLabel="Defensive Rating"
              xFormat={ratingFormat}
              yFormat={ratingFormat}
              invertY={true}
              onTeamClick={onTeamClick}
            />
          </section>

          <section className="insight-card">
            <div className="insight-card-header">
              <h2 className="insight-title">Turnover Battle</h2>
              <p className="insight-description">
                Ball security vs forcing turnovers. Top-right = protect the ball AND force turnovers.
              </p>
            </div>
            <InsightScatterChart
              teams={efficiencyTeams}
              xKey="turnover_pct"
              yKey="turnover_pct_opp"
              xLabel="Own Turnover %"
              yLabel="Forced Turnover %"
              xFormat={pctFormat}
              yFormat={pctFormat}
              invertX={true}
              onTeamClick={onTeamClick}
            />
          </section>

          <section className="insight-card">
            <div className="insight-card-header">
              <h2 className="insight-title">Scoring Efficiency vs Ball Security</h2>
              <p className="insight-description">
                Can a team score efficiently while protecting the ball? Top-right = high scoring + low turnovers.
              </p>
            </div>
            <InsightScatterChart
              teams={efficiencyTeams}
              xKey="turnover_pct"
              yKey="offensive_rating"
              xLabel="Turnover %"
              yLabel="Offensive Rating"
              xFormat={pctFormat}
              yFormat={ratingFormat}
              invertX={true}
              onTeamClick={onTeamClick}
            />
          </section>
        </div>
      )}

      {/* Pace & Style Tab */}
      {activeTab === 'pace' && (
        <div className="insights-tab-content">
          <section className="insight-card">
            <div className="insight-card-header">
              <h2 className="insight-title">Pace vs Paint Scoring</h2>
              <p className="insight-description">
                Possessions per game vs points in the paint per game — {paceTeams.length} teams
              </p>
            </div>
            <InsightScatterChart
              teams={paceTeams}
              xKey="pace"
              yKey="pts_paint_per_game"
              xLabel="Pace"
              yLabel="Paint Points/Game"
              xFormat={intFormat}
              yFormat={ratingFormat}
              onTeamClick={onTeamClick}
            />
          </section>

          <section className="insight-card">
            <div className="insight-card-header">
              <h2 className="insight-title">Pace vs Transition Scoring</h2>
              <p className="insight-description">
                Possessions per game vs fast break points per game — {paceTeams.length} teams
              </p>
            </div>
            <InsightScatterChart
              teams={paceTeams}
              xKey="pace"
              yKey="pts_fastbreak_per_game"
              xLabel="Pace"
              yLabel="Fastbreak Points/Game"
              xFormat={intFormat}
              yFormat={ratingFormat}
              onTeamClick={onTeamClick}
            />
          </section>

          <section className="insight-card">
            <div className="insight-card-header">
              <h2 className="insight-title">Paint vs Perimeter</h2>
              <p className="insight-description">
                Points in the paint per game vs 3-Point Rate — {paceTeams.length} teams
              </p>
            </div>
            <InsightScatterChart
              teams={paceTeams}
              xKey="pts_paint_per_game"
              yKey="three_pt_rate"
              xLabel="Paint Points/Game"
              yLabel="3-Point Rate (%)"
              xFormat={ratingFormat}
              yFormat={pctFormat}
              onTeamClick={onTeamClick}
            />
          </section>
        </div>
      )}
    </>
  );

  if (embedded) {
    return <div className="insights-embedded">{content}</div>;
  }

  return (
    <main className="main-content insights-page">
      <div className="page-header">
        <h1>Insights</h1>
        <p className="page-subtitle">Advanced visualizations and analytical deep dives into team performance</p>
      </div>
      {content}
    </main>
  );
}

export default Insights;
