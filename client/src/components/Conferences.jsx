import { useState, useEffect, useMemo, Component } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell,
  ScatterChart, Scatter, ZAxis, ReferenceLine,
} from 'recharts';
import InsightScatterChart from './InsightScatterChart';
import TeamLogo from './TeamLogo';
import './Conferences.css';

// Error boundary to catch render errors
class ConferenceErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('Conference page error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, color: 'red' }}>
          <h2>Something went wrong loading the Conferences page.</h2>
          <pre>{this.state.error?.message}</pre>
          <pre>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:3001');

// Profile comparison metrics (conference avg vs national avg)
const PROFILE_METRICS = [
  { key: 'avg_efg_pct', label: 'eFG%', format: v => v?.toFixed(1) + '%' },
  { key: 'avg_to_rate', label: 'TO%', format: v => v?.toFixed(1) + '%' },
  { key: 'avg_oreb_pct', label: 'OREB%', format: v => v?.toFixed(1) + '%' },
  { key: 'avg_ft_rate', label: 'FT Rate', format: v => v?.toFixed(1) + '%' },
  { key: 'avg_pace', label: 'Pace', format: v => v?.toFixed(1) },
  { key: 'avg_three_pt_rate', label: '3PT Rate', format: v => v?.toFixed(1) + '%' },
];


// Helper: get the Monday of the week containing a date
const getWeekStart = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Helper: get Sunday of the week
const getWeekEnd = (date) => {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return end;
};

// Helper: format week range
const formatWeekRange = (start, end) => {
  const opts = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
};

function Conferences({ league, season, conferences = [], teams = [] }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const rawConferenceParam = searchParams.get('conference');
  // Ignore "All Conferences" which is the global filter default, not a real conference
  const conferenceFromUrl = rawConferenceParam && rawConferenceParam !== 'All Conferences' ? rawConferenceParam : null;

  const [selectedConference, setSelectedConference] = useState(conferenceFromUrl || '');
  const [activeTab, setActiveTab] = useState(conferenceFromUrl ? 'detail' : 'rankings');
  const [summary, setSummary] = useState(null);
  const [nationalAvgs, setNationalAvgs] = useState(null);
  const [confRankings, setConfRankings] = useState([]);
  const [headToHead, setHeadToHead] = useState(null);
  const [scheduleGames, setScheduleGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rankingsLoading, setRankingsLoading] = useState(false);
  const [netScatterData, setNetScatterData] = useState([]);
  const [netScatterLoading, setNetScatterLoading] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleTeamFilter, setScheduleTeamFilter] = useState('all');
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getWeekStart(new Date()));
  const [sortColumn, setSortColumn] = useState('conf_wins');
  const [sortDirection, setSortDirection] = useState('desc');
  const [rankSortColumn, setRankSortColumn] = useState('adj_net_rank');
  const [rankSortDirection, setRankSortDirection] = useState('asc');
  const [barMetric, setBarMetric] = useState('avg_adj_net');

  const BAR_METRICS = [
    { key: 'avg_adj_net', label: 'Avg Adj NET', format: v => v?.toFixed(2) },
    { key: 'avg_rpi', label: 'Avg RPI', format: v => v?.toFixed(4) },
    { key: 'avg_adj_ortg', label: 'Avg Adj ORTG', format: v => v?.toFixed(1) },
    { key: 'avg_adj_drtg', label: 'Avg Adj DRTG', format: v => v?.toFixed(1), lowerBetter: true },
    { key: 'avg_sos', label: 'Avg SOS', format: v => v?.toFixed(4) },
    { key: 'non_conf_win_pct', label: 'Non-Conf Win%', format: v => (v * 100).toFixed(1) + '%' },
    { key: 'top_half_adj_net', label: 'Top-Half NET', format: v => v?.toFixed(2) },
  ];

  // Sync URL param
  const handleConferenceChange = (conf) => {
    setSelectedConference(conf);
    if (conf) setActiveTab('detail');
    const params = new URLSearchParams(searchParams);
    if (conf) {
      params.set('conference', conf);
    } else {
      params.delete('conference');
    }
    setSearchParams(params, { replace: true });
  };

  // Sync from URL on mount
  useEffect(() => {
    if (conferenceFromUrl && conferenceFromUrl !== selectedConference) {
      setSelectedConference(conferenceFromUrl);
    }
  }, [conferenceFromUrl]);

  // Fetch conference rankings always (for power rankings table)
  useEffect(() => {
    const fetchRankings = async () => {
      setRankingsLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/conference-rankings?league=${league}&season=${season}`);
        const data = await res.json();
        setConfRankings(data);
      } catch (error) {
        console.error('Error fetching conference rankings:', error);
      } finally {
        setRankingsLoading(false);
      }
    };
    fetchRankings();
  }, [league, season]);

  // Fetch Adj NET scatter data (all teams with Adj NET rank by conference)
  useEffect(() => {
    const fetchNetScatter = async () => {
      setNetScatterLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/conference-rpi-scatter?league=${league}&season=${season}`);
        const data = await res.json();
        setNetScatterData(data);
      } catch (error) {
        console.error('Error fetching scatter data:', error);
      } finally {
        setNetScatterLoading(false);
      }
    };
    fetchNetScatter();
  }, [league, season]);

  // Fetch conference data when selection changes
  useEffect(() => {
    if (!selectedConference) {
      setSummary(null);
      setHeadToHead(null);
      setScheduleGames([]);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const [summaryRes, nationalRes, h2hRes] = await Promise.all([
          fetch(`${API_URL}/api/conferences/${encodeURIComponent(selectedConference)}/summary?league=${league}&season=${season}`),
          fetch(`${API_URL}/api/national-averages?league=${league}&season=${season}`),
          fetch(`${API_URL}/api/conferences/${encodeURIComponent(selectedConference)}/head-to-head?league=${league}&season=${season}`),
        ]);
        const summaryData = await summaryRes.json();
        const nationalData = await nationalRes.json();
        const h2hData = await h2hRes.json();
        setSummary(summaryData);
        setNationalAvgs(nationalData);
        setHeadToHead(h2hData);
      } catch (error) {
        console.error('Error fetching conference data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedConference, league, season]);

  // Fetch schedule separately (all conference games)
  useEffect(() => {
    if (!selectedConference) return;

    const fetchSchedule = async () => {
      setScheduleLoading(true);
      try {
        const res = await fetch(
          `${API_URL}/api/conferences/${encodeURIComponent(selectedConference)}/games?league=${league}&season=${season}`
        );
        const data = await res.json();
        // Only show conference matchups (both teams in the conference)
        const confGames = (data.games || []).filter(g => g.is_conference_matchup);
        setScheduleGames(confGames);
      } catch (error) {
        console.error('Error fetching schedule:', error);
        setScheduleGames([]);
      } finally {
        setScheduleLoading(false);
      }
    };

    fetchSchedule();
  }, [selectedConference, league, season]);

  // Teams in selected conference
  const confTeams = useMemo(() => {
    if (!selectedConference) return [];
    return teams.filter(t => t.conference === selectedConference);
  }, [teams, selectedConference]);

  // Sorted standings
  const standingsTeams = useMemo(() => {
    const sorted = [...confTeams];

    const getSortValue = (team) => {
      switch (sortColumn) {
        case 'conf_wins': return team.conf_wins || 0;
        case 'conf_losses': return team.conf_losses || 0;
        case 'wins': return team.wins || 0;
        case 'losses': return team.losses || 0;
        case 'rpi_rank': return team.rpi_rank || 999;
        case 'adjusted_net_rating': return team.adjusted_net_rating || -999;
        case 'adjusted_offensive_rating': return team.adjusted_offensive_rating || 0;
        case 'adjusted_defensive_rating': return team.adjusted_defensive_rating || 999;
        case 'strength_of_schedule': return team.strength_of_schedule || 0;
        case 'naia_win_pct': return team.naia_win_pct || 0;
        default: return team.conf_wins || 0;
      }
    };

    sorted.sort((a, b) => {
      const aVal = getSortValue(a);
      const bVal = getSortValue(b);
      // For stats where lower is better
      const lowerIsBetter = ['rpi_rank', 'adjusted_defensive_rating', 'conf_losses', 'losses'].includes(sortColumn);
      const dir = sortDirection === 'desc' ? -1 : 1;
      if (lowerIsBetter) {
        return (aVal - bVal) * dir;
      }
      return (bVal - aVal) * dir;
    });

    return sorted;
  }, [confTeams, sortColumn, sortDirection]);

  // Conference ranking for this conference
  const thisConfRanking = useMemo(() => {
    return confRankings.find(r => r.conference === selectedConference);
  }, [confRankings, selectedConference]);

  // Profile comparison: conference avg vs national avg for each metric
  const profileData = useMemo(() => {
    if (!summary || !nationalAvgs) return [];

    return PROFILE_METRICS.map(metric => ({
      metric: metric.label,
      conference: summary[metric.key],
      national: nationalAvgs[metric.key],
      format: metric.format,
    }));
  }, [summary, nationalAvgs]);

  // Group schedule by weeks
  const weeklySchedule = useMemo(() => {
    if (scheduleGames.length === 0) return [];

    let games = [...scheduleGames];
    if (scheduleTeamFilter !== 'all') {
      games = games.filter(g =>
        g.home_team?.team_id === parseInt(scheduleTeamFilter) ||
        g.away_team?.team_id === parseInt(scheduleTeamFilter)
      );
    }

    // Get current week bounds
    const weekEnd = getWeekEnd(currentWeekStart);
    const weekGames = games.filter(g => {
      const d = new Date(g.date);
      return d >= currentWeekStart && d <= weekEnd;
    });

    // Sort by date
    weekGames.sort((a, b) => new Date(a.date) - new Date(b.date));

    return weekGames;
  }, [scheduleGames, scheduleTeamFilter, currentWeekStart]);

  // Get the min/max week boundaries from all games
  const weekBounds = useMemo(() => {
    if (scheduleGames.length === 0) return { min: null, max: null };
    const dates = scheduleGames.map(g => new Date(g.date));
    return {
      min: getWeekStart(new Date(Math.min(...dates))),
      max: getWeekStart(new Date(Math.max(...dates))),
    };
  }, [scheduleGames]);

  const canGoPrevWeek = weekBounds.min && currentWeekStart > weekBounds.min;
  const canGoNextWeek = weekBounds.max && currentWeekStart < weekBounds.max;

  const goToPrevWeek = () => {
    setCurrentWeekStart(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  };

  const goToNextWeek = () => {
    setCurrentWeekStart(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  };

  const goToCurrentWeek = () => {
    setCurrentWeekStart(getWeekStart(new Date()));
  };

  // Sorted conference rankings for power rankings table
  const sortedRankings = useMemo(() => {
    const sorted = [...confRankings];
    sorted.sort((a, b) => {
      const getValue = (row) => {
        switch (rankSortColumn) {
          case 'adj_net_rank': return row.adj_net_rank || 999;
          case 'team_count': return row.team_count || 0;
          case 'avg_adj_net': return row.avg_adj_net || -999;
          case 'avg_rpi': return row.avg_rpi || 0;
          case 'avg_adj_ortg': return row.avg_adj_ortg || 0;
          case 'avg_adj_drtg': return row.avg_adj_drtg || 999;
          case 'avg_sos': return row.avg_sos || 0;
          case 'best_rpi_rank': return row.best_rpi_rank || 999;
          case 'non_conf_win_pct': return row.non_conf_win_pct || 0;
          case 'top_half_adj_net': return row.top_half_adj_net ?? -999;
          default: return row.adj_net_rank || 999;
        }
      };
      const aVal = getValue(a);
      const bVal = getValue(b);
      const lowerIsBetter = ['adj_net_rank', 'avg_adj_drtg', 'best_rpi_rank'].includes(rankSortColumn);
      const dir = rankSortDirection === 'desc' ? -1 : 1;
      if (lowerIsBetter) return (aVal - bVal) * dir;
      return (bVal - aVal) * dir;
    });
    return sorted;
  }, [confRankings, rankSortColumn, rankSortDirection]);

  // Bar chart data (sorted by selected metric)
  const barChartData = useMemo(() => {
    if (confRankings.length === 0) return [];
    const metricDef = BAR_METRICS.find(m => m.key === barMetric);
    const sorted = [...confRankings]
      .filter(c => c[barMetric] != null)
      .sort((a, b) => {
        if (metricDef?.lowerBetter) return a[barMetric] - b[barMetric];
        return b[barMetric] - a[barMetric];
      });
    return sorted.map(c => ({
      name: c.conference.length > 14 ? c.conference.substring(0, 12) + '…' : c.conference,
      fullName: c.conference,
      value: c[barMetric],
      adjNetRank: c.adj_net_rank,
    }));
  }, [confRankings, barMetric]);

  // Scatter data: conferences plotted as ORTG vs DRTG
  const confScatterData = useMemo(() => {
    return confRankings
      .filter(c => c.avg_adj_ortg != null && c.avg_adj_drtg != null)
      .map(c => ({
        name: c.conference,
        x: c.avg_adj_ortg,
        y: c.avg_adj_drtg,
        teamCount: c.team_count,
        adjNetRank: c.adj_net_rank,
      }));
  }, [confRankings]);

  // Scatter means
  const confScatterMeans = useMemo(() => {
    if (confScatterData.length === 0) return { meanX: 0, meanY: 0 };
    const sumX = confScatterData.reduce((a, d) => a + d.x, 0);
    const sumY = confScatterData.reduce((a, d) => a + d.y, 0);
    return {
      meanX: sumX / confScatterData.length,
      meanY: sumY / confScatterData.length,
    };
  }, [confScatterData]);

  // Scatter axis domains (zoom into actual data range with padding)
  const confScatterDomains = useMemo(() => {
    if (confScatterData.length === 0) return { xDomain: [90, 120], yDomain: [90, 120] };
    const xs = confScatterData.map(d => d.x);
    const ys = confScatterData.map(d => d.y);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const xPadding = (xMax - xMin) * 0.15 || 2;
    const yPadding = (yMax - yMin) * 0.15 || 2;
    return {
      xDomain: [Math.floor(xMin - xPadding), Math.ceil(xMax + xPadding)],
      yDomain: [Math.floor(yMin - yPadding), Math.ceil(yMax + yPadding)],
    };
  }, [confScatterData]);

  // Adj NET strip chart: teams grouped by conference, conferences ordered by avg Adj NET rank
  const netStripData = useMemo(() => {
    if (netScatterData.length === 0 || confRankings.length === 0) return { conferences: [], teams: [] };

    // Get conference order from confRankings (already sorted by avg Adj NET desc = rank 1 first)
    const confOrder = confRankings.map(c => c.conference);

    // Build abbreviation map for conference names
    const confAbbrevMap = {};
    confOrder.forEach(name => {
      // Create short abbreviation from initials
      const words = name.split(/\s+/).filter(w => !['of', 'the', 'for', 'and'].includes(w.toLowerCase()));
      const abbrev = words.map(w => w[0]).join('').toUpperCase();
      confAbbrevMap[name] = abbrev.length > 5 ? abbrev.substring(0, 5) : abbrev;
    });

    // Map each team to an x-index based on its conference order
    const teamPoints = netScatterData.map(team => {
      const confIdx = confOrder.indexOf(team.conference);
      return {
        ...team,
        confIdx,
        confAbbrev: confAbbrevMap[team.conference] || '?',
      };
    }).filter(t => t.confIdx !== -1);

    return {
      conferences: confOrder.map((name, idx) => ({
        name,
        abbrev: confAbbrevMap[name],
        idx,
        avgNetRank: confRankings[idx]?.adj_net_rank,
      })),
      teams: teamPoints,
      minNet: Math.min(...teamPoints.map(t => t.adj_net)),
      maxNet: Math.max(...teamPoints.map(t => t.adj_net)),
    };
  }, [netScatterData, confRankings]);

  // Head-to-head matrix sorted teams
  const h2hTeams = useMemo(() => {
    if (!headToHead?.teams) return [];
    // Sort by conference wins desc (to match standings order)
    const teamIds = headToHead.teams.map(t => t.team_id);
    return [...headToHead.teams].sort((a, b) => {
      const aTeam = confTeams.find(t => t.team_id === a.team_id);
      const bTeam = confTeams.find(t => t.team_id === b.team_id);
      return (bTeam?.conf_wins || 0) - (aTeam?.conf_wins || 0);
    });
  }, [headToHead, confTeams]);

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const sortIndicator = (column) => {
    if (sortColumn !== column) return '';
    return sortDirection === 'desc' ? ' ▼' : ' ▲';
  };

  const handleRankSort = (column) => {
    if (rankSortColumn === column) {
      setRankSortDirection(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setRankSortColumn(column);
      // Default direction based on column
      const defaultAsc = ['adj_net_rank', 'avg_adj_drtg', 'best_rpi_rank'].includes(column);
      setRankSortDirection(defaultAsc ? 'asc' : 'desc');
    }
  };

  const rankSortIndicator = (column) => {
    if (rankSortColumn !== column) return '';
    return rankSortDirection === 'desc' ? ' ▼' : ' ▲';
  };

  // Color scale for conference rankings table
  // For each metric, compute percentile of each conference among all conferences
  const rankingPercentiles = useMemo(() => {
    if (confRankings.length === 0) return {};
    const metrics = [
      { key: 'avg_rpi', higherIsBetter: true },
      { key: 'avg_adj_net', higherIsBetter: true },
      { key: 'avg_adj_ortg', higherIsBetter: true },
      { key: 'avg_adj_drtg', higherIsBetter: false },  // lower is better
      { key: 'avg_sos', higherIsBetter: true },
      { key: 'best_rpi_rank', higherIsBetter: false },  // lower rank = better
      { key: 'non_conf_win_pct', higherIsBetter: true },
      { key: 'top_half_adj_net', higherIsBetter: true },
    ];

    const result = {};
    metrics.forEach(({ key, higherIsBetter }) => {
      const values = confRankings.map(c => c[key]).filter(v => v != null);
      if (values.length === 0) return;
      const sorted = [...values].sort((a, b) => a - b);
      confRankings.forEach(conf => {
        const val = conf[key];
        if (val == null) return;
        const rank = sorted.findIndex(v => v >= val);
        const pct = (rank / sorted.length) * 100;
        const percentile = higherIsBetter ? pct : 100 - pct;
        if (!result[conf.conference]) result[conf.conference] = {};
        result[conf.conference][key] = percentile;
      });
    });
    return result;
  }, [confRankings]);

  const getRankingColorClass = (conference, metric) => {
    const pct = rankingPercentiles[conference]?.[metric];
    if (pct == null) return '';
    if (pct >= 80) return 'rank-hot';
    if (pct >= 60) return 'rank-warm';
    if (pct <= 20) return 'rank-cold';
    if (pct <= 40) return 'rank-cool';
    return '';
  };

  const handleTeamClick = (team) => {
    navigate(`/scout?team=${team.team_id}&league=${league}&season=${season}`);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  };

  const BarTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const metricDef = BAR_METRICS.find(m => m.key === barMetric);
      return (
        <div className="conf-radar-tooltip">
          <p className="tooltip-label">{data.fullName}</p>
          <p className="tooltip-conf">{metricDef?.label}: {metricDef?.format(data.value)}</p>
          <p className="tooltip-nat">Adj NET Rank: #{data.adjNetRank}</p>
        </div>
      );
    }
    return null;
  };

  const ProfileTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const metricDef = PROFILE_METRICS.find(m => m.label === label);
      const fmt = metricDef?.format || (v => v?.toFixed(1));
      return (
        <div className="conf-radar-tooltip">
          <p className="tooltip-label">{label}</p>
          {payload.map(entry => (
            <p key={entry.name} className="tooltip-conf" style={{ color: entry.color }}>
              {entry.name}: {fmt(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const ScatterTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="conf-radar-tooltip">
          <p className="tooltip-label">{data.name}</p>
          <p className="tooltip-conf">Avg ORTG: {data.x?.toFixed(1)}</p>
          <p className="tooltip-nat">Avg DRTG: {data.y?.toFixed(1)}</p>
          <p className="tooltip-nat">Adj NET Rank: #{data.adjNetRank} &bull; {data.teamCount} teams</p>
        </div>
      );
    }
    return null;
  };

  const NetStripTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="conf-radar-tooltip">
          <p className="tooltip-label">{data.name}</p>
          <p className="tooltip-conf">{data.conference}</p>
          <p className="tooltip-nat">Adj NET: {data.adj_net?.toFixed(2)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <main className="main-content conferences-page">
      <div className="page-header">
        <h1>Conferences</h1>
        <p className="page-subtitle">Conference breakdown, standings, and cross-team analysis</p>
      </div>

      {/* Tab Navigation */}
      <div className="conf-tabs">
        <button
          className={`conf-tab ${activeTab === 'rankings' ? 'conf-tab-active' : ''}`}
          onClick={() => setActiveTab('rankings')}
        >
          Power Rankings
        </button>
        <button
          className={`conf-tab ${activeTab === 'detail' ? 'conf-tab-active' : ''}`}
          onClick={() => setActiveTab('detail')}
        >
          Conference Detail
        </button>
      </div>

      {/* ===== POWER RANKINGS TAB ===== */}
      {activeTab === 'rankings' && (
        <div className="conf-content">
          {/* Conference Comparison Bar Chart */}
          <section className="conf-section">
            <div className="conf-section-header">
              <h3 className="conf-section-title">Conference Comparison</h3>
              <select
                value={barMetric}
                onChange={(e) => setBarMetric(e.target.value)}
                className="schedule-filter-select"
              >
                {BAR_METRICS.map(m => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </div>
            {rankingsLoading ? (
              <div className="conf-loading">Loading...</div>
            ) : (
              <div className="conf-bar-chart-wrapper conf-bar-chart-vertical">
                <ResponsiveContainer width="100%" height={420}>
                  <BarChart
                    data={barChartData}
                    margin={{ top: 8, right: 16, bottom: 80, left: 16 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-secondary)" vertical={false} />
                    <XAxis
                      type="category"
                      dataKey="name"
                      tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--color-border-secondary)' }}
                      interval={0}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis
                      type="number"
                      tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<BarTooltip />} cursor={{ fill: 'var(--color-bg-tertiary)', opacity: 0.5 }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={32}>
                      {barChartData.map((entry, idx) => (
                        <Cell
                          key={entry.fullName}
                          fill={idx < 3 ? 'var(--color-chart-line)' : 'var(--color-border-primary)'}
                          fillOpacity={idx < 3 ? 0.85 : 0.5}
                          cursor="pointer"
                          onClick={() => {
                            handleConferenceChange(entry.fullName);
                            setActiveTab('detail');
                          }}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {/* Conference Scatter: ORTG vs DRTG */}
          <section className="conf-section">
            <div className="conf-scatter-header">
              <h3>Conference Offense vs Defense</h3>
              <span className="conf-scatter-subtitle">Avg Adj ORTG vs Avg Adj DRTG (lower DRTG = better defense)</span>
            </div>
            {confScatterData.length > 0 && (
              <div className="conf-scatter-chart-wrapper">
                <ResponsiveContainer width="100%" height={400}>
                  <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-secondary)" />
                    <XAxis
                      type="number"
                      dataKey="x"
                      name="Avg ORTG"
                      domain={confScatterDomains.xDomain}
                      tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11 }}
                      tickLine={false}
                      label={{ value: 'Avg Adj ORTG →', position: 'bottom', offset: 0, fill: 'var(--color-text-tertiary)', fontSize: 12 }}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      name="Avg DRTG"
                      domain={confScatterDomains.yDomain}
                      reversed
                      tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11 }}
                      tickLine={false}
                      label={{ value: '← Better Defense', position: 'insideTop', offset: -10, fill: 'var(--color-text-tertiary)', fontSize: 12 }}
                    />
                    <ZAxis type="number" dataKey="teamCount" range={[80, 250]} />
                    <ReferenceLine y={confScatterMeans.meanY} stroke="var(--color-border-primary)" strokeDasharray="4 4" />
                    <ReferenceLine x={confScatterMeans.meanX} stroke="var(--color-border-primary)" strokeDasharray="4 4" />
                    <Tooltip content={<ScatterTooltip />} />
                    <Scatter
                      data={confScatterData}
                      fill="var(--color-chart-line)"
                      fillOpacity={0.8}
                      stroke="var(--color-chart-dot)"
                      strokeWidth={1}
                      cursor="pointer"
                      onClick={(data) => {
                        if (data?.name) {
                          handleConferenceChange(data.name);
                          setActiveTab('detail');
                        }
                      }}
                      shape={(props) => {
                        const { cx, cy, payload } = props;
                        const isTop5 = payload.adjNetRank <= 5;
                        return (
                          <g>
                            <circle
                              cx={cx}
                              cy={cy}
                              r={isTop5 ? 8 : 6}
                              fill={isTop5 ? 'var(--color-chart-line)' : 'var(--color-border-primary)'}
                              fillOpacity={isTop5 ? 0.9 : 0.6}
                              stroke={isTop5 ? 'var(--color-chart-dot)' : 'var(--color-text-tertiary)'}
                              strokeWidth={1.5}
                            />
                            {isTop5 && (
                              <text
                                x={cx}
                                y={cy - 12}
                                textAnchor="middle"
                                fill="var(--color-text-secondary)"
                                fontSize={10}
                                fontWeight={600}
                              >
                                {payload.name.length > 14 ? payload.name.substring(0, 12) + '…' : payload.name}
                              </text>
                            )}
                          </g>
                        );
                      }}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {/* Adj NET Rankings by Conference Strip Chart */}
          <section className="conf-section">
            <div className="conf-scatter-header">
              <h3>Adj NET Rating by Conference</h3>
              <span className="conf-scatter-subtitle">Each dot is a team. Conferences ordered by average Adj NET rating (best to worst, left to right).</span>
            </div>
            {netScatterLoading ? (
              <div className="conf-loading">Loading...</div>
            ) : netStripData.conferences.length > 0 && (
              <div className="conf-rpi-strip-wrapper">
                <ResponsiveContainer width="100%" height={500}>
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 80, left: 50 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-secondary)" vertical={false} />
                    <XAxis
                      type="number"
                      dataKey="confIdx"
                      domain={[-0.5, netStripData.conferences.length - 0.5]}
                      ticks={netStripData.conferences.map((_, i) => i)}
                      tickFormatter={(idx) => netStripData.conferences[idx]?.abbrev || ''}
                      tick={{ fill: 'var(--color-text-tertiary)', fontSize: 10 }}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--color-border-secondary)' }}
                      interval={0}
                      angle={-45}
                      textAnchor="end"
                    />
                    <YAxis
                      type="number"
                      dataKey="adj_net"
                      domain={[Math.min(0, Math.floor(netStripData.minNet - 2)), Math.ceil(netStripData.maxNet + 2)]}
                      tickFormatter={(v) => v.toFixed(0)}
                      tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      label={{ value: 'Adj NET Rating', angle: -90, position: 'insideLeft', offset: -35, fill: 'var(--color-text-tertiary)', fontSize: 12 }}
                    />
                    <ReferenceLine y={0} stroke="var(--color-border-primary)" strokeDasharray="4 4" />
                    <ZAxis range={[20, 20]} />
                    <Tooltip content={<NetStripTooltip />} />
                    <Scatter
                      data={netStripData.teams}
                      cursor="pointer"
                      onClick={(data) => {
                        if (data?.conference) {
                          handleConferenceChange(data.conference);
                          setActiveTab('detail');
                        }
                      }}
                      shape={(props) => {
                        const { cx, cy, payload } = props;
                        const isPositive = payload.adj_net >= 0;
                        return (
                          <circle
                            cx={cx}
                            cy={cy}
                            r={4}
                            fill={isPositive ? 'var(--color-chart-line)' : 'var(--color-text-tertiary)'}
                            fillOpacity={0.7}
                            stroke={isPositive ? 'var(--color-chart-dot)' : 'var(--color-border-primary)'}
                            strokeWidth={1}
                          />
                        );
                      }}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {/* Power Rankings Table */}
          <section className="conf-section conf-power-rankings">
            <h3 className="conf-section-title">All Conference Rankings</h3>
            <p className="conf-rankings-subtitle">Click any conference to explore its full breakdown</p>
            {rankingsLoading ? (
              <div className="conf-loading">Loading conference rankings...</div>
            ) : (
              <div className="conf-table-container">
                <table className="conf-rankings-table">
                  <thead>
                    <tr>
                      <th className="col-sortable" onClick={() => handleRankSort('adj_net_rank')}>
                        #{rankSortIndicator('adj_net_rank')}
                      </th>
                      <th className="col-rank-conf">Conference</th>
                      <th className="col-sortable" onClick={() => handleRankSort('team_count')}>
                        Teams{rankSortIndicator('team_count')}
                      </th>
                      <th className="col-sortable" onClick={() => handleRankSort('avg_adj_net')}>
                        Avg Adj NET{rankSortIndicator('avg_adj_net')}
                      </th>
                      <th className="col-sortable" onClick={() => handleRankSort('avg_rpi')}>
                        Avg RPI{rankSortIndicator('avg_rpi')}
                      </th>
                      <th className="col-sortable" onClick={() => handleRankSort('avg_adj_ortg')}>
                        Avg ORTG{rankSortIndicator('avg_adj_ortg')}
                      </th>
                      <th className="col-sortable" onClick={() => handleRankSort('avg_adj_drtg')}>
                        Avg DRTG{rankSortIndicator('avg_adj_drtg')}
                      </th>
                      <th className="col-sortable" onClick={() => handleRankSort('avg_sos')}>
                        Avg SOS{rankSortIndicator('avg_sos')}
                      </th>
                      <th className="col-sortable" onClick={() => handleRankSort('best_rpi_rank')}>
                        Best Team{rankSortIndicator('best_rpi_rank')}
                      </th>
                      <th className="col-sortable" onClick={() => handleRankSort('non_conf_win_pct')}>
                        Non-Conf Win%{rankSortIndicator('non_conf_win_pct')}
                      </th>
                      <th className="col-sortable" onClick={() => handleRankSort('top_half_adj_net')}>
                        Top-Half NET{rankSortIndicator('top_half_adj_net')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRankings.map((conf) => (
                      <tr
                        key={conf.conference}
                        className="conf-ranking-row"
                        onClick={() => {
                          handleConferenceChange(conf.conference);
                          setActiveTab('detail');
                        }}
                      >
                        <td className="col-rank">{conf.adj_net_rank}</td>
                        <td className="col-rank-conf-name">{conf.conference}</td>
                        <td>{conf.team_count}</td>
                        <td className={`mono-cell ${getRankingColorClass(conf.conference, 'avg_adj_net')}`}>{conf.avg_adj_net?.toFixed(2) || '-'}</td>
                        <td className={`mono-cell ${getRankingColorClass(conf.conference, 'avg_rpi')}`}>{conf.avg_rpi?.toFixed(4) || '-'}</td>
                        <td className={`mono-cell ${getRankingColorClass(conf.conference, 'avg_adj_ortg')}`}>{conf.avg_adj_ortg?.toFixed(1) || '-'}</td>
                        <td className={`mono-cell ${getRankingColorClass(conf.conference, 'avg_adj_drtg')}`}>{conf.avg_adj_drtg?.toFixed(1) || '-'}</td>
                        <td className={`mono-cell ${getRankingColorClass(conf.conference, 'avg_sos')}`}>{conf.avg_sos?.toFixed(4) || '-'}</td>
                        <td className={`mono-cell ${getRankingColorClass(conf.conference, 'best_rpi_rank')}`}>#{conf.best_rpi_rank || '-'}</td>
                        <td className={`mono-cell ${getRankingColorClass(conf.conference, 'non_conf_win_pct')}`}>
                          {conf.non_conf_win_pct != null
                            ? (conf.non_conf_win_pct * 100).toFixed(1) + '%'
                            : '-'}
                        </td>
                        <td className={`mono-cell ${getRankingColorClass(conf.conference, 'top_half_adj_net')}`}
                            title={conf.top_half_count != null ? `${conf.top_half_count} teams proj. ≥.500 in conf. play` : ''}>
                          {conf.top_half_adj_net != null ? conf.top_half_adj_net.toFixed(2) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ===== CONFERENCE DETAIL TAB ===== */}
      {activeTab === 'detail' && (
        <>
          {/* Conference Selector */}
          <div className="conf-selector">
            <div className="filter-group">
              <label htmlFor="conf-select">Conference</label>
              <select
                id="conf-select"
                value={selectedConference}
                onChange={(e) => handleConferenceChange(e.target.value)}
              >
                <option value="">Select a conference...</option>
                {conferences.map((conf) => (
                  <option key={conf} value={conf}>{conf}</option>
                ))}
              </select>
            </div>
          </div>

          {!selectedConference ? (
            <div className="conf-empty-state">
              <div className="empty-icon">🏀</div>
              <p>Select a conference above to view its breakdown</p>
            </div>
          ) : loading ? (
            <div className="conf-loading">Loading conference data...</div>
          ) : (
            <div className="conf-content">

          {/* ===== 1. Conference Header Card ===== */}
          {summary && (
            <div className="conf-header-card">
              <div className="conf-header-info">
                <h2 className="conf-header-name">{selectedConference}</h2>
                <span className="conf-header-meta">
                  {summary.team_count} Teams &bull; {season} Season
                </span>
              </div>
              <div className="conf-header-stats">
                <div className="conf-stat">
                  <span className="conf-stat-label">Avg Adj NET</span>
                  <span className="conf-stat-value">{summary.avg_adj_net?.toFixed(2) || '-'}</span>
                </div>
                <div className="conf-stat">
                  <span className="conf-stat-label">Avg RPI</span>
                  <span className="conf-stat-value">{summary.avg_rpi?.toFixed(4) || '-'}</span>
                </div>
                <div className="conf-stat">
                  <span className="conf-stat-label">Non-Conf Record</span>
                  <span className="conf-stat-value">{summary.non_conf_wins}-{summary.non_conf_losses}</span>
                </div>
                <div className="conf-stat">
                  <span className="conf-stat-label">Avg SOS</span>
                  <span className="conf-stat-value">{summary.avg_sos?.toFixed(4) || '-'}</span>
                </div>
              </div>
            </div>
          )}

          {/* ===== 5. Conference Strength Summary ===== */}
          {thisConfRanking && (
            <div className="conf-strength-section">
              <h3 className="conf-section-title">Conference Strength</h3>
              <div className="conf-strength-cards">
                <div className="strength-card">
                  <span className="strength-label">Adj NET Rank (Conf)</span>
                  <span className="strength-value">#{thisConfRanking.adj_net_rank}</span>
                  <span className="strength-detail">of {confRankings.length} conferences</span>
                </div>
                <div className="strength-card">
                  <span className="strength-label">Best Team RPI</span>
                  <span className="strength-value">#{summary?.best_rpi_rank || '-'}</span>
                </div>
                <div className="strength-card">
                  <span className="strength-label">Worst Team RPI</span>
                  <span className="strength-value">#{summary?.worst_rpi_rank || '-'}</span>
                </div>
                <div className="strength-card">
                  <span className="strength-label">Non-Conf Win%</span>
                  <span className="strength-value">
                    {summary && (summary.non_conf_wins + summary.non_conf_losses) > 0
                      ? ((summary.non_conf_wins / (summary.non_conf_wins + summary.non_conf_losses)) * 100).toFixed(1) + '%'
                      : '-'}
                  </span>
                </div>
                <div className="strength-card">
                  <span className="strength-label">Avg Adj ORTG</span>
                  <span className="strength-value">{summary?.avg_adj_ortg?.toFixed(1) || '-'}</span>
                </div>
                <div className="strength-card">
                  <span className="strength-label">Avg Adj DRTG</span>
                  <span className="strength-value">{summary?.avg_adj_drtg?.toFixed(1) || '-'}</span>
                </div>
              </div>
            </div>
          )}

          {/* ===== Charts Row: Profile + Scatter ===== */}
          <div className="conf-charts-row">
            {/* 3. Conference Profile — Grouped Bar Chart */}
            {profileData.length > 0 && (
              <div className="conf-radar-container">
                <div className="conf-radar-header">
                  <h3>Conference Profile</h3>
                  <span className="conf-radar-subtitle">Conference avg vs. national avg</span>
                </div>
                <div className="conf-profile-chart-wrapper">
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={profileData} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-secondary)" vertical={false} />
                      <XAxis
                        dataKey="metric"
                        tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
                        tickLine={false}
                        axisLine={{ stroke: 'var(--color-border-secondary)' }}
                      />
                      <YAxis
                        tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip content={<ProfileTooltip />} cursor={{ fill: 'var(--color-bg-tertiary)', opacity: 0.5 }} />
                      <Legend
                        wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                        iconType="square"
                        iconSize={10}
                      />
                      <Bar
                        name="Conference"
                        dataKey="conference"
                        fill="var(--color-chart-line)"
                        fillOpacity={0.85}
                        radius={[3, 3, 0, 0]}
                        maxBarSize={28}
                      />
                      <Bar
                        name="National Avg"
                        dataKey="national"
                        fill="var(--color-text-tertiary)"
                        fillOpacity={0.45}
                        radius={[3, 3, 0, 0]}
                        maxBarSize={28}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* 4. Conference Scatter Plot */}
            {confTeams.length > 0 && (
              <div className="conf-scatter-container">
                <div className="conf-scatter-header">
                  <h3>Offense vs Defense</h3>
                  <span className="conf-scatter-subtitle">Adj ORTG vs Adj DRTG (lower DRTG = better defense)</span>
                </div>
                <InsightScatterChart
                  teams={confTeams}
                  xKey="adjusted_offensive_rating"
                  yKey="adjusted_defensive_rating"
                  xLabel="Adj Offensive Rating"
                  yLabel="Adj Defensive Rating"
                  xFormat={(v) => v.toFixed(1)}
                  yFormat={(v) => v.toFixed(1)}
                  invertY={true}
                  onTeamClick={handleTeamClick}
                />
              </div>
            )}
          </div>

          {/* ===== 2. Conference Standings Table ===== */}
          <section className="conf-section">
            <h3 className="conf-section-title">Conference Standings</h3>
            <div className="conf-table-container">
              <table className="conf-standings-table">
                <thead>
                  <tr>
                    <th className="col-rank">#</th>
                    <th className="col-team">Team</th>
                    <th className="col-sortable" onClick={() => handleSort('conf_wins')}>
                      Conf{sortIndicator('conf_wins')}
                    </th>
                    <th className="col-sortable" onClick={() => handleSort('wins')}>
                      Overall{sortIndicator('wins')}
                    </th>
                    <th className="col-sortable" onClick={() => handleSort('rpi_rank')}>
                      RPI Rank{sortIndicator('rpi_rank')}
                    </th>
                    <th className="col-sortable" onClick={() => handleSort('adjusted_net_rating')}>
                      Adj NET{sortIndicator('adjusted_net_rating')}
                    </th>
                    <th className="col-sortable" onClick={() => handleSort('adjusted_offensive_rating')}>
                      Adj ORTG{sortIndicator('adjusted_offensive_rating')}
                    </th>
                    <th className="col-sortable" onClick={() => handleSort('adjusted_defensive_rating')}>
                      Adj DRTG{sortIndicator('adjusted_defensive_rating')}
                    </th>
                    <th className="col-sortable" onClick={() => handleSort('strength_of_schedule')}>
                      SOS{sortIndicator('strength_of_schedule')}
                    </th>
                    <th className="col-sortable" onClick={() => handleSort('naia_win_pct')}>
                      Win%{sortIndicator('naia_win_pct')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {standingsTeams.map((team, index) => (
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
                              <span className="champion-badge" title="Conference Champion">🏆</span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="col-conf-record">
                        {team.conf_wins || 0}-{team.conf_losses || 0}
                      </td>
                      <td>{team.wins || 0}-{team.losses || 0}</td>
                      <td>{team.rpi_rank || '-'}</td>
                      <td>{team.adjusted_net_rating != null ? Number(team.adjusted_net_rating).toFixed(2) : '-'}</td>
                      <td>{team.adjusted_offensive_rating != null ? Number(team.adjusted_offensive_rating).toFixed(1) : '-'}</td>
                      <td>{team.adjusted_defensive_rating != null ? Number(team.adjusted_defensive_rating).toFixed(1) : '-'}</td>
                      <td>{team.strength_of_schedule != null ? Number(team.strength_of_schedule).toFixed(4) : '-'}</td>
                      <td>{team.naia_win_pct != null ? Number(team.naia_win_pct).toFixed(3) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ===== 7. Head-to-Head Matrix ===== */}
          {headToHead && h2hTeams.length > 0 && (
            <section className="conf-section">
              <h3 className="conf-section-title">Head-to-Head Results</h3>
              <div className="conf-table-container h2h-table-container">
                <table className="h2h-matrix-table">
                  <thead>
                    <tr>
                      <th className="h2h-corner"></th>
                      {h2hTeams.map(team => (
                        <th key={team.team_id} className="h2h-col-header" title={team.name}>
                          <TeamLogo logoUrl={team.logo_url} teamName={team.name} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {h2hTeams.map(rowTeam => (
                      <tr key={rowTeam.team_id}>
                        <td className="h2h-row-header">
                          <div className="h2h-team-cell">
                            <TeamLogo logoUrl={rowTeam.logo_url} teamName={rowTeam.name} />
                            <span className="h2h-team-name">{rowTeam.name}</span>
                          </div>
                        </td>
                        {h2hTeams.map(colTeam => {
                          if (rowTeam.team_id === colTeam.team_id) {
                            return <td key={colTeam.team_id} className="h2h-cell h2h-self">—</td>;
                          }

                          const key = `${rowTeam.team_id}-${colTeam.team_id}`;
                          const games = headToHead.matrix[key] || [];

                          if (games.length === 0) {
                            return <td key={colTeam.team_id} className="h2h-cell h2h-unplayed">—</td>;
                          }

                          return (
                            <td key={colTeam.team_id} className="h2h-cell">
                              {games.map((game, idx) => {
                                const cls = game.won ? 'h2h-win' : 'h2h-loss';
                                return (
                                  <div key={idx} className={`h2h-result ${cls}`}>
                                    <span className="h2h-wl">{game.won ? 'W' : 'L'}</span>
                                    <span className="h2h-score">{game.team_score}-{game.opponent_score}</span>
                                  </div>
                                );
                              })}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ===== 6. Conference Schedule (Week-by-Week) ===== */}
          <section className="conf-section">
            <div className="conf-section-header">
              <h3 className="conf-section-title">Conference Schedule</h3>
              <div className="conf-schedule-filters">
                <select
                  value={scheduleTeamFilter}
                  onChange={(e) => setScheduleTeamFilter(e.target.value)}
                  className="schedule-filter-select"
                >
                  <option value="all">All Teams</option>
                  {[...confTeams]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(team => (
                      <option key={team.team_id} value={team.team_id}>{team.name}</option>
                    ))}
                </select>
              </div>
            </div>

            {/* Week Navigation */}
            <div className="week-nav">
              <button
                className="week-nav-btn"
                onClick={goToPrevWeek}
                disabled={!canGoPrevWeek}
                title="Previous week"
              >
                ‹
              </button>
              <div className="week-nav-center">
                <span className="week-nav-label">
                  {formatWeekRange(currentWeekStart, getWeekEnd(currentWeekStart))}
                </span>
                <button className="week-nav-today" onClick={goToCurrentWeek}>
                  Today
                </button>
              </div>
              <button
                className="week-nav-btn"
                onClick={goToNextWeek}
                disabled={!canGoNextWeek}
                title="Next week"
              >
                ›
              </button>
            </div>

            {scheduleLoading ? (
              <div className="conf-loading">Loading schedule...</div>
            ) : weeklySchedule.length === 0 ? (
              <div className="conf-no-data">No conference games this week</div>
            ) : (
              <div className="conf-table-container">
                <table className="conf-schedule-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Away</th>
                      <th></th>
                      <th>Home</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklySchedule.map((game) => (
                      <tr key={game.game_id} className={game.is_completed ? '' : 'upcoming-game'}>
                        <td className="sched-date">{formatDate(game.date)}</td>
                        <td className="sched-team">
                          <div className="sched-team-info">
                            <TeamLogo logoUrl={game.away_team?.logo_url} teamName={game.away_team?.name} />
                            <span>{game.away_team?.name}</span>
                          </div>
                        </td>
                        <td className="sched-score">
                          {game.is_completed ? (
                            <span className="sched-score-display">
                              <span className={game.away_team?.score > game.home_team?.score ? 'score-winner' : ''}>
                                {game.away_team?.score}
                              </span>
                              <span className="score-separator">-</span>
                              <span className={game.home_team?.score > game.away_team?.score ? 'score-winner' : ''}>
                                {game.home_team?.score}
                              </span>
                            </span>
                          ) : (
                            <span className="sched-vs">vs</span>
                          )}
                        </td>
                        <td className="sched-team">
                          <div className="sched-team-info">
                            <TeamLogo logoUrl={game.home_team?.logo_url} teamName={game.home_team?.name} />
                            <span>{game.home_team?.name}</span>
                          </div>
                        </td>
                        <td className="sched-status">
                          {game.is_completed ? (
                            <span className="status-final">Final</span>
                          ) : (
                            <span className="status-upcoming">Upcoming</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
        </>
      )}
    </main>
  );
}

function ConferencesWithErrorBoundary(props) {
  return (
    <ConferenceErrorBoundary>
      <Conferences {...props} />
    </ConferenceErrorBoundary>
  );
}

export default ConferencesWithErrorBoundary;
