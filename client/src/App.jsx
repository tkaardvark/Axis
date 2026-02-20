import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import Header from './components/Header';
import FilterBar from './components/FilterBar';
import StatGroupTabs from './components/StatGroupTabs';
import ViewToggle from './components/ViewToggle';
import TeamsTable from './components/TeamsTable';
import TeamModal from './components/TeamModal';
import ConferenceModal from './components/ConferenceModal';
import SkeletonLoader from './components/SkeletonLoader';
import Footer from './components/Footer';
import { API_URL } from './utils/api';
import './App.css';

// Lazy-load secondary page components for code splitting
const Bracketcast = lazy(() => import('./components/Bracketcast'));
const Insights = lazy(() => import('./components/Insights'));
const Scout = lazy(() => import('./components/Scout'));
const Players = lazy(() => import('./components/Players'));
const Conferences = lazy(() => import('./components/Conferences'));
const Methodology = lazy(() => import('./components/Methodology'));

// Default values for URL params
const DEFAULTS = {
  league: 'mens',
  season: '2025-26',
  conference: 'All Conferences',
  opponent: 'all',
  seasonSegment: 'all',
  statGroup: 'Efficiency',
  view: 'table',
  source: 'auto',
};

// Seasons + leagues with boxscore data available (mirrors backend BOXSCORE_AVAILABLE)
const BOXSCORE_AVAILABLE = new Set(['mens:2025-26']);

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
  const vizFilter = searchParams.get('vizFilter') || 'net50';
  const statGroup = searchParams.get('statGroup') || DEFAULTS.statGroup;
  const view = searchParams.get('view') || DEFAULTS.view;
  const source = searchParams.get('source') || DEFAULTS.source;

  // Resolve effective source: 'auto' lets server decide, 'legacy' forces legacy
  const effectiveSource = source === 'legacy' ? 'legacy'
    : source === 'boxscore' ? 'boxscore'
    : BOXSCORE_AVAILABLE.has(`${league}:${season}`) ? 'boxscore' : 'legacy';

  // Only send explicit source param when overriding (legacy forces legacy, auto lets server decide)
  const sourceParam = source === 'legacy' ? '&source=legacy' : '';

  const [teams, setTeams] = useState([]);
  const [conferences, setConferences] = useState([]);
  const [months, setMonths] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedConference, setSelectedConference] = useState(null);
  const [hasPlayers, setHasPlayers] = useState(false);

  // Deep link support: read modal params from URL
  const teamModalId = searchParams.get('teamModal');
  const conferenceModalName = searchParams.get('conferenceModal');

  // Track intentional closes to prevent deep-link effect from re-opening
  const closingTeamModal = useRef(false);
  const closingConfModal = useRef(false);

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
  const setSource = useCallback((value) => updateParams({ source: value }), [updateParams]);

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
  const filters = { conference, opponent, seasonSegment, vizFilter };

  // Determine current page from pathname
  const getCurrentPage = () => {
    const path = location.pathname;
    if (path.startsWith('/conferences')) return 'conferences';
    if (path.startsWith('/bracketcast')) return 'bracketcast';
    if (path.startsWith('/scout')) return 'scout';
    if (path.startsWith('/methodology')) return 'methodology';
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
        setError(null);
      } catch (err) {
        console.error('Error fetching metadata:', err);
        setError('Unable to connect to the server. Please try again.');
      }
    };
    fetchMetadata();
  }, [league, season]);

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Handle seasonSegment - some values are season types, not segments
      const seasonTypeMap = {
        'regular': 'Regular Season',
        'postseason': 'Conference Tournament',
        'national': 'National Tournament'
      };

      let url = `${API_URL}/api/teams?league=${league}&season=${season}${sourceParam}`;

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
    } catch (err) {
      console.error('Error fetching teams:', err);
      setTeams([]);
      setError('Unable to load team data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [league, season, conference, opponent, seasonSegment, sourceParam]);

  // Fetch teams when relevant params change
  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const handleTeamClick = useCallback((team) => {
    setSelectedTeam(team);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('teamModal', team.team_id);
      return p;
    });
  }, [setSearchParams]);

  const handleCloseModal = useCallback(() => {
    closingTeamModal.current = true;
    setSelectedTeam(null);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.delete('teamModal');
      return p;
    });
  }, [setSearchParams]);

  const handleConferenceClick = useCallback((conferenceName) => {
    setSelectedConference(conferenceName);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('conferenceModal', conferenceName);
      return p;
    });
  }, [setSearchParams]);

  const handleCloseConferenceModal = useCallback(() => {
    closingConfModal.current = true;
    setSelectedConference(null);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.delete('conferenceModal');
      return p;
    });
  }, [setSearchParams]);

  // Deep link: open team modal from URL param on load
  useEffect(() => {
    if (closingTeamModal.current) {
      if (!teamModalId) closingTeamModal.current = false;
      return;
    }
    if (teamModalId && !selectedTeam && teams.length > 0) {
      const team = teams.find(t => String(t.team_id) === String(teamModalId));
      if (team) {
        setSelectedTeam(team);
      }
    }
  }, [teamModalId, teams, selectedTeam]);

  // Deep link: open conference modal from URL param on load
  useEffect(() => {
    if (closingConfModal.current) {
      if (!conferenceModalName) closingConfModal.current = false;
      return;
    }
    if (conferenceModalName && !selectedConference) {
      setSelectedConference(conferenceModalName);
    }
  }, [conferenceModalName, selectedConference]);

  const handleFilterChange = (key, value) => {
    updateParams({ [key]: value });
  };

  const handleFilterReset = () => {
    updateParams({
      conference: DEFAULTS.conference,
      opponent: DEFAULTS.opponent,
      seasonSegment: DEFAULTS.seasonSegment,
      vizFilter: 'net50',
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
        view={view}
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
            onConferenceClick={handleConferenceClick}
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
          teamFilter={vizFilter}
        />
      )}
    </>
  );

  return (
    <div className="app">
      <a href="#main-content" className="skip-link">Skip to content</a>
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
        source={source}
        effectiveSource={effectiveSource}
        onSourceChange={setSource}
      />
      <main id="main-content" className="main-content">
        {error && (
          <div className="error-banner">
            <p>{error}</p>
            <button onClick={fetchTeams}>Retry</button>
          </div>
        )}
        <Suspense fallback={<SkeletonLoader variant="table" rows={10} />}>
          <Routes>
            <Route path="/" element={<TeamsPage />} />
            <Route path="/teams" element={<Navigate to="/" replace />} />
            <Route path="/insights" element={<Navigate to="/?view=charts" replace />} />
            <Route
              path="/conferences"
              element={
                <Conferences
                  league={league}
                  season={season}
                  conferences={conferences}
                  teams={teams}
                  sourceParam={sourceParam}
                />
              }
            />
            <Route
              path="/bracketcast"
              element={
                <Bracketcast
                  league={league}
                  season={season}
                  onTeamClick={handleTeamClick}
                  sourceParam={sourceParam}
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
                  sourceParam={sourceParam}
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
                  sourceParam={sourceParam}
                />
              }
            />
            <Route path="/methodology" element={<Methodology />} />
            <Route
              path="*"
              element={
                <div className="not-found">
                  <h1>404</h1>
                  <p>Page not found</p>
                  <button onClick={() => navigate('/')}>Go to Teams</button>
                </div>
              }
            />
          </Routes>
        </Suspense>
      </main>
      <Footer />
      {selectedTeam && (
        <TeamModal
          team={selectedTeam}
          onClose={handleCloseModal}
          league={league}
          season={season}
          sourceParam={sourceParam}
        />
      )}
      {selectedConference && (
        <ConferenceModal
          conferenceName={selectedConference}
          league={league}
          season={season}
          onClose={handleCloseConferenceModal}
          onTeamClick={handleTeamClick}
          sourceParam={sourceParam}
        />
      )}
    </div>
  );
}

export default App;
