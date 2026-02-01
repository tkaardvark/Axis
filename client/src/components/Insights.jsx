import { useMemo } from 'react';
import './Insights.css';
import TrapezoidChart from './TrapezoidChart';
import ChampionshipDNA from './ChampionshipDNA';

function Insights({ teams, league, season, loading, onTeamClick }) {
  const topTeams = useMemo(() => {
    if (!teams || teams.length === 0) return [];
    return teams
      .filter(t => t.adjusted_net_rating != null && t.pace != null)
      .slice(0, 120);
  }, [teams]);

  const top40 = useMemo(() => {
    if (!teams || teams.length === 0) return [];
    return teams
      .filter(t => t.adjusted_net_rating != null && t.adjusted_offensive_rating != null && t.adjusted_defensive_rating != null)
      .slice(0, 40);
  }, [teams]);

  const leagueLabel = league === 'mens' ? "Men's" : "Women's";

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
    </main>
  );
}

export default Insights;
