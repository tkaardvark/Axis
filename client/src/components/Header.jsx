import './Header.css';
import logoSrc from '../assets/logo.svg';
import { useTheme } from '../contexts/ThemeContext.jsx';

function Header({ league, onLeagueChange, activePage, onPageChange }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="header-wrapper">
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <img src={logoSrc} alt="Axis Analytics" className="logo-icon" />
            <span className="logo-text">Axis Analytics</span>
          </div>
        </div>

        <nav className="primary-nav">
          <a
            href="#"
            className={`primary-nav-link ${league === 'mens' ? 'active' : ''}`}
            onClick={(e) => { e.preventDefault(); onLeagueChange('mens'); }}
          >
            Men's
          </a>
          <a
            href="#"
            className={`primary-nav-link ${league === 'womens' ? 'active' : ''}`}
            onClick={(e) => { e.preventDefault(); onLeagueChange('womens'); }}
          >
            Women's
          </a>
        </nav>

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

      <nav className="secondary-nav">
        <a
          href="#"
          className={`secondary-nav-link ${activePage === 'teams' ? 'active' : ''}`}
          onClick={(e) => { e.preventDefault(); onPageChange('teams'); }}
        >
          Teams
        </a>
        <a
          href="#"
          className={`secondary-nav-link ${activePage === 'bracketcast' ? 'active' : ''}`}
          onClick={(e) => { e.preventDefault(); onPageChange('bracketcast'); }}
        >
          Bracketcast
        </a>
      </nav>
    </div>
  );
}

export default Header;
