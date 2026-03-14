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
  const [predictionMethod, setPredictionMethod] = useState('none'); // 'none', 'score', 'rpi', 'netRating', 'powerIndex'
  const predictionMode = predictionMethod !== 'none';

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

  // Build a lookup of actual results: key = sorted team id pair → result
  const actualResultsMap = useMemo(() => {
    if (!data?.actualResults) return {};
    const map = {};
    data.actualResults.forEach(r => {
      const key = [r.homeTeamId, r.awayTeamId].sort().join('-');
      map[key] = r;
    });
    return map;
  }, [data]);

  // Check if a predicted matchup has an actual result
  const getActualResult = useCallback((teamA, teamB) => {
    if (!teamA || !teamB) return null;
    const key = [teamA.teamId, teamB.teamId].sort().join('-');
    return actualResultsMap[key] || null;
  }, [actualResultsMap]);

  // Build bracket tree from quadrant data for the visual bracket view
  const bracketTree = useMemo(() => {
    if (!data?.quadrants) return null;

    const preds = predictionMode ? data.predictions[predictionMethod] : null;

    // Advance a game using actual results, returning the winner team object or null
    const advanceByActuals = (teamA, teamB) => {
      if (!teamA || !teamB) return null;
      const key = [teamA.teamId, teamB.teamId].sort().join('-');
      const actual = actualResultsMap[key];
      if (!actual) return null;
      return actual.winnerId === teamA.teamId ? teamA : teamB;
    };

    const buildQuadrant = (quadrant) => {
      const firstRound = [];
      const secondRound = [];
      const qPred = preds?.[quadrant.name];

      quadrant.pods.forEach((pod, podIdx) => {
        firstRound.push({ top: pod.teams[0], bottom: pod.teams[3], location: `${pod.hostCity}, ${pod.hostState}` });
        firstRound.push({ top: pod.teams[1], bottom: pod.teams[2], location: `${pod.hostCity}, ${pod.hostState}` });

        if (qPred) {
          const g1 = qPred.firstRound[podIdx * 2];
          const g2 = qPred.firstRound[podIdx * 2 + 1];
          if (g1.scores) firstRound[firstRound.length - 2].predictedScores = g1.scores;
          if (g2.scores) firstRound[firstRound.length - 1].predictedScores = g2.scores;
          firstRound[firstRound.length - 2].predictedWinnerId = g1.predictedWinner?.teamId;
          firstRound[firstRound.length - 1].predictedWinnerId = g2.predictedWinner?.teamId;
          const sr = qPred.secondRound[podIdx];
          secondRound.push({
            top: sr.top, bottom: sr.bottom, location: `${pod.hostCity}, ${pod.hostState}`,
            predictedScores: sr.scores,
            predictedWinnerId: sr.predictedWinner?.teamId,
          });
        } else {
          // No predictions — use actual results to advance teams
          const g1W = advanceByActuals(pod.teams[0], pod.teams[3]);
          const g2W = advanceByActuals(pod.teams[1], pod.teams[2]);
          secondRound.push({ top: g1W || null, bottom: g2W || null, location: `${pod.hostCity}, ${pod.hostState}` });
        }
      });

      const finalSiteLoc = `${data.finalSite?.city}, ${data.finalSite?.state}`;

      let sweet16, quarterFinal;
      if (qPred) {
        sweet16 = qPred.sweet16.map(g => ({
          top: g.top, bottom: g.bottom, location: finalSiteLoc, predictedScores: g.scores,
          predictedWinnerId: g.predictedWinner?.teamId,
        }));
        quarterFinal = [{
          top: qPred.quarterFinal.top, bottom: qPred.quarterFinal.bottom,
          location: finalSiteLoc, predictedScores: qPred.quarterFinal.scores,
          predictedWinnerId: qPred.quarterFinal.predictedWinner?.teamId,
        }];
      } else {
        // No predictions — advance using actuals through later rounds
        const s16Teams = [];
        for (let i = 0; i < secondRound.length; i += 2) {
          const a = secondRound[i].top && secondRound[i].bottom
            ? advanceByActuals(secondRound[i].top, secondRound[i].bottom) : null;
          const b = secondRound[i + 1]?.top && secondRound[i + 1]?.bottom
            ? advanceByActuals(secondRound[i + 1].top, secondRound[i + 1].bottom) : null;
          s16Teams.push({ top: a, bottom: b, location: finalSiteLoc });
        }
        sweet16 = s16Teams.length > 0 ? s16Teams : [
          { top: null, bottom: null, location: finalSiteLoc },
          { top: null, bottom: null, location: finalSiteLoc },
        ];
        const qfA = sweet16[0]?.top && sweet16[0]?.bottom
          ? advanceByActuals(sweet16[0].top, sweet16[0].bottom) : null;
        const qfB = sweet16[1]?.top && sweet16[1]?.bottom
          ? advanceByActuals(sweet16[1].top, sweet16[1].bottom) : null;
        quarterFinal = [{ top: qfA, bottom: qfB, location: finalSiteLoc }];
      }

      return { name: quadrant.name, firstRound, secondRound, sweet16, quarterFinal };
    };

    const quadrants = {};
    data.quadrants.forEach((q) => {
      quadrants[q.name] = buildQuadrant(q);
    });

    let semiFinals, championship;
    if (preds) {
      semiFinals = preds.semiFinals.map((s, i) => ({
        top: s.top, bottom: s.bottom,
        label: i === 0 ? 'Naismith vs Cramer' : 'Duer vs Liston',
        predictedScores: s.scores,
        predictedWinnerId: s.predictedWinner?.teamId,
      }));
      championship = {
        top: preds.championship.top, bottom: preds.championship.bottom,
        predictedScores: preds.championship.scores,
        predictedWinnerId: preds.championship.predictedWinner?.teamId,
        winner: preds.championship.winner,
      };
    } else {
      // No predictions — advance using actuals
      const qNames = data.quadrants.map(q => q.name);
      const s1A = quadrants[qNames[0]]?.quarterFinal?.[0]?.top && quadrants[qNames[0]]?.quarterFinal?.[0]?.bottom
        ? advanceByActuals(quadrants[qNames[0]].quarterFinal[0].top, quadrants[qNames[0]].quarterFinal[0].bottom) : null;
      const s1B = quadrants[qNames[1]]?.quarterFinal?.[0]?.top && quadrants[qNames[1]]?.quarterFinal?.[0]?.bottom
        ? advanceByActuals(quadrants[qNames[1]].quarterFinal[0].top, quadrants[qNames[1]].quarterFinal[0].bottom) : null;
      const s2A = quadrants[qNames[2]]?.quarterFinal?.[0]?.top && quadrants[qNames[2]]?.quarterFinal?.[0]?.bottom
        ? advanceByActuals(quadrants[qNames[2]].quarterFinal[0].top, quadrants[qNames[2]].quarterFinal[0].bottom) : null;
      const s2B = quadrants[qNames[3]]?.quarterFinal?.[0]?.top && quadrants[qNames[3]]?.quarterFinal?.[0]?.bottom
        ? advanceByActuals(quadrants[qNames[3]].quarterFinal[0].top, quadrants[qNames[3]].quarterFinal[0].bottom) : null;
      semiFinals = [
        { top: s1A || null, bottom: s1B || null, label: 'Naismith vs Cramer' },
        { top: s2A || null, bottom: s2B || null, label: 'Duer vs Liston' },
      ];
      const champA = semiFinals[0].top && semiFinals[0].bottom
        ? advanceByActuals(semiFinals[0].top, semiFinals[0].bottom) : null;
      const champB = semiFinals[1].top && semiFinals[1].bottom
        ? advanceByActuals(semiFinals[1].top, semiFinals[1].bottom) : null;
      const champWinner = champA && champB ? advanceByActuals(champA, champB) : null;
      championship = { top: champA || null, bottom: champB || null, winner: champWinner || null };
    }

    return { quadrants, semiFinals, championship, finalSite: data.finalSite };
  }, [data, predictionMethod, actualResultsMap]);

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

      {view === 'bracket' && (
        <div className="prediction-selector">
          <label className="prediction-selector-label">Predict Bracket:</label>
          <select
            className="prediction-select"
            value={predictionMethod}
            onChange={(e) => setPredictionMethod(e.target.value)}
          >
            <option value="none">No Predictions</option>
            <option value="score">Score Prediction</option>
            <option value="mayhem">Mayhem Mode</option>
            <option value="rpi">RPI</option>
            <option value="netRating">Adjusted Net Rating</option>
            <option value="powerIndex">Power Index</option>
          </select>
          {predictionMethod === 'mayhem' && (
            <span className="prediction-description">Probability-based upsets using real results for completed games. Locked in for the entire tournament.</span>
          )}
        </div>
      )}

      {view === 'bracket' && bracketTree ? (
        <FullBracket
          bracketTree={bracketTree}
          data={data}
          podRankings={podRankings}
          getDifficultyClass={getDifficultyClass}
          onTeamClick={handleTeamClickInBracket}
          predictionMode={predictionMode}
          predictionMethod={predictionMethod}
          getActualResult={getActualResult}
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
                          className="ranking-team-row"
                          onClick={() => onTeamClick?.({ team_id: team.teamId, name: team.name })}
                        >
                          <span className="rt-seed">#{team.seed}</span>
                          <span className="rt-team">
                            <TeamLogo logoUrl={team.logoUrl} teamName={team.name} />
                            {team.name}
                          </span>
                          <span className="rt-conf">{team.conference}</span>
                          <span className="rt-record">{team.record}</span>
                          <span className="rt-rpi">{team.rpi?.toFixed(4) || '-'}</span>
                          <span className="rt-rank">{team.rpiRank || '-'}</span>
                          <span className="rt-sos">{team.sos?.toFixed(4) || '-'}</span>
                          <span className="rt-q1">{team.q1}</span>
                          <span className="rt-distance">
                            {team.distance != null ? `${team.distance} mi` : '?'}
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
function FullBracket({ bracketTree, data, podRankings, getDifficultyClass, onTeamClick, predictionMode, predictionMethod, getActualResult }) {
  const leftQuadrants = ['Naismith', 'Cramer'];
  const rightQuadrants = ['Duer', 'Liston'];

  return (
    <div className="full-bracket">
      <div className="bracket-header-legend">
        <span className="legend-item"><span className="legend-dot final-dot"></span> Final Site</span>
        {predictionMode && (
          <>
            <span className="legend-item"><span className="legend-dot correct-dot"></span> Correct Pick</span>
            <span className="legend-item"><span className="legend-dot wrong-dot"></span> Wrong Pick</span>
          </>
        )}
      </div>

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
              predictionMode={predictionMode}
              predictionMethod={predictionMethod}
              getActualResult={getActualResult}
            />
          );
        })}
      </div>

      <div className="bracket-center">
        <div className="bracket-final-site">
          {data.finalSite?.city}, {data.finalSite?.state}
        </div>
        <div className="bracket-center-rounds">
          <div className="bracket-semi">
            <div className="round-label">Semifinal</div>
            {bracketTree.semiFinals[0]?.top ? (
              <BracketGame
                game={bracketTree.semiFinals[0]}
                side="center"
                onTeamClick={onTeamClick}
                predictionMode={predictionMode}
                predictionMethod={predictionMethod}
                getActualResult={getActualResult}
                isCenter={true}
              />
            ) : (
              <>
                <BracketSlot label={`${leftQuadrants[0]} Winner`} />
                <div className="bracket-connector-v"></div>
                <BracketSlot label={`${leftQuadrants[1]} Winner`} />
              </>
            )}
          </div>

          <div className="bracket-championship">
            <div className="round-label">Championship</div>
            <div className="championship-game">
              {bracketTree.championship?.top ? (
                <>
                  <BracketGame
                    game={bracketTree.championship}
                    side="center"
                    onTeamClick={onTeamClick}
                    predictionMode={predictionMode}
                    predictionMethod={predictionMethod}
                    getActualResult={getActualResult}
                    isCenter={true}
                  />
                  {bracketTree.championship.winner && (
                    <div className="predicted-champion">
                      <div className="champion-crown">🏆</div>
                      <TeamLogo logoUrl={bracketTree.championship.winner.logoUrl} teamName={bracketTree.championship.winner.name} />
                      <span className="champion-name">{bracketTree.championship.winner.name}</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <BracketSlot label="Semifinal 1 Winner" />
                  <div className="championship-vs">VS</div>
                  <BracketSlot label="Semifinal 2 Winner" />
                </>
              )}
            </div>
            <div className="champion-label">NAIA National Champion</div>
          </div>

          <div className="bracket-semi">
            <div className="round-label">Semifinal</div>
            {bracketTree.semiFinals[1]?.top ? (
              <BracketGame
                game={bracketTree.semiFinals[1]}
                side="center"
                onTeamClick={onTeamClick}
                predictionMode={predictionMode}
                predictionMethod={predictionMethod}
                getActualResult={getActualResult}
                isCenter={true}
              />
            ) : (
              <>
                <BracketSlot label={`${rightQuadrants[0]} Winner`} />
                <div className="bracket-connector-v"></div>
                <BracketSlot label={`${rightQuadrants[1]} Winner`} />
              </>
            )}
          </div>
        </div>
      </div>

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
              predictionMode={predictionMode}
              predictionMethod={predictionMethod}
              getActualResult={getActualResult}
            />
          );
        })}
      </div>
    </div>
  );
}

/* One quadrant's bracket */
function QuadrantBracket({ quadrant, side, podRankings, getDifficultyClass, onTeamClick, predictionMode, predictionMethod, getActualResult }) {
  return (
    <div className={`quadrant-bracket quadrant-bracket-${side}`}>
      <div className="quadrant-bracket-label">{quadrant.name} Quadrant</div>
      <div className="quadrant-rounds">
        <div className="bracket-round bracket-round-1">
          <div className="round-label">First Round</div>
          {quadrant.firstRound.map((game, i) => (
            <BracketGame
              key={i}
              game={game}
              side={side}
              onTeamClick={onTeamClick}
              showLocation={i % 2 === 0}
              predictionMode={predictionMode}
              predictionMethod={predictionMethod}
              getActualResult={getActualResult}
            />
          ))}
        </div>

        <div className="bracket-round bracket-round-2">
          <div className="round-label">Second Round</div>
          {quadrant.secondRound.map((game, i) => (
            <BracketGame
              key={i}
              game={game}
              side={side}
              onTeamClick={onTeamClick}
              isEmpty={!game.top}
              location={game.location}
              predictionMode={predictionMode}
              predictionMethod={predictionMethod}
              getActualResult={getActualResult}
            />
          ))}
        </div>

        <div className="bracket-round bracket-round-3">
          <div className="round-label">Round of 16</div>
          {quadrant.sweet16.map((game, i) => (
            <BracketGame
              key={i}
              game={game}
              side={side}
              onTeamClick={onTeamClick}
              isEmpty={!game.top}
              predictionMode={predictionMode}
              predictionMethod={predictionMethod}
              getActualResult={getActualResult}
            />
          ))}
        </div>

        <div className="bracket-round bracket-round-4">
          <div className="round-label">Quarterfinal</div>
          {quadrant.quarterFinal.map((game, i) => (
            <BracketGame
              key={i}
              game={game}
              side={side}
              onTeamClick={onTeamClick}
              isEmpty={!game.top}
              predictionMode={predictionMode}
              predictionMethod={predictionMethod}
              getActualResult={getActualResult}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* A single bracket game: two team slots with optional connector */
function BracketGame({ game, side, onTeamClick, isEmpty, showLocation, location, predictionMode, predictionMethod, getActualResult, isCenter }) {
  const locText = location || game?.location;
  const showPredScores = predictionMethod === 'score' || predictionMethod === 'mayhem';

  // Check for actual result
  const actual = (game?.top && game?.bottom && getActualResult)
    ? getActualResult(game.top, game.bottom) : null;

  // Determine prediction status: only the predicted winner gets highlighted
  let topStatus = null, bottomStatus = null;
  if (predictionMode && actual) {
    const predWinnerId = game.predictedWinnerId;
    if (predWinnerId) {
      if (predWinnerId === game.top.teamId) {
        topStatus = actual.winnerId === game.top.teamId ? 'correct' : 'wrong';
      } else if (predWinnerId === game.bottom.teamId) {
        bottomStatus = actual.winnerId === game.bottom.teamId ? 'correct' : 'wrong';
      }
    }
  }

  // Show actual scores when game is played, or predicted scores in score/mayhem mode
  let topScore = null, bottomScore = null;
  if (actual && game?.top && game?.bottom) {
    topScore = actual.homeTeamId === game.top.teamId ? actual.homeScore : actual.awayScore;
    bottomScore = actual.homeTeamId === game.bottom.teamId ? actual.homeScore : actual.awayScore;
  } else if (showPredScores && game?.predictedScores && game?.top) {
    topScore = game.predictedScores[game.top.teamId] ?? null;
    bottomScore = game?.bottom ? (game.predictedScores[game.bottom.teamId] ?? null) : null;
  }

  // Highlight the actual winner's score bold in no-prediction mode
  const topIsActualWinner = actual && game?.top && actual.winnerId === game.top.teamId;
  const bottomIsActualWinner = actual && game?.bottom && actual.winnerId === game.bottom.teamId;

  return (
    <div className={`bracket-game ${isCenter ? 'bracket-game-center' : ''}`}>
      {(showLocation || location) && locText && (
        <div className="bracket-game-location">{locText}</div>
      )}
      <div className="bracket-game-matchup">
        <div className={`bracket-game-slot top-slot ${topStatus ? `prediction-${topStatus}` : ''} ${topIsActualWinner ? 'actual-winner' : ''}`}
          onClick={() => game?.top && onTeamClick(game.top)}
        >
          {isEmpty || !game?.top ? (
            <span className="bracket-tbd">TBD</span>
          ) : (
            <>
              <span className="bracket-seed">#{game.top.seed}</span>
              <TeamLogo logoUrl={game.top.logoUrl} teamName={game.top.name} />
              <span className="bracket-team-name">{game.top.name}</span>
              {topScore != null && <span className={`bracket-projected-score ${actual ? 'actual-score' : ''}`}>{topScore}</span>}
              {topScore == null && <span className="bracket-record">{game.top.record}</span>}
            </>
          )}
        </div>
        <div className={`bracket-game-slot bottom-slot ${bottomStatus ? `prediction-${bottomStatus}` : ''} ${bottomIsActualWinner ? 'actual-winner' : ''}`}
          onClick={() => game?.bottom && onTeamClick(game.bottom)}
        >
          {isEmpty || !game?.bottom ? (
            <span className="bracket-tbd">TBD</span>
          ) : (
            <>
              <span className="bracket-seed">#{game.bottom.seed}</span>
              <TeamLogo logoUrl={game.bottom.logoUrl} teamName={game.bottom.name} />
              <span className="bracket-team-name">{game.bottom.name}</span>
              {bottomScore != null && <span className={`bracket-projected-score ${actual ? 'actual-score' : ''}`}>{bottomScore}</span>}
              {bottomScore == null && <span className="bracket-record">{game.bottom.record}</span>}
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
      className="pod-team-row"
      onClick={() => onTeamClick?.({ team_id: team.teamId, name: team.name })}
    >
      <span className="pod-team-seed">#{team.seed}</span>
      <TeamLogo logoUrl={team.logoUrl} teamName={team.name} />
      <div className="pod-team-details">
        <span className="pod-team-name">
          {team.name}
        </span>
        <span className="pod-team-meta">
          {team.record} • RPI: {team.rpiRank || '-'} • {team.conference}
        </span>
      </div>
      <div className="pod-team-stats">
        <span className="pod-stat">{team.rpi?.toFixed(4) || '-'}</span>
        {team.distance != null && (
          <span className="pod-team-distance">{team.distance} mi</span>
        )}
      </div>
    </div>
  );
}

export default Tournament;
