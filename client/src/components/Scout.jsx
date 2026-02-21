import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import './Scout.css';
import TeamLogo from './TeamLogo';
import TeamRadarChart from './TeamRadarChart';
import SeasonTrajectoryChart from './SeasonTrajectoryChart';
import BoxScoreModal from './BoxScoreModal';
import Matchup from './Matchup';
import { API_URL } from '../utils/api';
import { normalizeYear, normalizePosition } from '../utils/normalizers';
import SkeletonLoader from './SkeletonLoader';
import { TOOLTIPS } from '../utils/tooltips';

// Stat group configurations
const STAT_GROUPS = {
  Overview: {
    columns: [
      { key: 'games_played', label: 'GP', format: 'int' },
      { key: 'record', label: 'Record', format: 'record' },
      { key: 'win_pct', label: 'Win%', format: 'pct3' },
      { key: 'net_rating', label: 'NET', format: 'rating2' },
      { key: 'offensive_rating', label: 'ORTG', format: 'rating' },
      { key: 'defensive_rating', label: 'DRTG', format: 'rating' },
      { key: 'points_per_game', label: 'PPG', format: 'rating' },
      { key: 'points_allowed_per_game', label: 'PAPG', format: 'rating' },
    ],
  },
  Shooting: {
    columns: [
      { key: 'games_played', label: 'GP', format: 'int' },
      { key: 'record', label: 'Record', format: 'record' },
      { key: 'points_per_game', label: 'PPG', format: 'rating' },
      { key: 'offensive_rating', label: 'ORTG', format: 'rating' },
      { key: 'efg_pct', label: 'eFG%', format: 'pct1' },
      { key: 'fg_pct', label: 'FG%', format: 'pct1' },
      { key: 'fg3_pct', label: '3P%', format: 'pct1' },
      { key: 'ft_pct', label: 'FT%', format: 'pct1' },
      { key: 'three_pt_rate', label: '3P Rate', format: 'pct1' },
      { key: 'ft_rate', label: 'FT Rate', format: 'pct1' },
      { key: 'pts_paint_per_game', label: 'Paint', format: 'rating' },
      { key: 'pts_fastbreak_per_game', label: 'FB', format: 'rating' },
    ],
  },
  Rebounding: {
    columns: [
      { key: 'games_played', label: 'GP', format: 'int' },
      { key: 'record', label: 'Record', format: 'record' },
      { key: 'reb_per_game', label: 'RPG', format: 'rating' },
      { key: 'oreb_per_game', label: 'ORPG', format: 'rating' },
      { key: 'dreb_per_game', label: 'DRPG', format: 'rating' },
      { key: 'oreb_pct', label: 'OREB%', format: 'pct1' },
      { key: 'dreb_pct', label: 'DREB%', format: 'pct1' },
      { key: 'oreb_pct_opp', label: 'Opp OREB%', format: 'pct1' },
      { key: 'stl_per_game', label: 'SPG', format: 'rating' },
      { key: 'blk_per_game', label: 'BPG', format: 'rating' },
    ],
  },
  Playmaking: {
    columns: [
      { key: 'games_played', label: 'GP', format: 'int' },
      { key: 'record', label: 'Record', format: 'record' },
      { key: 'ast_per_game', label: 'APG', format: 'rating' },
      { key: 'to_per_game', label: 'TOPG', format: 'rating' },
      { key: 'turnover_pct', label: 'TO%', format: 'pct1' },
      { key: 'turnover_pct_opp', label: 'Forced TO%', format: 'pct1' },
      { key: 'pts_off_to_per_game', label: 'Pts Off TO', format: 'rating' },
      { key: 'pts_bench_per_game', label: 'Bench Pts', format: 'rating' },
    ],
  },
  Defense: {
    columns: [
      { key: 'games_played', label: 'GP', format: 'int' },
      { key: 'record', label: 'Record', format: 'record' },
      { key: 'points_allowed_per_game', label: 'PAPG', format: 'rating' },
      { key: 'defensive_rating', label: 'DRTG', format: 'rating' },
      { key: 'efg_pct_opp', label: 'Opp eFG%', format: 'pct1' },
      { key: 'fg_pct_opp', label: 'Opp FG%', format: 'pct1' },
      { key: 'fg3_pct_opp', label: 'Opp 3P%', format: 'pct1' },
      { key: 'stl_per_game', label: 'SPG', format: 'rating' },
      { key: 'blk_per_game', label: 'BPG', format: 'rating' },
      { key: 'opp_pts_paint_per_game', label: 'Opp Paint', format: 'rating' },
    ],
  },
};

function Scout({ league, season, teams = [], conferences = [], sourceParam = '' }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const teamIdFromUrl = searchParams.get('team');
  const tabFromUrl = searchParams.get('tab') || 'report';

  const [activeTab, setActiveTab] = useState(tabFromUrl);
  const [selectedTeamId, setSelectedTeamId] = useState(teamIdFromUrl);

  // Sync activeTab and selectedTeamId when URL params change (e.g. from schedule matchup link)
  useEffect(() => {
    const urlTab = searchParams.get('tab') || 'report';
    if (urlTab !== activeTab) setActiveTab(urlTab);
  }, [searchParams.get('tab')]);

  useEffect(() => {
    const urlTeam = searchParams.get('team');
    if (urlTeam !== selectedTeamId) setSelectedTeamId(urlTeam);
  }, [searchParams.get('team')]);
  const [selectedConference, setSelectedConference] = useState('All Conferences');
  const [teamData, setTeamData] = useState(null);
  const [splits, setSplits] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [roster, setRoster] = useState([]);
  const [lineups, setLineups] = useState([]);
  const [lineupStats, setLineupStats] = useState([]);
  const [percentiles, setPercentiles] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statGroup, setStatGroup] = useState('Overview');
  const [lineupSort, setLineupSort] = useState({ column: 'gamesStarted', direction: 'desc' });
  const [lineupStatsSort, setLineupStatsSort] = useState({ column: 'plusMinus', direction: 'desc' });
  const [boxScoreGameId, setBoxScoreGameId] = useState(null);

  // Update URL when tab changes
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams);
    if (tab === 'report') {
      params.delete('tab');
    } else {
      params.set('tab', tab);
    }
    setSearchParams(params, { replace: true });
  };

  // Update URL when team selection changes
  const handleTeamChange = (teamId) => {
    setSelectedTeamId(teamId || null);
    if (teamId) {
      searchParams.set('team', teamId);
    } else {
      searchParams.delete('team');
    }
    setSearchParams(searchParams);
  };

  // Handle conference change - reset team if not in new conference
  const handleConferenceChange = (conf) => {
    setSelectedConference(conf);
    // If a team is selected and doesn't match the new conference, clear it
    if (selectedTeamId && conf !== 'All Conferences') {
      const currentTeam = teams.find(t => String(t.team_id) === String(selectedTeamId));
      if (currentTeam && currentTeam.conference !== conf) {
        handleTeamChange(null);
      }
    }
  };

  // Sync with URL param changes
  useEffect(() => {
    if (teamIdFromUrl !== selectedTeamId) {
      setSelectedTeamId(teamIdFromUrl);
    }
  }, [teamIdFromUrl]);

  // Get selected team object
  const selectedTeam = useMemo(() => {
    if (!selectedTeamId || !teams.length) return null;
    return teams.find(t => String(t.team_id) === String(selectedTeamId)) || null;
  }, [selectedTeamId, teams]);

  // Fetch team data when selection changes
  useEffect(() => {
    if (!selectedTeamId) {
      setTeamData(null);
      setSplits([]);
      setSchedule([]);
      setRoster([]);
      setLineups([]);
      setLineupStats([]);
      setPercentiles(null);
      return;
    }

    const fetchTeamData = async () => {
      setLoading(true);
      try {
        const [splitsRes, scheduleRes, percentilesRes, rosterRes, lineupsRes, lineupStatsRes] = await Promise.all([
          fetch(`${API_URL}/api/teams/${selectedTeamId}/splits?season=${season}${sourceParam}`),
          fetch(`${API_URL}/api/teams/${selectedTeamId}/schedule?season=${season}${sourceParam}`),
          fetch(`${API_URL}/api/teams/${selectedTeamId}/percentiles?season=${season}${sourceParam}`),
          fetch(`${API_URL}/api/teams/${selectedTeamId}/roster?season=${season}${sourceParam}`),
          fetch(`${API_URL}/api/teams/${selectedTeamId}/lineups?season=${season}${sourceParam}`),
          fetch(`${API_URL}/api/teams/${selectedTeamId}/lineup-stats?season=${season}${sourceParam}`)
        ]);
        const splitsData = await splitsRes.json();
        const scheduleData = await scheduleRes.json();
        const percentilesData = await percentilesRes.json();
        const rosterData = await rosterRes.json();
        const lineupsData = await lineupsRes.json();
        const lineupStatsData = await lineupStatsRes.json();
        setSplits(splitsData.splits || []);
        setSchedule(scheduleData.games || []);
        setRoster(rosterData.roster || []);
        setLineups(lineupsData.lineups || []);
        setLineupStats(lineupStatsData.lineupStats || []);
        setPercentiles(percentilesData);
        setTeamData(selectedTeam);
      } catch (error) {
        console.error('Error fetching team data:', error);
        setSplits([]);
        setSchedule([]);
        setRoster([]);
        setLineups([]);
        setLineupStats([]);
        setPercentiles(null);
      } finally {
        setLoading(false);
      }
    };

    fetchTeamData();
  }, [selectedTeamId, season, selectedTeam]);

  const columns = STAT_GROUPS[statGroup]?.columns || STAT_GROUPS.Overview.columns;

  // Map split column keys to percentile keys (they might differ slightly)
  const columnToPercentileKey = {
    'games_played': null, // no percentile for games played
    'record': null, // no percentile for record
    'win_pct': 'naia_win_pct',
    'net_rating': 'net_rating',
    'offensive_rating': 'offensive_rating',
    'defensive_rating': 'defensive_rating',
    'points_per_game': 'points_per_game',
    'points_allowed_per_game': 'points_allowed_per_game',
    'efg_pct': 'efg_pct',
    'fg_pct': 'fg_pct',
    'fg3_pct': 'fg3_pct',
    'ft_pct': 'ft_pct',
    'three_pt_rate': 'three_pt_rate',
    'ft_rate': 'ft_rate',
    'pts_paint_per_game': 'pts_paint_per_game',
    'pts_fastbreak_per_game': 'pts_fastbreak_per_game',
    'reb_per_game': 'reb_per_game',
    'oreb_per_game': 'oreb_per_game',
    'dreb_per_game': 'dreb_per_game',
    'oreb_pct': 'oreb_pct',
    'dreb_pct': 'dreb_pct',
    'oreb_pct_opp': 'oreb_pct_opp',
    'stl_per_game': 'stl_per_game',
    'blk_per_game': 'blk_per_game',
    'ast_per_game': 'ast_per_game',
    'to_per_game': 'to_per_game',
    'turnover_pct': 'turnover_pct',
    'turnover_pct_opp': 'turnover_pct_opp',
    'pts_off_to_per_game': 'pts_off_to_per_game',
    'pts_bench_per_game': 'pts_bench_per_game',
    'efg_pct_opp': 'efg_pct_opp',
    'fg_pct_opp': 'fg_pct_opp',
    'fg3_pct_opp': 'fg3_pct_opp',
    'opp_pts_paint_per_game': 'opp_pts_paint_per_game',
  };

  // Get CSS class based on percentile rank (matches Teams page scale)
  // Only highlight top 40% and bottom 40%, leave middle 20% neutral
  const getPercentileClass = (percentile) => {
    if (percentile === null || percentile === undefined) return '';
    
    // Top 20% = strong color, top 40% = light color
    // Bottom 20% = strong negative, bottom 40% = light negative
    // Middle 20% (40-60) = no color
    if (percentile >= 80) return 'pct-hot';      // Top 20%
    if (percentile >= 60) return 'pct-warm';     // Top 40%
    if (percentile <= 20) return 'pct-cold';     // Bottom 20%
    if (percentile <= 40) return 'pct-cool';     // Bottom 40%
    return '';  // Middle 20% - no highlight
  };

  // Format value based on column format
  const formatValue = (split, col) => {
    if (col.format === 'record') {
      const wins = split.wins ?? '-';
      const losses = split.losses ?? '-';
      return `${wins}-${losses}`;
    }

    const value = split[col.key];
    if (value === null || value === undefined) return '-';

    switch (col.format) {
      case 'int':
        return parseInt(value);
      case 'pct1':
        return (parseFloat(value) * 100).toFixed(1);
      case 'pct3':
        return parseFloat(value).toFixed(3);
      case 'rating':
        return parseFloat(value).toFixed(1);
      case 'rating2':
        return parseFloat(value).toFixed(2);
      default:
        return value;
    }
  };

  // Find overall and conference splits for header
  const overallSplit = splits.find(s => s.split_name === 'Overall');
  const confSplit = splits.find(s => s.split_name === 'Conference');

  // Generate strengths and weaknesses from percentile data
  const strengthsWeaknesses = useMemo(() => {
    if (!percentiles?.national) return { strengths: [], weaknesses: [] };

    // Stat labels and categories for display
    // For "lowerIsBetter" stats, strengthDesc is used when it's a strength, weaknessDesc when it's a weakness
    const statLabels = {
      offensive_rating: { label: 'Offensive Efficiency', category: 'offense', description: 'Points scored per 100 possessions' },
      defensive_rating: { label: 'Defensive Efficiency', category: 'defense', lowerIsBetter: true, strengthDesc: 'Allows few points per 100 possessions', weaknessDesc: 'Allows many points per 100 possessions' },
      efg_pct: { label: 'Effective FG%', category: 'shooting', description: 'Field goal % adjusted for 3-pointers' },
      fg3_pct: { label: '3-Point Shooting', category: 'shooting', description: 'Three-point field goal percentage' },
      ft_pct: { label: 'Free Throw Shooting', category: 'shooting', description: 'Free throw percentage' },
      three_pt_rate: { label: '3-Point Volume', category: 'shooting', description: 'Percentage of shots taken from 3-point range' },
      oreb_pct: { label: 'Offensive Rebounding', category: 'rebounding', description: 'Percentage of offensive rebounds grabbed' },
      dreb_pct: { label: 'Defensive Rebounding', category: 'rebounding', description: 'Percentage of defensive rebounds grabbed' },
      to_per_game: { label: 'Ball Security', category: 'playmaking', lowerIsBetter: true, strengthDesc: 'Commits very few turnovers per game', weaknessDesc: 'Commits many turnovers per game' },
      ast_per_game: { label: 'Passing/Assists', category: 'playmaking', description: 'Assists per game' },
      stl_per_game: { label: 'Steals', category: 'defense', description: 'Steals per game' },
      blk_per_game: { label: 'Shot Blocking', category: 'defense', description: 'Blocks per game' },
      pts_paint_per_game: { label: 'Paint Scoring', category: 'offense', description: 'Points scored in the paint per game' },
      pts_fastbreak_per_game: { label: 'Transition Offense', category: 'offense', description: 'Fast break points per game' },
      efg_pct_opp: { label: 'Opponent Shooting Defense', category: 'defense', lowerIsBetter: true, strengthDesc: 'Holds opponents to low shooting %', weaknessDesc: 'Allows opponents high shooting %' },
      oreb_pct_opp: { label: 'Defensive Rebounding', category: 'defense', lowerIsBetter: true, strengthDesc: 'Limits opponent offensive rebounds', weaknessDesc: 'Gives up many offensive rebounds' },
    };

    const strengths = [];
    const weaknesses = [];

    Object.entries(percentiles.national).forEach(([key, pct]) => {
      if (pct === null || pct === undefined) return;
      const statInfo = statLabels[key];
      if (!statInfo) return;

      // Server already returns percentiles where higher = better
      // So we use pct directly (no flipping needed)
      const effectivePct = pct;

      if (effectivePct >= 75) {
        strengths.push({
          stat: statInfo.label,
          description: statInfo.strengthDesc || statInfo.description,
          percentile: Math.round(effectivePct), // Use effective percentile for display
          category: statInfo.category,
          isElite: effectivePct >= 90,
        });
      } else if (effectivePct <= 25) {
        weaknesses.push({
          stat: statInfo.label,
          description: statInfo.weaknessDesc || statInfo.description,
          percentile: Math.round(100 - effectivePct), // Bottom X% (inverted for weakness display)
          category: statInfo.category,
          isSevere: effectivePct <= 10,
        });
      }
    });

    // Sort by most extreme first
    strengths.sort((a, b) => b.percentile - a.percentile);
    weaknesses.sort((a, b) => b.percentile - a.percentile);

    return { strengths: strengths.slice(0, 5), weaknesses: weaknesses.slice(0, 5) };
  }, [percentiles]);


  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  };

  // Sort teams alphabetically for dropdown, filtered by conference
  const sortedTeams = useMemo(() => {
    let filtered = [...teams];
    if (selectedConference !== 'All Conferences') {
      filtered = filtered.filter(t => t.conference === selectedConference);
    }
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [teams, selectedConference]);

  // Sorted starting lineups
  const sortedLineups = useMemo(() => {
    if (!lineups.length) return [];
    const sorted = [...lineups].sort((a, b) => {
      let aVal, bVal;
      switch (lineupSort.column) {
        case 'winPct': aVal = a.winPct; bVal = b.winPct; break;
        case 'wins': aVal = a.wins; bVal = b.wins; break;
        case 'losses': aVal = a.losses; bVal = b.losses; break;
        default: aVal = a.gamesStarted; bVal = b.gamesStarted;
      }
      return lineupSort.direction === 'desc' ? bVal - aVal : aVal - bVal;
    });
    return sorted;
  }, [lineups, lineupSort]);

  // Sorted 5-man lineup stats
  const sortedLineupStats = useMemo(() => {
    if (!lineupStats.length) return [];
    const sorted = [...lineupStats].sort((a, b) => {
      let aVal, bVal;
      switch (lineupStatsSort.column) {
        case 'pointsScored': aVal = a.pointsScored; bVal = b.pointsScored; break;
        case 'pointsAllowed': aVal = a.pointsAllowed; bVal = b.pointsAllowed; break;
        case 'possessions': aVal = a.possessions; bVal = b.possessions; break;
        default: aVal = a.plusMinus; bVal = b.plusMinus;
      }
      return lineupStatsSort.direction === 'desc' ? bVal - aVal : aVal - bVal;
    });
    return sorted;
  }, [lineupStats, lineupStatsSort]);

  // Toggle sort handlers
  const toggleLineupSort = (column) => {
    setLineupSort(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const toggleLineupStatsSort = (column) => {
    setLineupStatsSort(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  // Set conference when team is selected from URL
  useEffect(() => {
    if (selectedTeamId && teams.length > 0) {
      const team = teams.find(t => String(t.team_id) === String(selectedTeamId));
      if (team && team.conference !== selectedConference) {
        setSelectedConference(team.conference);
      }
    }
  }, [selectedTeamId, teams]);

  return (
    <main className="main-content scout-page">
      <div className="page-header">
        <h1>Scout</h1>
        <p className="page-subtitle">In-depth analysis and scouting report for individual teams</p>
      </div>

      {/* Tab Toggle */}
      <div className="page-tabs">
        <button
          className={`page-tab ${activeTab === 'report' ? 'active' : ''}`}
          onClick={() => handleTabChange('report')}
        >
          Team Report
        </button>
        <button
          className={`page-tab ${activeTab === 'matchup' ? 'active' : ''}`}
          onClick={() => handleTabChange('matchup')}
        >
          Matchup Preview
        </button>
      </div>

      {activeTab === 'matchup' ? (
        <Matchup
          league={league}
          season={season}
          teams={teams}
          conferences={conferences}
          sourceParam={sourceParam}
        />
      ) : (
      <>
      {/* Team Selector */}
      <div className="scout-filters">
        <div className="filter-group">
          <label htmlFor="conference-select">Conference</label>
          <select
            id="conference-select"
            value={selectedConference}
            onChange={(e) => handleConferenceChange(e.target.value)}
          >
            <option value="All Conferences">All Conferences</option>
            {conferences.map((conf) => (
              <option key={conf} value={conf}>{conf}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="team-select">Team</label>
          <select
            id="team-select"
            value={selectedTeamId || ''}
            onChange={(e) => handleTeamChange(e.target.value || null)}
          >
            <option value="">Select a team...</option>
            {sortedTeams.map((team) => (
              <option key={team.team_id} value={team.team_id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Team Content */}
      {!selectedTeamId ? (
        <div className="scout-empty-state">
          <div className="empty-icon">🔍</div>
          <p>Select a team above to view their scouting report</p>
        </div>
      ) : loading ? (
        <SkeletonLoader variant="card" rows={6} />
      ) : selectedTeam ? (
        <div className="scout-content">
          {/* Team Header Card */}
          <div className="scout-header-card">
            <div className="scout-team-info">
              <TeamLogo logoUrl={selectedTeam.logo_url} teamName={selectedTeam.name} size="large" />
              <div className="scout-team-details">
                <h2 className="scout-team-name">{selectedTeam.name}</h2>
                <span className="scout-team-conference">{selectedTeam.conference}</span>
                {selectedTeam.city && selectedTeam.state && (
                  <span className="scout-team-location">{selectedTeam.city}, {selectedTeam.state}</span>
                )}
              </div>
            </div>
            <div className="scout-records">
              {(selectedTeam.total_wins !== undefined && selectedTeam.total_losses !== undefined) && (
                <div className="scout-record">
                  <span className="record-label">Total Record</span>
                  <span className="record-value">
                    {`${selectedTeam.total_wins}-${selectedTeam.total_losses}`}
                  </span>
                </div>
              )}
              <div className="scout-record">
                <span className="record-label">NAIA Record</span>
                <span className="record-value">
                  {overallSplit ? `${overallSplit.wins}-${overallSplit.losses}` : '-'}
                </span>
              </div>
              <div className="scout-record">
                <span className="record-label">Conference</span>
                <span className="record-value">
                  {confSplit ? `${confSplit.wins}-${confSplit.losses}` : '-'}
                </span>
              </div>
            </div>
          </div>

          {/* Charts Row - Radar and Trajectory side by side */}
          <div className="scout-charts-row">
            <TeamRadarChart team={selectedTeam} allTeams={teams} />
            <SeasonTrajectoryChart schedule={schedule} teamName={selectedTeam?.name} />
          </div>

          {/* Strengths & Weaknesses Section */}
          {percentiles && (strengthsWeaknesses.strengths.length > 0 || strengthsWeaknesses.weaknesses.length > 0) && (
            <section className="scout-section scout-insights-section">
              <div className="scout-section-header">
                <h3>Scouting Report</h3>
              </div>
              <div className="scout-insights-grid">
                {/* Strengths */}
                <div className="scout-insights-card strengths">
                  <h4 className="insights-title">
                    <span className="insights-icon">💪</span>
                    Strengths
                  </h4>
                  {strengthsWeaknesses.strengths.length > 0 ? (
                    <ul className="insights-list">
                      {strengthsWeaknesses.strengths.map((item, idx) => (
                        <li key={idx} className="insight-item">
                          <div className="insight-info">
                            <span className="insight-stat">{item.stat}</span>
                            <span className="insight-description">{item.description}</span>
                            <span className="insight-percentile">Top {Math.max(1, 100 - item.percentile)}% nationally</span>
                          </div>
                          <span className={`insight-badge ${item.isElite ? 'elite' : 'strong'}`}>
                            {item.isElite ? 'Elite' : 'Strong'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="no-insights">No standout strengths identified</p>
                  )}
                </div>

                {/* Weaknesses */}
                <div className="scout-insights-card weaknesses">
                  <h4 className="insights-title">
                    <span className="insights-icon">🎯</span>
                    Weaknesses
                  </h4>
                  {strengthsWeaknesses.weaknesses.length > 0 ? (
                    <ul className="insights-list">
                      {strengthsWeaknesses.weaknesses.map((item, idx) => (
                        <li key={idx} className="insight-item">
                          <div className="insight-info">
                            <span className="insight-stat">{item.stat}</span>
                            <span className="insight-description">{item.description}</span>
                            <span className="insight-percentile">Bottom {Math.max(1, 100 - item.percentile)}% nationally</span>
                          </div>
                          <span className={`insight-badge ${item.isSevere ? 'severe' : 'weak'}`}>
                            {item.isSevere ? 'Poor' : 'Below Avg'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="no-insights">No significant weaknesses identified</p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Splits Section */}
          <section className="scout-section">
            <div className="scout-section-header">
              <h3>Performance Splits</h3>
              <div className="scout-stat-group-selector">
                <select value={statGroup} onChange={(e) => setStatGroup(e.target.value)}>
                  <option value="Overview">Overview</option>
                  <option value="Shooting">Shooting</option>
                  <option value="Rebounding">Rebounding</option>
                  <option value="Playmaking">Playmaking</option>
                  <option value="Defense">Defense</option>
                </select>
              </div>
            </div>
            
            <div className="scout-table-container">
              {splits.length === 0 ? (
                <div className="scout-no-data">No split data available</div>
              ) : (
                <table className="scout-splits-table">
                  <thead>
                    <tr>
                      <th className="col-split">Split</th>
                      {columns.map((col) => (
                        <th key={col.key} className="col-stat" title={TOOLTIPS[col.key] || col.label}>
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
                    {/* Conference Percentile Row */}
                    {percentiles && (
                      <tr className="percentile-row conference-percentile">
                        <td className="col-split">
                          <span className="percentile-label">Conf. Percentile</span>
                        </td>
                        {columns.map((col) => {
                          const percKey = columnToPercentileKey[col.key];
                          const pct = percKey ? percentiles.conference?.[percKey] : null;
                          const pctClass = getPercentileClass(pct);
                          return (
                            <td 
                              key={col.key} 
                              className={`col-stat percentile-cell ${pctClass}`}
                            >
                              {pct !== null ? `${pct}%` : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                    {/* National Percentile Row */}
                    {percentiles && (
                      <tr className="percentile-row national-percentile">
                        <td className="col-split">
                          <span className="percentile-label">Nat'l Percentile</span>
                        </td>
                        {columns.map((col) => {
                          const percKey = columnToPercentileKey[col.key];
                          const pct = percKey ? percentiles.national?.[percKey] : null;
                          const pctClass = getPercentileClass(pct);
                          return (
                            <td 
                              key={col.key} 
                              className={`col-stat percentile-cell ${pctClass}`}
                            >
                              {pct !== null ? `${pct}%` : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* Schedule Section */}
          {schedule.length > 0 && (
            <section className="scout-section">
              <div className="scout-section-header">
                <h3>Schedule & Results</h3>
              </div>
              
              <div className="scout-table-container">
                <table className="scout-schedule-table">
                  <thead>
                    <tr>
                      <th className="col-date">Date</th>
                      <th className="col-location">Loc</th>
                      <th className="col-opponent">Opponent</th>
                      <th className="col-type">Type</th>
                      <th className="col-quad">Quad</th>
                      <th className="col-result">Result</th>
                      <th className="col-score">Score</th>
                      <th className="col-actions"></th>
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
                            <span className={`result-${game.result === 'W' ? 'win' : 'loss'}`}>
                              {game.result}
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
                        <td className="col-actions">
                          {game.is_completed && (
                            <button
                              className="schedule-action-btn"
                              title="View box score"
                              onClick={() => setBoxScoreGameId(game.game_id)}
                            >
                              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <rect x="2" y="2" width="12" height="12" rx="1.5" strokeLinecap="round"/>
                                <line x1="2" y1="6" x2="14" y2="6" strokeLinecap="round"/>
                                <line x1="2" y1="10" x2="14" y2="10" strokeLinecap="round"/>
                                <line x1="6" y1="2" x2="6" y2="14" strokeLinecap="round"/>
                                <line x1="10" y1="2" x2="10" y2="14" strokeLinecap="round"/>
                              </svg>
                            </button>
                          )}
                          {game.opponent_id && (
                            <button
                              className="schedule-action-btn"
                              title="View matchup"
                              onClick={() => navigate(`/scout?tab=matchup&team1=${selectedTeamId}&team2=${game.opponent_id}&league=${league}&season=${season}`)}
                            >
                              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M4 2L1 5L4 8" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M12 8L15 11L12 14" strokeLinecap="round" strokeLinejoin="round"/>
                                <line x1="1" y1="5" x2="12" y2="5" strokeLinecap="round"/>
                                <line x1="4" y1="11" x2="15" y2="11" strokeLinecap="round"/>
                              </svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Roster Section */}
          {roster.length > 0 && (
            <section className="scout-section">
              <div className="scout-section-header">
                <h3>Roster</h3>
              </div>
              
              <div className="scout-table-container">
                <table className="scout-roster-table">
                  <thead>
                    <tr>
                      <th className="col-uniform">#</th>
                      <th className="col-player">Player</th>
                      <th className="col-pos">Pos</th>
                      <th className="col-year">Yr</th>
                      <th className="col-ht">Ht</th>
                      <th className="col-gp">GP</th>
                      <th className="col-mpg">MPG</th>
                      <th className="col-ppg">PPG</th>
                      <th className="col-rpg">RPG</th>
                      <th className="col-apg">APG</th>
                      <th className="col-fg">FG%</th>
                      <th className="col-3p">3P%</th>
                      <th className="col-ft">FT%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((player) => (
                      <tr key={player.player_id}>
                        <td className="col-uniform">{player.uniform || '-'}</td>
                        <td className="col-player">
                          {player.first_name} {player.last_name}
                        </td>
                        <td className="col-pos">{normalizePosition(player.position)}</td>
                        <td className="col-year">{normalizeYear(player.year)}</td>
                        <td className="col-ht">{player.height || '-'}</td>
                        <td className="col-gp">{player.gp}</td>
                        <td className="col-mpg">{parseFloat(player.min_pg).toFixed(1)}</td>
                        <td className="col-ppg">{parseFloat(player.pts_pg).toFixed(1)}</td>
                        <td className="col-rpg">{parseFloat(player.reb_pg).toFixed(1)}</td>
                        <td className="col-apg">{parseFloat(player.ast_pg).toFixed(1)}</td>
                        <td className="col-fg">{parseFloat(player.fg_pct).toFixed(1)}%</td>
                        <td className="col-3p">{parseFloat(player.fg3_pct).toFixed(1)}%</td>
                        <td className="col-ft">{parseFloat(player.ft_pct).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Starting Lineups Section */}
          {lineups.length > 0 && (
            <section className="scout-section">
              <div className="scout-section-header">
                <h3>Starting Lineups</h3>
              </div>
              
              <div className="scout-lineups-wrapper">
                <table className="scout-lineups-table sortable-table">
                  <thead>
                    <tr>
                      <th className="col-record sortable-header" onClick={() => toggleLineupSort('gamesStarted')}>
                        Record {lineupSort.column === 'gamesStarted' && <span className="sort-arrow">{lineupSort.direction === 'desc' ? '▼' : '▲'}</span>}
                      </th>
                      <th className="col-winpct sortable-header" onClick={() => toggleLineupSort('winPct')}>
                        Win% {lineupSort.column === 'winPct' && <span className="sort-arrow">{lineupSort.direction === 'desc' ? '▼' : '▲'}</span>}
                      </th>
                      <th className="col-lineup">Starting Five</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLineups.map((lineup, idx) => (
                      <tr key={idx}>
                        <td className="col-record">
                          <span className="lineup-record-text">{lineup.wins}-{lineup.losses}</span>
                          <span className="lineup-games-text">({lineup.gamesStarted}g)</span>
                        </td>
                        <td className={`col-winpct ${lineup.winPct >= 0.5 ? 'positive' : 'negative'}`}>
                          {(lineup.winPct * 100).toFixed(0)}%
                        </td>
                        <td className="col-lineup">
                          {lineup.players.map((player, pIdx) => (
                            <span key={pIdx} className="lineup-player-chip">
                              {player.name}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Lineup +/- Stats Section */}
          {lineupStats.length > 0 && (
            <section className="scout-section">
              <div className="scout-section-header">
                <h3>5-Man Lineup +/-</h3>
                <span className="section-subtitle">Based on play-by-play substitution tracking</span>
              </div>
              
              <div className="scout-lineups-wrapper">
                <table className="scout-lineups-table lineup-stats-table sortable-table">
                  <thead>
                    <tr>
                      <th className="col-plusminus sortable-header" onClick={() => toggleLineupStatsSort('plusMinus')}>
                        +/- {lineupStatsSort.column === 'plusMinus' && <span className="sort-arrow">{lineupStatsSort.direction === 'desc' ? '▼' : '▲'}</span>}
                      </th>
                      <th className="col-pts sortable-header" onClick={() => toggleLineupStatsSort('pointsScored')}>
                        PTS {lineupStatsSort.column === 'pointsScored' && <span className="sort-arrow">{lineupStatsSort.direction === 'desc' ? '▼' : '▲'}</span>}
                      </th>
                      <th className="col-pts sortable-header" onClick={() => toggleLineupStatsSort('pointsAllowed')}>
                        OPP {lineupStatsSort.column === 'pointsAllowed' && <span className="sort-arrow">{lineupStatsSort.direction === 'desc' ? '▼' : '▲'}</span>}
                      </th>
                      <th className="col-poss sortable-header" onClick={() => toggleLineupStatsSort('possessions')}>
                        POSS {lineupStatsSort.column === 'possessions' && <span className="sort-arrow">{lineupStatsSort.direction === 'desc' ? '▼' : '▲'}</span>}
                      </th>
                      <th className="col-lineup">Lineup</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLineupStats.map((lineup, idx) => (
                      <tr key={idx}>
                        <td className={`col-plusminus ${lineup.plusMinus >= 0 ? 'positive' : 'negative'}`}>
                          {lineup.plusMinus >= 0 ? '+' : ''}{lineup.plusMinus}
                        </td>
                        <td className="col-pts">{lineup.pointsScored}</td>
                        <td className="col-pts">{lineup.pointsAllowed}</td>
                        <td className="col-poss">{lineup.possessions}</td>
                        <td className="col-lineup">
                          {lineup.players.map((player, pIdx) => (
                            <span key={pIdx} className="lineup-player-chip">{player}</span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="scout-error">Team not found</div>
      )}

      {boxScoreGameId && (
        <BoxScoreModal
          gameId={boxScoreGameId}
          season={season}
          sourceParam={sourceParam}
          onClose={() => setBoxScoreGameId(null)}
        />
      )}
      </>
      )}
    </main>
  );
}

export default Scout;
