import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import Header from './components/Header';
import FilterBar from './components/FilterBar';
import StatGroupTabs from './components/StatGroupTabs';
import ViewToggle from './components/ViewToggle';
import TeamsTable from './components/TeamsTable';
import TeamModal from './components/TeamModal';
import Bracketcast from './components/Bracketcast';
import Insights from './components/Insights';
import Scout from './components/Scout';
import Players from './components/Players';
import './App.css';

// In production, API is served from same origin (empty string)
// In development, use localhost:3001
const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:3001');

// Default values for URL params
const DEFAULTS = {
  league: 'mens',
  season: '2025-26',
  conference: 'All Conferences',
  opponent: 'all',
  seasonSegment: 'all',
  statGroup: 'Efficiency',
  view: 'table',
};

function App() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Extract params from URL with defaults
  const league = searchParams.get('league') || DEFAULTS.league;
  const season = searchParams.get('season') || DEFAULTS.season;
  const conference = searchParams.get('conference') || DEFAULTS.conference;
  const opponent = searchParams.get('opponent') || DEFAULTS.opponent;
  const seasonSegment = searchParams.get('seasonSegment') || DEFAULTS.seasonSegment;
  const statGroup = searchParams.get('statGroup') || DEFAULTS.statGroup;
  const view = searchParams.get('view') || DEFAULTS.view;

  const [teams, setTeams] = useState([]);
  const [conferences, setConferences] = useState([]);
  const [months, setMonths] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [hasPlayers, setHasPlayers] = useState(false);

  // Helper to update URL params
  const updateParams = useCallback((updates) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      Object.entries(updates).forEach(([key, value]) => {
        if (value === DEFAULTS[key]) {
          newParams.delete(key);
        } else {
          newParams.set(key, value);
        }
      });
      return newParams;
    });
  }, [setSearchParams]);

  // Wrapped setters that update URL
  const setLeague = useCallback((value) => updateParams({ league: value }), [updateParams]);
  const setSeason = useCallback((value) => updateParams({ season: value }), [updateParams]);
  const setStatGroup = useCallback((value) => updateParams({ statGroup: value }), [updateParams]);
  const setView = useCallback((value) => updateParams({ view: value }), [updateParams]);

  const setFilters = useCallback((updater) => {
    if (typeof updater === 'function') {
      const currentFilters = { conference, opponent, seasonSegment };
      const newFilters = updater(currentFilters);
      updateParams(newFilters);
    } else {
      updateParams(updater);
    }
  }, [conference, opponent, seasonSegment, updateParams]);

  // Derive filters object from URL params
  const filters = { conference, opponent, seasonSegment };

  // Determine current page from pathname
  const getCurrentPage = () => {
    const path = location.pathname;
    if (path.startsWith('/bracketcast')) return 'bracketcast';
    if (path.startsWith('/scout')) return 'scout';
    if (path.startsWith('/players')) return 'players';
    return 'teams';
  };

  const currentPage = getCurrentPage();

  const setCurrentPage = useCallback((page) => {
    // Preserve current search params when navigating
    const params = searchParams.toString();
    const newPath = page === 'teams' ? '/' : `/${page}`;
    navigate(params ? `${newPath}?${params}` : newPath);
  }, [navigate, searchParams]);

  // Fetch metadata (seasons, conferences, months) - only when league changes
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [seasonsRes, conferencesRes, monthsRes, lastUpdatedRes, playersExistsRes] = await Promise.all([
          fetch(`${API_URL}/api/seasons?league=${league}`),
          fetch(`${API_URL}/api/conferences?league=${league}&season=${season}`),
          fetch(`${API_URL}/api/months?league=${league}&season=${season}`),
          fetch(`${API_URL}/api/last-updated?league=${league}&season=${season}`),
          fetch(`${API_URL}/api/players/exists?league=${league}&season=${season}`),
        ]);
        
        const seasonsData = await seasonsRes.json();
        const conferencesData = await conferencesRes.json();
        const monthsData = await monthsRes.json();
        const lastUpdatedData = await lastUpdatedRes.json();
        const playersExistsData = await playersExistsRes.json();
        
        setSeasons(seasonsData || []);
        setConferences(conferencesData || []);
        setMonths(monthsData || []);
        setLastUpdated(lastUpdatedData.lastUpdated || null);
        setHasPlayers(playersExistsData.hasPlayers || false);
      } catch (error) {
        console.error('Error fetching metadata:', error);
      }
    };
    fetchMetadata();
  }, [league, season]);

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    try {
      // Handle seasonSegment - some values are season types, not segments
      const seasonTypeMap = {
        'regular': 'Regular Season',
        'postseason': 'Conference Tournament',
        'national': 'National Tournament'
      };

      let url = `${API_URL}/api/teams?league=${league}&season=${season}`;
      
      if (conference !== 'All Conferences') {
        url += `&conference=${encodeURIComponent(conference)}`;
      }
      if (opponent !== 'all') {
        url += `&gameType=${encodeURIComponent(opponent)}`;
      }
      if (seasonSegment !== 'all') {
        if (seasonTypeMap[seasonSegment]) {
          url += `&seasonType=${encodeURIComponent(seasonTypeMap[seasonSegment])}`;
        } else {
          url += `&seasonSegment=${encodeURIComponent(seasonSegment)}`;
        }
      }

      const response = await fetch(url);
      const teamsData = await response.json();
      setTeams(Array.isArray(teamsData) ? teamsData : []);
    } catch (error) {
      console.error('Error fetching teams:', error);
      setTeams([]);
    } finally {
      setLoading(false);
    }
  }, [league, season, conference, opponent, seasonSegment]);

  // Fetch teams when relevant params change
  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const handleTeamClick = (team) => {
    setSelectedTeam(team);
  };

  const handleCloseModal = () => {
    setSelectedTeam(null);
  };

  const handleFilterChange = (key, value) => {
    updateParams({ [key]: value });
  };

  const handleFilterReset = () => {
    updateParams({
      conference: DEFAULTS.conference,
      opponent: DEFAULTS.opponent,
      seasonSegment: DEFAULTS.seasonSegment,
    });
  };

  const leagueLabel = league === 'mens' ? "Men's" : "Women's";

  // Teams page content
  const TeamsPage = () => (
    <>
      <div className="page-header">
        <h1>Teams</h1>
        <p className="page-subtitle">Compare team statistics, ratings, and performance metrics across the {leagueLabel.toLowerCase()} division</p>
      </div>
      <ViewToggle activeView={view} onViewChange={setView} />
      <FilterBar
        conferences={conferences}
        months={months}
        filters={filters}
        onFilterChange={handleFilterChange}
        onReset={handleFilterReset}
      />
      {view === 'table' ? (
        <>
          <StatGroupTabs
            active={statGroup}
            onChange={setStatGroup}
          />
          <TeamsTable
            teams={teams}
            loading={loading}
            onTeamClick={handleTeamClick}
            statGroup={statGroup}
            league={league}
            season={season}
            filters={filters}
          />
        </>
      ) : (
        <Insights
          teams={teams}
          conferences={conferences}
          loading={loading}
          league={league}
          season={season}
          onTeamClick={handleTeamClick}
          embedded={true}
        />
      )}
    </>
  );

  return (
    <div className="app">
      <Header
        league={league}
        onLeagueChange={setLeague}
        season={season}
        onSeasonChange={setSeason}
        seasons={seasons}
        lastUpdated={lastUpdated}
        activePage={currentPage}
        onPageChange={setCurrentPage}
        hasPlayers={hasPlayers}
      />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<TeamsPage />} />
          <Route path="/teams" element={<Navigate to="/" replace />} />
          <Route path="/insights" element={<Navigate to="/?view=visualizations" replace />} />
          <Route
            path="/bracketcast"
            element={
              <Bracketcast
                league={league}
                season={season}
                onTeamClick={handleTeamClick}
              />
            }
          />
          <Route
            path="/scout"
            element={
              <Scout
                league={league}
                season={season}
                teams={teams}
                conferences={conferences}
              />
            }
          />
          <Route
            path="/players"
            element={
              <Players
                league={league}
                season={season}
                conferences={conferences}
              />
            }
          />
        </Routes>
      </main>
      {selectedTeam && (
        <TeamModal
          team={selectedTeam}
          onClose={handleCloseModal}
          league={league}
          season={season}
        />
      )}
    </div>
  );
}

export default App;
