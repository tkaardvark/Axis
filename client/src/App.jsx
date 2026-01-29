import { useState, useEffect } from 'react';
import Header from './components/Header';
import FilterBar from './components/FilterBar';
import TeamsTable from './components/TeamsTable';
import TeamModal from './components/TeamModal';
import Bracketcast from './components/Bracketcast';
import './App.css';

// In production, API is served from same origin (empty string)
// In development, use localhost:3001
const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:3001');

function App() {
  const [teams, setTeams] = useState([]);
  const [conferences, setConferences] = useState([]);
  const [months, setMonths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [league, setLeague] = useState('mens');
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [currentPage, setCurrentPage] = useState('teams');

  const [filters, setFilters] = useState({
    season: '2025-26',
    conference: 'All Conferences',
    opponent: 'all',
    seasonSegment: 'all',
    statGroup: 'Overview',
  });

  const fetchTeams = async (currentLeague = league) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        league: currentLeague,
        ...(filters.conference !== 'All Conferences' && { conference: filters.conference }),
        ...(filters.opponent === 'conference' && { gameType: 'conference' }),
        ...(filters.seasonSegment !== 'all' && { seasonSegment: filters.seasonSegment }),
      });

      const response = await fetch(`${API_URL}/api/teams?${params}`);
      const data = await response.json();
      setTeams(data);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to fetch teams:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchConferences = async (currentLeague = league) => {
    try {
      const response = await fetch(`${API_URL}/api/conferences?league=${currentLeague}`);
      const data = await response.json();
      setConferences(data);
    } catch (error) {
      console.error('Failed to fetch conferences:', error);
    }
  };

  const fetchMonths = async (currentLeague = league) => {
    try {
      const response = await fetch(`${API_URL}/api/months?league=${currentLeague}`);
      const data = await response.json();
      setMonths(data);
    } catch (error) {
      console.error('Failed to fetch months:', error);
    }
  };

  useEffect(() => {
    fetchConferences();
    fetchMonths();
    fetchTeams();
  }, []);

  const handleLeagueChange = (newLeague) => {
    if (newLeague !== league) {
      setLeague(newLeague);
      // Reset conference filter when switching leagues
      setFilters(prev => ({ ...prev, conference: 'All Conferences' }));
      // Fetch new data for the selected league
      fetchConferences(newLeague);
      fetchMonths(newLeague);
      fetchTeams(newLeague);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleApplyFilters = () => {
    fetchTeams();
  };

  const handleResetFilters = () => {
    const defaultFilters = {
      season: '2025-26',
      conference: 'All Conferences',
      opponent: 'all',
      seasonSegment: 'all',
      statGroup: 'Overview',
    };
    setFilters(defaultFilters);
    // Fetch with default filters immediately
    setLoading(true);
    const params = new URLSearchParams({ league });
    fetch(`${API_URL}/api/teams?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setTeams(data);
        setLastUpdated(new Date());
      })
      .catch((err) => console.error('Error fetching teams:', err))
      .finally(() => setLoading(false));
  };

  const formatLastUpdated = () => {
    if (!lastUpdated) return '';
    return lastUpdated.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    });
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  return (
    <div className="app">
      <Header
        league={league}
        onLeagueChange={handleLeagueChange}
        activePage={currentPage}
        onPageChange={handlePageChange}
      />

      {currentPage === 'teams' ? (
        <main className="main-content">
          <div className="page-header">
            <h1>NAIA {league === 'mens' ? "Men's" : "Women's"} Basketball Team Stats</h1>
            {lastUpdated && (
              <p className="last-updated">Last Updated {formatLastUpdated()}</p>
            )}
          </div>

          <FilterBar
            conferences={conferences}
            months={months}
            filters={filters}
            onFilterChange={handleFilterChange}
            onApply={handleApplyFilters}
            onReset={handleResetFilters}
          />

          <TeamsTable
            teams={teams}
            loading={loading}
            statGroup={filters.statGroup}
            onTeamClick={setSelectedTeam}
          />
        </main>
      ) : (
        <Bracketcast league={league} onTeamClick={setSelectedTeam} />
      )}

      {selectedTeam && (
        <TeamModal team={selectedTeam} onClose={() => setSelectedTeam(null)} />
      )}
    </div>
  );
}

export default App;
