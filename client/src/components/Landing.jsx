import { SignInButton, useAuth } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext.jsx';
import logoSrc from '../assets/logo.svg';
import logoDarkSrc from '../assets/logo-dark.svg';
import './Landing.css';

const FEATURES = [
  {
    icon: '📊',
    title: 'Efficiency Ratings',
    desc: 'Adjusted offensive and defensive ratings, net rating, pace, and effective FG% — possession-based metrics that cut through noise in the box score.',
  },
  {
    icon: '🏆',
    title: 'Bracket Forecasting',
    desc: 'Seed projections, quadrant records (Q1/Q2/Q3/Q4), and live tournament brackets updated as results come in.',
  },
  {
    icon: '📈',
    title: 'RPI & Strength of Schedule',
    desc: "The NAIA's official RPI formula calculated daily, plus SOS, opponent win %, and conference-adjusted rankings.",
  },
  {
    icon: '🏀',
    title: 'Player Leaderboards',
    desc: 'Per-game splits, shooting percentages, clutch stats, and filterable rankings for every NAIA player.',
  },
  {
    icon: '🔍',
    title: 'Scout & Matchup',
    desc: 'Head-to-head comparisons, game-by-game logs, and statistical profiles for prepping any opponent.',
  },
  {
    icon: '🗺️',
    title: 'Conference Breakdowns',
    desc: 'Standings, RPI rankings, head-to-head matrices, and strength comparisons across all 21 NAIA conferences.',
  },
];

const PRICING = [
  {
    name: 'Free',
    price: '$0',
    cadence: 'forever',
    tagline: 'Explore team ratings and rankings.',
    features: [
      'Full team ratings & rankings',
      'Conference standings',
      'RPI & Net Rating leaderboards',
      'Basic team pages',
    ],
    cta: 'Get Started',
    highlighted: false,
  },
  {
    name: 'Fan',
    price: '$30',
    cadence: '/month',
    tagline: 'For dedicated followers of the game.',
    features: [
      'Everything in Free',
      'Player stats & leaderboards',
      'Matchup & head-to-head tool',
      'Bracket forecasting',
      'Box score drill-downs',
    ],
    cta: 'Start Fan Access',
    highlighted: true,
  },
  {
    name: 'Coach',
    price: '$300',
    cadence: '/year',
    tagline: 'For programs and staff.',
    features: [
      'Everything in Fan',
      'Full scout report access',
      'Lineup & rotation analytics',
      'Advanced splits (home/away, Q1-Q4)',
      'Priority support',
    ],
    cta: 'Get Coach Access',
    highlighted: false,
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
        {/* Ambient glow */}
        <div className="lp-hero-glow" aria-hidden="true" />

        {/* Tilted full-court underlay */}
        <div className="lp-hero-court-wrap" aria-hidden="true">
          <svg
            className="lp-hero-court"
            viewBox="0 0 940 500"
            preserveAspectRatio="xMidYMid meet"
            focusable="false"
          >
            {/* Outer court */}
            <rect x="10" y="10" width="920" height="480" rx="4" />
            {/* Center line */}
            <line x1="470" y1="10" x2="470" y2="490" />
            {/* Center circles */}
            <circle cx="470" cy="250" r="60" />
            <circle cx="470" cy="250" r="24" />

            {/* LEFT END */}
            {/* Key (paint) */}
            <rect x="10" y="160" width="190" height="180" />
            {/* Free throw circle (solid front half) */}
            <path d="M 200 190 A 60 60 0 0 1 200 310" />
            {/* Free throw circle (dashed back half) */}
            <path d="M 200 190 A 60 60 0 0 0 200 310" strokeDasharray="6 6" />
            {/* Backboard */}
            <line x1="50" y1="220" x2="50" y2="280" strokeWidth="3" />
            {/* Rim */}
            <circle cx="60" cy="250" r="9" />
            {/* Restricted area arc */}
            <path d="M 69 230 A 22 22 0 0 1 69 270" />
            {/* Three-point arc */}
            <path d="M 10 80 L 70 80 A 230 230 0 0 1 70 420 L 10 420" />

            {/* RIGHT END (mirrored) */}
            <rect x="740" y="160" width="190" height="180" />
            <path d="M 740 190 A 60 60 0 0 0 740 310" />
            <path d="M 740 190 A 60 60 0 0 1 740 310" strokeDasharray="6 6" />
            <line x1="890" y1="220" x2="890" y2="280" strokeWidth="3" />
            <circle cx="880" cy="250" r="9" />
            <path d="M 871 230 A 22 22 0 0 0 871 270" />
            <path d="M 930 80 L 870 80 A 230 230 0 0 0 870 420 L 930 420" />
          </svg>
        </div>

        <div className="lp-hero-inner">
          <div className="lp-badge">🏀 Advanced analytics for NAIA basketball</div>
          <h1 className="lp-hero-h1">
            Every possession.<br />
            <span className="lp-hero-accent">Every rating. Every team.</span>
          </h1>
          <p className="lp-hero-sub">
            RPI, strength of schedule, adjusted efficiency ratings, and live bracket forecasting —
            calculated from every box score across all 21 NAIA conferences.
          </p>
          <div className="lp-hero-ctas">
            {ctaButton}
            <a href="#features" className="lp-hero-link">See what's inside ↓</a>
          </div>
          <div className="lp-hero-proof">
            <span className="lp-hero-proof-check">✓</span> 250+ teams
            <span className="lp-hero-proof-sep">·</span>
            <span className="lp-hero-proof-check">✓</span> Updated daily
            <span className="lp-hero-proof-sep">·</span>
            <span className="lp-hero-proof-check">✓</span> Free to explore
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
          <h2 className="lp-section-h2">The rankings you've been waiting for</h2>
          <p className="lp-section-sub">
            Team rankings built from adjusted efficiency and RPI — not record alone.
            Free to explore.
          </p>
          <div className="lp-preview-cta-row">
            <button className="lp-cta-btn-secondary" onClick={() => navigate('/app')}>
              Explore Team Rankings →
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
          <h2 className="lp-section-h2">Built on the numbers that matter</h2>
          <p className="lp-section-sub">
            Every metric calculated from real box score data. No estimates, no filler.
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

      {/* Pricing */}
      <section className="lp-pricing" id="pricing">
        <div className="lp-pricing-inner">
          <h2 className="lp-section-h2">Simple pricing</h2>
          <p className="lp-section-sub">
            Start free. Upgrade whenever you want more.
          </p>
          <div className="lp-pricing-grid">
            {PRICING.map((tier) => (
              <div
                key={tier.name}
                className={`lp-pricing-card${tier.highlighted ? ' lp-pricing-card-featured' : ''}`}
              >
                {tier.highlighted && <div className="lp-pricing-badge">Most popular</div>}
                <h3 className="lp-pricing-name">{tier.name}</h3>
                <div className="lp-pricing-price-row">
                  <span className="lp-pricing-price">{tier.price}</span>
                  <span className="lp-pricing-cadence">{tier.cadence}</span>
                </div>
                <p className="lp-pricing-tagline">{tier.tagline}</p>
                <ul className="lp-pricing-features">
                  {tier.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                {isSignedIn ? (
                  <button
                    className={`lp-pricing-cta${tier.highlighted ? ' lp-pricing-cta-featured' : ''}`}
                    onClick={handleCTA}
                  >
                    Open Dashboard
                  </button>
                ) : (
                  <SignInButton mode="modal">
                    <button
                      className={`lp-pricing-cta${tier.highlighted ? ' lp-pricing-cta-featured' : ''}`}
                    >
                      {tier.cta}
                    </button>
                  </SignInButton>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="lp-final-cta">
        <div className="lp-final-inner">
          <h2 className="lp-final-h2">Start exploring the numbers.</h2>
          <p className="lp-final-sub">
            Free access to ratings, rankings, and conference breakdowns. No credit card required.
          </p>
          <div className="lp-final-actions">
            {ctaButton}
          </div>
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
