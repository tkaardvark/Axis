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

// Filter options for team count
const FILTER_OPTIONS = [
  { value: 'top64', label: 'Top 64 Teams' },
  { value: 'top128', label: 'Top 128 Teams' },
  { value: 'all', label: 'All Teams' },
];

function Insights({ teams, conferences = [], league, season, loading, onTeamClick }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [filter, setFilter] = useState('top64'); // Default to top 64

  // Get the filter limit or conference name
  const getFilterLimit = (filterValue) => {
    if (filterValue === 'top64') return 64;
    if (filterValue === 'top128') return 128;
    if (filterValue === 'all') return Infinity;
    return Infinity; // Conference filter - no limit
  };

  const isConferenceFilter = (filterValue) => {
    return !['top64', 'top128', 'all'].includes(filterValue);
  };

  // Base filtered teams (by conference or top N)
  const baseFilteredTeams = useMemo(() => {
    if (!teams || teams.length === 0) return [];
    
    let filtered = [...teams];
    
    // If filtering by conference
    if (isConferenceFilter(filter)) {
      filtered = filtered.filter(t => t.conference === filter);
    }
    
    // Sort by adjusted_net_rating (best first)
    filtered.sort((a, b) => (b.adjusted_net_rating || 0) - (a.adjusted_net_rating || 0));
    
    // Apply limit
    const limit = getFilterLimit(filter);
    return filtered.slice(0, limit);
  }, [teams, filter]);

  // Filter teams with required stats for each visualization
  const topTeams = useMemo(() => {
    return baseFilteredTeams
      .filter(t => t.adjusted_net_rating != null && t.pace != null);
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
  const pctFormatAlreadyPct = (v) => `${v.toFixed(1)}%`;
  const decFormat = (v) => v.toFixed(1);

  if (loading) {
    return (
      <main className="main-content insights-page">
        <div className="page-header">
          <h1>Insights</h1>
        </div>
        <div className="loading">Loading insights...</div>
      </main>
    );
  }

  return (
    <main className="main-content insights-page">
      <div className="page-header">
        <h1>Insights</h1>
        <p className="page-subtitle">Advanced visualizations and analytical deep dives into team performance</p>
      </div>

      {/* Controls: Tabs + Filter */}
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

        <div className="insights-filter">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="insights-filter-select"
          >
            <optgroup label="Top Teams">
              {FILTER_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </optgroup>
            {conferences.length > 0 && (
              <optgroup label="By Conference">
                {conferences.map(conf => (
                  <option key={conf} value={conf}>{conf}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="insights-tab-content">
          <section className="insight-card">
            <div className="insight-card-header">
              <h2 className="insight-title">Trapezoid of Excellence</h2>
              <p className="insight-description">
                Pace vs. Adjusted Net Rating — top {topTeams.length} teams by AdjNET
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
              xFormat={pctFormatAlreadyPct}
              yFormat={pctFormatAlreadyPct}
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
              xFormat={pctFormatAlreadyPct}
              yFormat={pctFormatAlreadyPct}
              onTeamClick={onTeamClick}
            />
          </section>

          <section className="insight-card">
            <div className="insight-card-header">
              <h2 className="insight-title">Effective FG% vs Opponent eFG%</h2>
              <p className="insight-description">
                Team effective field goal % vs opponent effective field goal % — {shootingTeams.length} teams
              </p>
            </div>
            <InsightScatterChart
              teams={shootingTeams}
              xKey="efg_pct"
              yKey="efg_pct_opp"
              xLabel="Team eFG%"
              yLabel="Opponent eFG%"
              xFormat={pctFormatAlreadyPct}
              yFormat={pctFormatAlreadyPct}
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
                Offensive Rebound % vs Defensive Rebound % — {reboundingTeams.length} teams
              </p>
            </div>
            <InsightScatterChart
              teams={reboundingTeams}
              xKey="oreb_pct"
              yKey="dreb_pct"
              xLabel="Offensive Rebound %"
              yLabel="Defensive Rebound %"
              xFormat={pctFormatAlreadyPct}
              yFormat={pctFormatAlreadyPct}
              onTeamClick={onTeamClick}
            />
          </section>

          <section className="insight-card">
            <div className="insight-card-header">
              <h2 className="insight-title">Rebounding Margin</h2>
              <p className="insight-description">
                Team Defensive Rebound % vs Opponent Offensive Rebound % — {reboundingTeams.length} teams
              </p>
            </div>
            <InsightScatterChart
              teams={reboundingTeams}
              xKey="dreb_pct"
              yKey="oreb_pct_opp"
              xLabel="Team DReb%"
              yLabel="Opponent OReb%"
              xFormat={pctFormatAlreadyPct}
              yFormat={pctFormatAlreadyPct}
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
                Points scored per 100 possessions vs points allowed per 100 possessions — {efficiencyTeams.length} teams
              </p>
            </div>
            <InsightScatterChart
              teams={efficiencyTeams}
              xKey="offensive_rating"
              yKey="defensive_rating"
              xLabel="Offensive Rating"
              yLabel="Defensive Rating"
              xFormat={decFormat}
              yFormat={decFormat}
              onTeamClick={onTeamClick}
            />
          </section>

          <section className="insight-card">
            <div className="insight-card-header">
              <h2 className="insight-title">Turnover Battle</h2>
              <p className="insight-description">
                Team Turnover % vs Opponent Turnover % (forcing turnovers) — {efficiencyTeams.length} teams
              </p>
            </div>
            <InsightScatterChart
              teams={efficiencyTeams}
              xKey="turnover_pct"
              yKey="turnover_pct_opp"
              xLabel="Team TO% (lower is better)"
              yLabel="Opponent TO% (higher is better)"
              xFormat={pctFormatAlreadyPct}
              yFormat={pctFormatAlreadyPct}
              onTeamClick={onTeamClick}
            />
          </section>

          <section className="insight-card">
            <div className="insight-card-header">
              <h2 className="insight-title">Scoring vs Turnovers</h2>
              <p className="insight-description">
                Offensive Rating vs Turnover Percentage — {efficiencyTeams.length} teams
              </p>
            </div>
            <InsightScatterChart
              teams={efficiencyTeams}
              xKey="turnover_pct"
              yKey="offensive_rating"
              xLabel="Turnover %"
              yLabel="Offensive Rating"
              xFormat={pctFormatAlreadyPct}
              yFormat={decFormat}
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
              xFormat={decFormat}
              yFormat={decFormat}
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
              xFormat={decFormat}
              yFormat={decFormat}
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
              xFormat={decFormat}
              yFormat={pctFormatAlreadyPct}
              onTeamClick={onTeamClick}
            />
          </section>
        </div>
      )}
    </main>
  );
}

export default Insights;
