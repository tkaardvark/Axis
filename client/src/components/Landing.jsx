import { useEffect, useRef, useState } from 'react';
import { SignInButton, UserButton, useAuth } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import logoSrc from '../assets/logo.svg';
import logoDarkSrc from '../assets/logo-dark.svg';
import './Landing.css';

const FEATURES = [
  {
    tag: 'Ratings',
    title: 'Efficiency Ratings',
    desc: 'Adjusted offensive and defensive ratings, net rating, pace, and effective FG% — possession-based metrics that cut through the noise.',
    preview: (
      <div className="lp-fpreview-metrics">
        <div className="lp-fpreview-metric"><span>AdjOE</span><strong>112.3</strong><em>+24.2</em></div>
        <div className="lp-fpreview-metric"><span>AdjDE</span><strong>88.1</strong><em className="lp-fpreview-neg">−14.8</em></div>
        <div className="lp-fpreview-metric"><span>Pace</span><strong>70.4</strong><em>avg</em></div>
        <div className="lp-fpreview-metric"><span>eFG%</span><strong>54.1</strong><em>+3.2</em></div>
      </div>
    ),
  },
  {
    tag: 'Bracketcast',
    title: 'Bracket Forecasting',
    desc: 'Seed projections, quadrant records (Q1–Q4), and live tournament brackets updated as results come in.',
    preview: (
      <div className="lp-fpreview-bracket">
        <div className="lp-fpreview-match">
          <div className="lp-fpreview-row"><span>1</span>Indiana Wesleyan<strong>84</strong></div>
          <div className="lp-fpreview-row lp-fpreview-lose"><span>16</span>Bryan<strong>61</strong></div>
        </div>
        <div className="lp-fpreview-match">
          <div className="lp-fpreview-row"><span>8</span>Georgetown (KY)<strong>72</strong></div>
          <div className="lp-fpreview-row lp-fpreview-lose"><span>9</span>Freed-Hardeman<strong>69</strong></div>
        </div>
      </div>
    ),
  },
  {
    tag: 'RPI & SOS',
    title: 'RPI & Strength of Schedule',
    desc: "The NAIA's official RPI formula calculated daily, plus SOS, opponent win %, and conference-adjusted rankings.",
    preview: (
      <div className="lp-fpreview-rpi">
        <div className="lp-fpreview-rpi-row"><span>Indiana Wesleyan</span><strong>.6842</strong></div>
        <div className="lp-fpreview-rpi-row"><span>Southeastern</span><strong>.6701</strong></div>
        <div className="lp-fpreview-rpi-row"><span>Marian</span><strong>.6598</strong></div>
        <div className="lp-fpreview-rpi-row"><span>Concordia</span><strong>.6445</strong></div>
      </div>
    ),
  },
  {
    tag: 'Players',
    title: 'Player Leaderboards',
    desc: 'Per-game splits, shooting percentages, clutch stats, and filterable rankings for every NAIA player.',
    preview: (
      <div className="lp-fpreview-players">
        <div className="lp-fpreview-player"><span className="lp-fpreview-rk">1</span><span>K. Johnson</span><strong>24.8</strong><em>PPG</em></div>
        <div className="lp-fpreview-player"><span className="lp-fpreview-rk">2</span><span>D. Martinez</span><strong>22.1</strong><em>PPG</em></div>
        <div className="lp-fpreview-player"><span className="lp-fpreview-rk">3</span><span>A. Williams</span><strong>21.7</strong><em>PPG</em></div>
        <div className="lp-fpreview-player"><span className="lp-fpreview-rk">4</span><span>T. Carter</span><strong>20.9</strong><em>PPG</em></div>
      </div>
    ),
  },
  {
    tag: 'Matchup',
    title: 'Scout & Matchup',
    desc: 'Head-to-head comparisons, game-by-game logs, and statistical profiles for prepping any opponent.',
    preview: (
      <div className="lp-fpreview-matchup">
        <div className="lp-fpreview-mhead">
          <span>Indiana Wesleyan</span><span className="lp-fpreview-vs">vs</span><span>Marian</span>
        </div>
        <div className="lp-fpreview-mrow"><strong>112.3</strong><span>AdjOE</span><strong>108.4</strong></div>
        <div className="lp-fpreview-mrow"><strong>88.1</strong><span>AdjDE</span><strong>90.2</strong></div>
        <div className="lp-fpreview-mrow"><strong>70.4</strong><span>Pace</span><strong>68.9</strong></div>
      </div>
    ),
  },
  {
    tag: 'Conferences',
    title: 'Conference Breakdowns',
    desc: 'Standings, RPI rankings, head-to-head matrices, and strength comparisons across all 21 NAIA conferences.',
    preview: (
      <div className="lp-fpreview-conf">
        <div className="lp-fpreview-conf-row"><span>1</span>Crossroads<strong>.612</strong></div>
        <div className="lp-fpreview-conf-row"><span>2</span>Sooner<strong>.594</strong></div>
        <div className="lp-fpreview-conf-row"><span>3</span>Heart of America<strong>.581</strong></div>
        <div className="lp-fpreview-conf-row"><span>4</span>Mid-South<strong>.567</strong></div>
      </div>
    ),
  },
];

const STATS = [
  { value: '250+', label: 'Teams Tracked' },
  { value: '5,000+', label: 'Games Analyzed' },
  { value: '30+', label: 'Advanced Metrics' },
];

export default function Landing() {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const heroRef = useRef(null);
  const featuresScrollRef = useRef(null);
  const featuresViewportRef = useRef(null);
  const [featurePage, setFeaturePage] = useState(0);
  const [perPage, setPerPage] = useState(3);
  const [viewportW, setViewportW] = useState(0);

  // Recompute perPage + viewport width responsively.
  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      if (w >= 1100) setPerPage(3);
      else if (w >= 720) setPerPage(2);
      else setPerPage(1);
      if (featuresViewportRef.current) {
        setViewportW(featuresViewportRef.current.clientWidth);
      }
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

  const totalPages = Math.max(1, Math.ceil(FEATURES.length / perPage));
  const currentPage = featurePage % totalPages;

  const scrollFeatures = (direction) => {
    setFeaturePage((p) => {
      const next = (p + direction + totalPages) % totalPages;
      return next;
    });
  };

  // Keep page in range when perPage changes (e.g., resize)
  useEffect(() => {
    setFeaturePage((p) => p % totalPages);
  }, [totalPages]);

  // Swipe support on the carousel viewport
  useEffect(() => {
    const el = featuresViewportRef.current;
    if (!el) return;
    let startX = 0;
    let startY = 0;
    let tracking = false;
    const onStart = (e) => {
      const t = e.touches ? e.touches[0] : e;
      startX = t.clientX;
      startY = t.clientY;
      tracking = true;
    };
    const onEnd = (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches ? e.changedTouches[0] : e;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        scrollFeatures(dx < 0 ? 1 : -1);
      }
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchend', onEnd);
    };
  }, [totalPages]);

  // Force light theme while on the landing page; restore on unmount.
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'light');
    return () => {
      if (prev) root.setAttribute('data-theme', prev);
      else root.removeAttribute('data-theme');
    };
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Cursor drag-follow on hero
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let visible = false;
    let raf = 0;

    const tick = () => {
      // Ease toward target ~15% per frame for a smooth drag.
      currentX += (targetX - currentX) * 0.15;
      currentY += (targetY - currentY) * 0.15;
      hero.style.setProperty('--lp-cx', `${currentX}px`);
      hero.style.setProperty('--lp-cy', `${currentY}px`);
      raf = requestAnimationFrame(tick);
    };

    const onMove = (e) => {
      const rect = hero.getBoundingClientRect();
      targetX = e.clientX - rect.left;
      targetY = e.clientY - rect.top;
      if (!visible) {
        // Snap on first entry so the dot doesn't fly in from 0,0.
        currentX = targetX;
        currentY = targetY;
        visible = true;
        hero.style.setProperty('--lp-cursor-opacity', '1');
      }
    };
    const onLeave = () => {
      visible = false;
      hero.style.setProperty('--lp-cursor-opacity', '0');
    };

    hero.addEventListener('pointermove', onMove);
    hero.addEventListener('pointerleave', onLeave);
    raf = requestAnimationFrame(tick);

    return () => {
      hero.removeEventListener('pointermove', onMove);
      hero.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

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
      <nav className={`lp-nav${scrolled ? ' lp-nav-scrolled' : ' lp-nav-over-hero'}`}>
        <div className="lp-nav-inner">
          <div className="lp-nav-brand">
            <img src={scrolled ? logoSrc : logoDarkSrc} alt="" className="lp-nav-logo" />
            <span className="lp-nav-name">Axis Analytics</span>
          </div>
          <div className="lp-nav-actions">
            {isSignedIn ? (
              <>
                <button className="lp-nav-cta" onClick={handleCTA}>Open App</button>
                <UserButton
                  afterSignOutUrl="/"
                  appearance={{ elements: { avatarBox: 'cl-avatar-box' } }}
                />
              </>
            ) : (
              <>
                <SignInButton mode="modal">
                  <button className="lp-nav-link">Log In</button>
                </SignInButton>
                <SignInButton mode="modal">
                  <button className="lp-nav-cta">Sign Up</button>
                </SignInButton>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="lp-hero" ref={heroRef}>
        <div className="lp-hero-cursor" aria-hidden="true" />
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
          <h2 className="lp-section-h2 lp-section-h2-dark">Built on the numbers that matter</h2>
          <p className="lp-section-sub lp-section-sub-dark lp-nowrap">
            Every metric calculated from real box score data. No estimates, no filler.
          </p>
          <div className="lp-features-carousel">
            <button
              type="button"
              className="lp-features-arrow lp-features-arrow-left"
              onClick={() => scrollFeatures(-1)}
              aria-label="Previous features"
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <div className="lp-features-viewport" ref={featuresViewportRef}>
              <div
                className="lp-features-track"
                ref={featuresScrollRef}
                style={{
                  transform: `translateX(calc(${-currentPage} * (var(--viewport-w, 0px) + 1.25rem)))`,
                  '--per-page': perPage,
                  '--viewport-w': `${viewportW}px`,
                }}
              >
                {FEATURES.map((f) => (
                  <div key={f.title} className="lp-feature-card">
                    <div className="lp-feature-preview">{f.preview}</div>
                    <div className="lp-feature-body">
                      <span className="lp-feature-tag">{f.tag}</span>
                      <h3 className="lp-feature-title">{f.title}</h3>
                      <p className="lp-feature-desc">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="lp-features-arrow lp-features-arrow-right"
              onClick={() => scrollFeatures(1)}
              aria-label="Next features"
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <div className="lp-features-dots" role="tablist" aria-label="Feature pages">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`lp-features-dot${i === currentPage ? ' lp-features-dot-active' : ''}`}
                  onClick={() => setFeaturePage(i)}
                  aria-label={`Go to page ${i + 1}`}
                  aria-selected={i === currentPage}
                />
              ))}
            </div>
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
            <img src={logoSrc} alt="" className="lp-footer-logo" />
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
