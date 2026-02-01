import './Header.css';
import logoSrc from '../assets/logo.svg';
import { useTheme } from '../contexts/ThemeContext.jsx';

const PAGE_LABELS = {
  teams: 'Teams',
  bracketcast: 'Bracketcast',
  scout: 'Scout',
  insights: 'Insights'
};

function Header({ league, onLeagueChange, activePage, onPageChange, season, seasons, onSeasonChange, lastUpdated }) {
  const { theme, toggleTheme } = useTheme();

  const formatLastUpdated = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    });
  };

  return (
    <div className="header-wrapper">
      {/* Top bar: Logo | Last Updated | Theme Toggle */}
      <header className="header-top">
        <div className="header-left">
          <div className="logo">
            <img src={logoSrc} alt="Axis Analytics" className="logo-icon" />
            <span className="logo-text">Axis Analytics</span>
          </div>
        </div>

        <div className="header-center">
          {lastUpdated && (
            <span className="last-updated">
              Last Updated {formatLastUpdated(lastUpdated)}
            </span>
          )}
        </div>

        <div className="header-right">
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? (
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2"/>
                <line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Navigation bar: Dropdowns (left) | Page Nav (right) */}
      <nav className="header-nav">
        <div className="nav-left">
          <div className="dropdown-selector">
            <select
              value={league}
              onChange={(e) => onLeagueChange(e.target.value)}
            >
              <option value="mens">Men's Basketball</option>
              <option value="womens">Women's Basketball</option>
            </select>
          </div>
          {seasons.length > 0 && (
            <div className="dropdown-selector">
              <select
                value={season}
                onChange={(e) => onSeasonChange(e.target.value)}
              >
                {seasons.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}
          {/* Mobile-only page dropdown */}
          <div className="dropdown-selector nav-dropdown-mobile">
            <select
              value={activePage}
              onChange={(e) => onPageChange(e.target.value)}
            >
              {Object.entries(PAGE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="nav-right">
          <button
            className={`nav-button ${activePage === 'teams' ? 'active' : ''}`}
            onClick={() => onPageChange('teams')}
          >
            Teams
          </button>
          <button
            className={`nav-button ${activePage === 'bracketcast' ? 'active' : ''}`}
            onClick={() => onPageChange('bracketcast')}
          >
            Bracketcast
          </button>
          <button
            className={`nav-button ${activePage === 'scout' ? 'active' : ''}`}
            onClick={() => onPageChange('scout')}
          >
            Scout
          </button>
          <button
            className={`nav-button ${activePage === 'insights' ? 'active' : ''}`}
            onClick={() => onPageChange('insights')}
          >
            Insights
          </button>
        </div>
      </nav>
    </div>
  );
}

export default Header;
