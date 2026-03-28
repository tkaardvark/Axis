import { SignInButton, useAuth } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext.jsx';
import logoSrc from '../assets/logo.svg';
import logoDarkSrc from '../assets/logo-dark.svg';
import './Landing.css';

const FEATURES = [
  {
    icon: '📊',
    title: 'Advanced Team Ratings',
    desc: 'Adjusted offensive & defensive ratings, net rating, RPI, strength of schedule — all calculated from real box score data.',
  },
  {
    icon: '🏀',
    title: 'Player Analytics',
    desc: 'Per-game splits, shooting percentages, clutch stats, and filterable leaderboards for every NAIA player.',
  },
  {
    icon: '🏆',
    title: 'Tournament Bracket',
    desc: 'Live bracket tracker with quadrant records, seed projections, and conference tournament results.',
  },
  {
    icon: '🔍',
    title: 'Scout & Matchup Tool',
    desc: 'Head-to-head comparisons, game logs, and statistical profiles to prep for any opponent.',
  },
  {
    icon: '📈',
    title: 'Conference Breakdowns',
    desc: 'Conference standings, RPI rankings, strength comparisons, and head-to-head matrices.',
  },
  {
    icon: '⚡',
    title: 'Updated Daily',
    desc: 'Box scores scraped and processed multiple times daily — never coach off stale numbers.',
  },
];

const TESTIMONIALS = [
  {
    quote: "Finally, real analytics for NAIA basketball. This is the edge we've been missing.",
    author: 'NAIA Head Coach',
  },
  {
    quote: "I use Axis before every film session. The matchup tool alone is worth it.",
    author: 'Assistant Coach',
  },
  {
    quote: "As a fan, I can finally see which teams are actually good — not just who has the best record.",
    author: 'NAIA Basketball Fan',
  },
];

const STATS = [
  { value: '250+', label: 'Teams Tracked' },
  { value: '5,000+', label: 'Games Analyzed' },
  { value: '30+', label: 'Advanced Metrics' },
  { value: '24/7', label: 'Data Updates' },
];

export default function Landing() {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const handleCTA = () => {
    if (isSignedIn) {
      navigate('/app');
    }
  };

  const ctaButton = isSignedIn ? (
    <button className="lp-cta-btn" onClick={handleCTA}>
      Go to Dashboard →
    </button>
  ) : (
    <SignInButton mode="modal">
      <button className="lp-cta-btn">Get Started Free →</button>
    </SignInButton>
  );

  const secondaryCTA = isSignedIn ? (
    <button className="lp-cta-btn-secondary" onClick={handleCTA}>
      Open App
    </button>
  ) : (
    <SignInButton mode="modal">
      <button className="lp-cta-btn-secondary">Create Free Account</button>
    </SignInButton>
  );

  return (
    <div className="lp">
      {/* Nav */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <div className="lp-nav-brand">
            <img src={theme === 'dark' ? logoDarkSrc : logoSrc} alt="" className="lp-nav-logo" />
            <span className="lp-nav-name">Axis Analytics</span>
          </div>
          <div className="lp-nav-actions">
            <button className="lp-theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
            {isSignedIn ? (
              <button className="lp-nav-cta" onClick={handleCTA}>Open App</button>
            ) : (
              <>
                <SignInButton mode="modal">
                  <button className="lp-nav-link">Sign In</button>
                </SignInButton>
                <SignInButton mode="modal">
                  <button className="lp-nav-cta">Get Started</button>
                </SignInButton>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="lp-hero">
        <div className="lp-hero-inner">
          <div className="lp-badge">🏀 Built for NAIA Basketball</div>
          <h1 className="lp-hero-h1">
            The Analytics Edge<br />
            <span className="lp-hero-accent">Your Program Deserves</span>
          </h1>
          <p className="lp-hero-sub">
            Advanced ratings, player analytics, matchup tools, and tournament projections — 
            all built from real box score data, updated daily. Stop guessing. Start winning.
          </p>
          <div className="lp-hero-ctas">
            {ctaButton}
            <a href="#features" className="lp-hero-link">See what's inside ↓</a>
          </div>
          <div className="lp-hero-proof">
            <span className="lp-hero-proof-check">✓</span> Free to start
            <span className="lp-hero-proof-sep">·</span>
            <span className="lp-hero-proof-check">✓</span> No credit card required
            <span className="lp-hero-proof-sep">·</span>
            <span className="lp-hero-proof-check">✓</span> 250+ NAIA teams
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="lp-stats-bar">
        <div className="lp-stats-inner">
          {STATS.map((s) => (
            <div key={s.label} className="lp-stat">
              <span className="lp-stat-value">{s.value}</span>
              <span className="lp-stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Preview */}
      <section className="lp-preview">
        <div className="lp-preview-inner">
          <h2 className="lp-section-h2">See the game differently</h2>
          <p className="lp-section-sub">
            Explore team rankings powered by advanced metrics — completely free. 
            Sign up to unlock player stats, matchup tools, and more.
          </p>
          <div className="lp-preview-cta-row">
            <button className="lp-cta-btn-secondary" onClick={() => navigate('/app')}>
              Try the Teams Page — Free →
            </button>
          </div>
          <div className="lp-preview-box">
            <div className="lp-preview-header">
              <span className="lp-preview-dot lp-dot-red" />
              <span className="lp-preview-dot lp-dot-yellow" />
              <span className="lp-preview-dot lp-dot-green" />
              <span className="lp-preview-header-title">Axis Analytics — Teams</span>
            </div>
            <div className="lp-preview-content">
              <table className="lp-preview-table">
                <thead>
                  <tr>
                    <th>#</th><th>Team</th><th>Record</th><th>AdjOE</th><th>AdjDE</th><th>Net Rtg</th><th>RPI</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>1</td><td>Indiana Wesleyan</td><td>32-4</td><td>112.3</td><td>88.1</td><td className="lp-good">+24.2</td><td>.6842</td></tr>
                  <tr><td>2</td><td>Southeastern</td><td>30-5</td><td>109.8</td><td>89.5</td><td className="lp-good">+20.3</td><td>.6701</td></tr>
                  <tr><td>3</td><td>Marian</td><td>28-6</td><td>108.4</td><td>90.2</td><td className="lp-good">+18.2</td><td>.6598</td></tr>
                  <tr><td>4</td><td>Concordia</td><td>27-7</td><td>106.9</td><td>91.1</td><td className="lp-good">+15.8</td><td>.6445</td></tr>
                  <tr className="lp-blur-row"><td>5</td><td>Georgetown (KY)</td><td>26-7</td><td>105.2</td><td>91.8</td><td>+13.4</td><td>.6320</td></tr>
                </tbody>
              </table>
              <div className="lp-preview-fade" />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="lp-features" id="features">
        <div className="lp-features-inner">
          <h2 className="lp-section-h2">Everything you need to break down the game</h2>
          <p className="lp-section-sub">
            Purpose-built for NAIA basketball. No fluff, no bloat — just the numbers that matter.
          </p>
          <div className="lp-features-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="lp-feature-card">
                <span className="lp-feature-icon">{f.icon}</span>
                <h3 className="lp-feature-title">{f.title}</h3>
                <p className="lp-feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="lp-social" id="testimonials">
        <div className="lp-social-inner">
          <h2 className="lp-section-h2">Trusted by coaches and fans</h2>
          <div className="lp-testimonials">
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className="lp-testimonial">
                <p className="lp-testimonial-quote">"{t.quote}"</p>
                <p className="lp-testimonial-author">— {t.author}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="lp-how">
        <div className="lp-how-inner">
          <h2 className="lp-section-h2">Up and running in 30 seconds</h2>
          <div className="lp-how-steps">
            <div className="lp-how-step">
              <div className="lp-how-num">1</div>
              <h3>Create your free account</h3>
              <p>Sign up with email or Google — no credit card needed.</p>
            </div>
            <div className="lp-how-arrow">→</div>
            <div className="lp-how-step">
              <div className="lp-how-num">2</div>
              <h3>Explore your team</h3>
              <p>Find any NAIA team and dive into their advanced stats.</p>
            </div>
            <div className="lp-how-arrow">→</div>
            <div className="lp-how-step">
              <div className="lp-how-num">3</div>
              <h3>Gain the edge</h3>
              <p>Use matchup tools, player data, and projections to prepare smarter.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="lp-final-cta">
        <div className="lp-final-inner">
          <h2 className="lp-final-h2">Ready to see the game differently?</h2>
          <p className="lp-final-sub">
            Join coaches and fans already using Axis Analytics to break down NAIA basketball.
          </p>
          <div className="lp-final-actions">
            {ctaButton}
          </div>
          <p className="lp-final-note">Free forever for basic access. No credit card required.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <img src={theme === 'dark' ? logoDarkSrc : logoSrc} alt="" className="lp-footer-logo" />
            <span>Axis Analytics</span>
          </div>
          <p className="lp-footer-copy">© {new Date().getFullYear()} Axis Analytics. All rights reserved.</p>
        </div>
      </footer>

      {/* Sticky mobile CTA */}
      <div className="lp-sticky-cta">
        {secondaryCTA}
      </div>
    </div>
  );
}
