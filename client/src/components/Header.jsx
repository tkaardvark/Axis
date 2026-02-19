import './Header.css';
import logoSrc from '../assets/logo.svg';
import logoDarkSrc from '../assets/logo-dark.svg';
import { useTheme } from '../contexts/ThemeContext.jsx';

function Header({ league, onLeagueChange, activePage, onPageChange, season, seasons, onSeasonChange, lastUpdated, hasPlayers, source, effectiveSource, onSourceChange }) {
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
            <img src={theme === 'dark' ? logoDarkSrc : logoSrc} alt="Axis Analytics" className="logo-icon" />
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
          {onSourceChange && (
            <button
              className={`source-toggle${source === 'legacy' ? ' legacy' : ' active'}`}
              onClick={() => onSourceChange(source === 'legacy' ? 'auto' : 'legacy')}
              aria-label={source === 'legacy' ? 'Switch back to auto data source' : 'Force legacy data source'}
              title={effectiveSource === 'boxscore' ? 'Using Box Score data (click for legacy)' : 'Using Legacy data'}
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18">
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
                <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" strokeWidth="2"/>
                <line x1="3" y1="15" x2="21" y2="15" stroke="currentColor" strokeWidth="2"/>
                <line x1="9" y1="3" x2="9" y2="21" stroke="currentColor" strokeWidth="2"/>
                <line x1="15" y1="3" x2="15" y2="21" stroke="currentColor" strokeWidth="2"/>
              </svg>
              <span className="source-toggle-label">{effectiveSource === 'boxscore' ? 'Box Score' : 'Legacy'}</span>
            </button>
          )}
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
      <nav className="header-nav" aria-label="Main navigation">
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
          {/* Page nav dropdown for medium screens */}
          <div className="dropdown-selector nav-page-dropdown">
            <select
              value={activePage}
              onChange={(e) => onPageChange(e.target.value)}
            >
              <option value="teams">Teams</option>
              {hasPlayers && <option value="players">Players</option>}
              <option value="conferences">Conferences</option>
              <option value="bracketcast">Bracketcast</option>
              <option value="scout">Scout</option>
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
          {hasPlayers && (
            <button
              className={`nav-button ${activePage === 'players' ? 'active' : ''}`}
              onClick={() => onPageChange('players')}
            >
              Players
            </button>
          )}
          <button
            className={`nav-button ${activePage === 'conferences' ? 'active' : ''}`}
            onClick={() => onPageChange('conferences')}
          >
            Conferences
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
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <nav className="mobile-tab-bar" aria-label="Page navigation">
        <button
          className={`tab-bar-item ${activePage === 'teams' ? 'active' : ''}`}
          onClick={() => onPageChange('teams')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
          </svg>
          <span>Teams</span>
        </button>
        {hasPlayers && (
          <button
            className={`tab-bar-item ${activePage === 'players' ? 'active' : ''}`}
            onClick={() => onPageChange('players')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>Players</span>
          </button>
        )}
        <button
          className={`tab-bar-item ${activePage === 'conferences' ? 'active' : ''}`}
          onClick={() => onPageChange('conferences')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
          <span>Conf</span>
        </button>
        <button
          className={`tab-bar-item ${activePage === 'bracketcast' ? 'active' : ''}`}
          onClick={() => onPageChange('bracketcast')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <span>Bracket</span>
        </button>
        <button
          className={`tab-bar-item ${activePage === 'scout' ? 'active' : ''}`}
          onClick={() => onPageChange('scout')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span>Scout</span>
        </button>
      </nav>
    </div>
  );
}

export default Header;
