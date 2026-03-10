import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import './Tournament.css';
import TeamLogo from './TeamLogo';
import SkeletonLoader from './SkeletonLoader';
import { API_URL } from '../utils/api';

// Lazy-load Bracketcast so it only downloads when that tab is active
const Bracketcast = lazy(() => import('./Bracketcast'));

function Tournament({ league, season, onTeamClick, sourceParam = '' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState('bracket'); // 'bracket', 'pods', 'rankings', 'bracketcast'
  const [expandedPod, setExpandedPod] = useState(null);

  useEffect(() => {
    const fetchTournament = async () => {
      setLoading(true);
      setError(null);
      try {
        const url = `${API_URL}/api/tournament?league=${league}&season=${season}${sourceParam}`;
        const response = await fetch(url);
        const result = await response.json();
        if (result.error) {
          setError(result.error);
          setData(null);
        } else {
          setData(result);
        }
      } catch (err) {
        console.error('Failed to fetch tournament data:', err);
        setError('Failed to load tournament data. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchTournament();
  }, [league, season, sourceParam]);

  const podRankings = useMemo(() => {
    if (!data?.podRankings) return [];
    return data.podRankings;
  }, [data]);

  // Difficulty tier based on rank (1-16)
  const getDifficultyClass = (rank) => {
    if (rank <= 4) return 'difficulty-elite';
    if (rank <= 8) return 'difficulty-tough';
    if (rank <= 12) return 'difficulty-moderate';
    return 'difficulty-light';
  };

  const getDifficultyLabel = (rank) => {
    if (rank <= 4) return 'Elite';
    if (rank <= 8) return 'Tough';
    if (rank <= 12) return 'Moderate';
    return 'Favorable';
  };

  // Build bracket tree from quadrant data for the visual bracket view
  const bracketTree = useMemo(() => {
    if (!data?.quadrants) return null;

    // Build per-quadrant first two rounds from pod structure
    // Each pod: seed 1 vs 16 (Game 1), seed 8 vs 9 (Game 2) → winners play Second Round
    const buildQuadrant = (quadrant) => {
      const firstRound = [];
      const secondRound = [];

      quadrant.pods.forEach((pod) => {
        // Game 1: teams[0] (top seed) vs teams[3] (bottom seed)
        firstRound.push({ top: pod.teams[0], bottom: pod.teams[3], location: `${pod.hostCity}, ${pod.hostState}` });
        // Game 2: teams[1] vs teams[2]
        firstRound.push({ top: pod.teams[1], bottom: pod.teams[2], location: `${pod.hostCity}, ${pod.hostState}` });
        // Second round: Game 1 winner vs Game 2 winner
        secondRound.push({ top: null, bottom: null, location: `${pod.hostCity}, ${pod.hostState}` });
      });

      // Round of 16: 2 games per quadrant (pod 1 winner vs pod 2 winner, pod 3 winner vs pod 4 winner)
      const sweet16 = [
        { top: null, bottom: null, location: `${data.finalSite?.city}, ${data.finalSite?.state}` },
        { top: null, bottom: null, location: `${data.finalSite?.city}, ${data.finalSite?.state}` },
      ];
      // Quarterfinal: 1 game per quadrant
      const quarterFinal = [
        { top: null, bottom: null, location: `${data.finalSite?.city}, ${data.finalSite?.state}` },
      ];

      return { name: quadrant.name, firstRound, secondRound, sweet16, quarterFinal };
    };

    const quadrants = {};
    data.quadrants.forEach((q) => {
      quadrants[q.name] = buildQuadrant(q);
    });

    return {
      quadrants,
      semiFinals: [
        { top: null, bottom: null, label: 'Naismith vs Cramer' },
        { top: null, bottom: null, label: 'Duer vs Liston' },
      ],
      championship: { top: null, bottom: null },
      finalSite: data.finalSite,
    };
  }, [data]);

  const handleTeamClickInBracket = useCallback((team) => {
    if (team && onTeamClick) {
      onTeamClick({ team_id: team.teamId, name: team.name });
    }
  }, [onTeamClick]);

  if (view !== 'bracketcast' && loading) {
    return (
      <div className="tournament-page">
        <div className="page-header">
          <h1>National Tournament</h1>
        </div>
        <SkeletonLoader variant="table" rows={8} />
      </div>
    );
  }

  if (view !== 'bracketcast' && error) {
    return (
      <div className="tournament-page">
        <div className="page-header">
          <h1>National Tournament</h1>
        </div>
        <div className="tournament-error">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tournament-page">
      <div className="page-header">
        <h1>National Tournament</h1>
        <p className="page-subtitle">
          2025-26 NAIA {league === 'mens' ? "Men's" : "Women's"} Basketball Championship
        </p>
        {data?.finalSite && (
          <p className="tournament-dates">
            March 13-14, 2026 (First & Second Round) • March 19-24, 2026 (Final Site: {data.finalSite.city}, {data.finalSite.state})
          </p>
        )}
      </div>

      <div className="tournament-controls">
        <div className="page-tabs">
          <button className={`page-tab ${view === 'bracket' ? 'active' : ''}`} onClick={() => setView('bracket')}>
            Bracket
          </button>
          <button className={`page-tab ${view === 'pods' ? 'active' : ''}`} onClick={() => setView('pods')}>
            Pods
          </button>
          <button className={`page-tab ${view === 'rankings' ? 'active' : ''}`} onClick={() => setView('rankings')}>
            Pod Rankings
          </button>
          <button className={`page-tab ${view === 'bracketcast' ? 'active' : ''}`} onClick={() => setView('bracketcast')}>
            Bracketcast
          </button>
        </div>
      </div>

      {view === 'bracket' && bracketTree ? (
        <FullBracket
          bracketTree={bracketTree}
          data={data}
          podRankings={podRankings}
          getDifficultyClass={getDifficultyClass}
          onTeamClick={handleTeamClickInBracket}
        />
      ) : view === 'pods' ? (
        <div className="tournament-pods-view">
          {data.quadrants.map((quadrant) => (
            <div key={quadrant.name} className="tournament-quadrant">
              <h2 className="quadrant-title">
                <span className="quadrant-icon">◆</span>
                {quadrant.name} Quadrant
              </h2>
              <div className="quadrant-pods">
                {quadrant.pods.map((pod, podIdx) => {
                  const ranking = podRankings.find(
                    p => p.hostCity === pod.hostCity && p.quadrant === quadrant.name
                  );
                  const strengthRank = ranking?.strengthRank || '-';
                  const diffClass = getDifficultyClass(strengthRank);

                  return (
                    <div key={podIdx} className="tournament-pod">
                      <div className="pod-header">
                        <div className="pod-header-left">
                          <span className={`pod-difficulty-badge ${diffClass}`}>
                            #{strengthRank}
                          </span>
                          <div className="pod-header-info">
                            <span className="pod-host-city">{pod.hostCity}, {pod.hostState}</span>
                            <span className="pod-strength-label">{getDifficultyLabel(strengthRank)} • Avg RPI Rank: {ranking?.strength.avgRpiRank}</span>
                          </div>
                        </div>
                        <div className="pod-combined-record">
                          {pod.strength?.combinedRecord}
                        </div>
                      </div>
                      <div className="pod-matchups">
                        <div className="pod-matchup">
                          <div className="matchup-label">Game 1</div>
                          <PodTeamRow team={pod.teams[0]} onTeamClick={onTeamClick} />
                          <div className="matchup-vs">VS</div>
                          <PodTeamRow team={pod.teams[3]} onTeamClick={onTeamClick} />
                        </div>
                        <div className="pod-matchup">
                          <div className="matchup-label">Game 2</div>
                          <PodTeamRow team={pod.teams[1]} onTeamClick={onTeamClick} />
                          <div className="matchup-vs">VS</div>
                          <PodTeamRow team={pod.teams[2]} onTeamClick={onTeamClick} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : view === 'rankings' ? (
        <div className="tournament-rankings">
          <p className="rankings-description">
            Pods ranked by average RPI of all four teams. Higher average RPI indicates a tougher pod overall.
          </p>
          <div className="rankings-list">
            {podRankings.map((pod) => {
              const diffClass = getDifficultyClass(pod.strengthRank);
              const isExpanded = expandedPod === `${pod.quadrant}-${pod.hostCity}`;

              return (
                <div
                  key={`${pod.quadrant}-${pod.hostCity}`}
                  className={`ranking-card ${diffClass} ${isExpanded ? 'expanded' : ''}`}
                >
                  <div
                    className="ranking-card-header"
                    onClick={() => setExpandedPod(isExpanded ? null : `${pod.quadrant}-${pod.hostCity}`)}
                  >
                    <div className="ranking-left">
                      <span className={`ranking-badge ${diffClass}`}>#{pod.strengthRank}</span>
                      <div className="ranking-info">
                        <span className="ranking-city">{pod.hostCity}, {pod.hostState}</span>
                        <span className="ranking-quadrant">{pod.quadrant} Quadrant</span>
                      </div>
                    </div>
                    <div className="ranking-stats">
                      <div className="ranking-stat">
                        <span className="ranking-stat-value">{pod.strength.avgRpi.toFixed(4)}</span>
                        <span className="ranking-stat-label">Avg RPI</span>
                      </div>
                      <div className="ranking-stat">
                        <span className="ranking-stat-value">{pod.strength.avgRpiRank}</span>
                        <span className="ranking-stat-label">Avg Rank</span>
                      </div>
                      <div className="ranking-stat">
                        <span className="ranking-stat-value">{pod.strength.combinedRecord}</span>
                        <span className="ranking-stat-label">Record</span>
                      </div>
                      <div className="ranking-stat">
                        <span className="ranking-stat-value">{(pod.strength.winPct * 100).toFixed(1)}%</span>
                        <span className="ranking-stat-label">Win %</span>
                      </div>
                      <div className="ranking-stat">
                        <span className="ranking-stat-value">{pod.strength.totalQ1Wins}</span>
                        <span className="ranking-stat-label">Q1 Wins</span>
                      </div>
                    </div>
                    <span className={`ranking-expand ${isExpanded ? 'open' : ''}`}>▶</span>
                  </div>
                  {isExpanded && (
                    <div className="ranking-teams">
                      <div className="ranking-teams-header">
                        <span className="rt-seed">Seed</span>
                        <span className="rt-team">Team</span>
                        <span className="rt-conf">Conference</span>
                        <span className="rt-record">Record</span>
                        <span className="rt-rpi">RPI</span>
                        <span className="rt-rank">RPI Rank</span>
                        <span className="rt-sos">SOS</span>
                        <span className="rt-q1">Q1</span>
                        <span className="rt-distance">Travel</span>
                      </div>
                      {pod.teams.map((team) => (
                        <div
                          key={team.teamId}
                          className={`ranking-team-row ${team.isHost ? 'host' : ''}`}
                          onClick={() => onTeamClick?.({ team_id: team.teamId, name: team.name })}
                        >
                          <span className="rt-seed">#{team.seed}</span>
                          <span className="rt-team">
                            <TeamLogo logoUrl={team.logoUrl} teamName={team.name} />
                            {team.name}
                            {team.isHost && <span className="host-tag">HOST</span>}
                          </span>
                          <span className="rt-conf">{team.conference}</span>
                          <span className="rt-record">{team.record}</span>
                          <span className="rt-rpi">{team.rpi?.toFixed(4) || '-'}</span>
                          <span className="rt-rank">{team.rpiRank || '-'}</span>
                          <span className="rt-sos">{team.sos?.toFixed(4) || '-'}</span>
                          <span className="rt-q1">{team.q1}</span>
                          <span className="rt-distance">
                            {team.isHost ? '—' : team.distance != null ? `${team.distance} mi` : '?'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : view === 'bracketcast' ? (
        <Suspense fallback={<SkeletonLoader variant="table" rows={12} />}>
          <Bracketcast
            league={league}
            season={season}
            onTeamClick={onTeamClick}
            sourceParam={sourceParam}
            embedded={true}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

/* ============================================
   FULL BRACKET - Visual 64-team tournament tree
   ============================================ */
function FullBracket({ bracketTree, data, podRankings, getDifficultyClass, onTeamClick }) {
  // Left side: Naismith (top) + Cramer (bottom)
  // Right side: Duer (top) + Liston (bottom)
  // They converge to semis and then championship in the center
  const leftQuadrants = ['Naismith', 'Cramer'];
  const rightQuadrants = ['Duer', 'Liston'];

  return (
    <div className="full-bracket">
      <div className="bracket-header-legend">
        <span className="legend-item"><span className="legend-dot host-dot"></span> Host</span>
        <span className="legend-item"><span className="legend-dot final-dot"></span> Final Site</span>
      </div>

      {/* LEFT HALF: Naismith + Cramer → flows right to center */}
      <div className="bracket-half bracket-left">
        {leftQuadrants.map((qName) => {
          const q = bracketTree.quadrants[qName];
          if (!q) return null;
          return (
            <QuadrantBracket
              key={qName}
              quadrant={q}
              side="left"
              podRankings={podRankings}
              getDifficultyClass={getDifficultyClass}
              onTeamClick={onTeamClick}
            />
          );
        })}
      </div>

      {/* CENTER: Semis + Championship */}
      <div className="bracket-center">
        <div className="bracket-final-site">
          {data.finalSite?.city}, {data.finalSite?.state}
        </div>
        <div className="bracket-center-rounds">
          <div className="bracket-semi">
            <div className="round-label">Semifinal</div>
            <BracketSlot label={`${leftQuadrants[0]} Winner`} side="center" />
            <div className="bracket-connector-v"></div>
            <BracketSlot label={`${leftQuadrants[1]} Winner`} side="center" />
          </div>

          <div className="bracket-championship">
            <div className="round-label">Championship</div>
            <div className="championship-game">
              <BracketSlot label="Semifinal 1 Winner" side="center" />
              <div className="championship-vs">VS</div>
              <BracketSlot label="Semifinal 2 Winner" side="center" />
            </div>
            <div className="champion-label">NAIA {data.quadrants?.[0] ? '' : ''}National Champion</div>
          </div>

          <div className="bracket-semi">
            <div className="round-label">Semifinal</div>
            <BracketSlot label={`${rightQuadrants[0]} Winner`} side="center" />
            <div className="bracket-connector-v"></div>
            <BracketSlot label={`${rightQuadrants[1]} Winner`} side="center" />
          </div>
        </div>
      </div>

      {/* RIGHT HALF: Duer + Liston → flows left to center */}
      <div className="bracket-half bracket-right">
        {rightQuadrants.map((qName) => {
          const q = bracketTree.quadrants[qName];
          if (!q) return null;
          return (
            <QuadrantBracket
              key={qName}
              quadrant={q}
              side="right"
              podRankings={podRankings}
              getDifficultyClass={getDifficultyClass}
              onTeamClick={onTeamClick}
            />
          );
        })}
      </div>
    </div>
  );
}

/* One quadrant's bracket: 8 first-round games → 4 second-round → 2 sweet 16 → 1 QF */
function QuadrantBracket({ quadrant, side, podRankings, getDifficultyClass, onTeamClick }) {
  return (
    <div className={`quadrant-bracket quadrant-bracket-${side}`}>
      <div className="quadrant-bracket-label">{quadrant.name} Quadrant</div>
      <div className="quadrant-rounds">
        {/* Round 1: 8 games (within pods) */}
        <div className="bracket-round bracket-round-1">
          <div className="round-label">First Round</div>
          {quadrant.firstRound.map((game, i) => (
            <BracketGame
              key={i}
              game={game}
              side={side}
              onTeamClick={onTeamClick}
              showLocation={i % 2 === 0}
            />
          ))}
        </div>

        {/* Round 2: 4 games (pod finals) */}
        <div className="bracket-round bracket-round-2">
          <div className="round-label">Second Round</div>
          {quadrant.secondRound.map((game, i) => (
            <BracketGame
              key={i}
              game={game}
              side={side}
              onTeamClick={onTeamClick}
              isEmpty={true}
              location={game.location}
            />
          ))}
        </div>

        {/* Sweet 16: 2 games */}
        <div className="bracket-round bracket-round-3">
          <div className="round-label">Round of 16</div>
          {quadrant.sweet16.map((game, i) => (
            <BracketGame
              key={i}
              game={game}
              side={side}
              onTeamClick={onTeamClick}
              isEmpty={true}
            />
          ))}
        </div>

        {/* Quarterfinal: 1 game */}
        <div className="bracket-round bracket-round-4">
          <div className="round-label">Quarterfinal</div>
          {quadrant.quarterFinal.map((game, i) => (
            <BracketGame
              key={i}
              game={game}
              side={side}
              onTeamClick={onTeamClick}
              isEmpty={true}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* A single bracket game: two team slots with optional connector */
function BracketGame({ game, side, onTeamClick, isEmpty, showLocation, location }) {
  const locText = location || game?.location;
  return (
    <div className="bracket-game">
      {(showLocation || location) && locText && (
        <div className="bracket-game-location">{locText}</div>
      )}
      <div className="bracket-game-matchup">
        <div className={`bracket-game-slot top-slot ${game?.top?.isHost ? 'host-slot' : ''}`}
          onClick={() => game?.top && onTeamClick(game.top)}
        >
          {isEmpty || !game?.top ? (
            <span className="bracket-tbd">TBD</span>
          ) : (
            <>
              <span className="bracket-seed">#{game.top.seed}</span>
              <TeamLogo logoUrl={game.top.logoUrl} teamName={game.top.name} />
              <span className="bracket-team-name">{game.top.name}</span>
              <span className="bracket-record">{game.top.record}</span>
            </>
          )}
        </div>
        <div className={`bracket-game-slot bottom-slot ${game?.bottom?.isHost ? 'host-slot' : ''}`}
          onClick={() => game?.bottom && onTeamClick(game.bottom)}
        >
          {isEmpty || !game?.bottom ? (
            <span className="bracket-tbd">TBD</span>
          ) : (
            <>
              <span className="bracket-seed">#{game.bottom.seed}</span>
              <TeamLogo logoUrl={game.bottom.logoUrl} teamName={game.bottom.name} />
              <span className="bracket-team-name">{game.bottom.name}</span>
              <span className="bracket-record">{game.bottom.record}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* Empty bracket slot for semis/championship */
function BracketSlot({ label, side }) {
  return (
    <div className="bracket-slot">
      <span className="bracket-tbd">{label}</span>
    </div>
  );
}

function PodTeamRow({ team, onTeamClick }) {
  if (!team) return null;
  return (
    <div
      className={`pod-team-row ${team.isHost ? 'host' : ''}`}
      onClick={() => onTeamClick?.({ team_id: team.teamId, name: team.name })}
    >
      <span className="pod-team-seed">#{team.seed}</span>
      <TeamLogo logoUrl={team.logoUrl} teamName={team.name} />
      <div className="pod-team-details">
        <span className="pod-team-name">
          {team.name}
          {team.isHost && <span className="host-tag">HOST</span>}
        </span>
        <span className="pod-team-meta">
          {team.record} • RPI: {team.rpiRank || '-'} • {team.conference}
        </span>
      </div>
      <div className="pod-team-stats">
        <span className="pod-stat">{team.rpi?.toFixed(4) || '-'}</span>
        {!team.isHost && team.distance != null && (
          <span className="pod-team-distance">{team.distance} mi</span>
        )}
      </div>
    </div>
  );
}

export default Tournament;
