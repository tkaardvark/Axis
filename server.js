require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { startScheduler } = require('./scheduler');

// Clerk auth — optional, graceful fallback if keys not configured
let clerkMiddlewareFn;
try {
  if (process.env.CLERK_SECRET_KEY) {
    const { clerkMiddleware } = require('@clerk/express');
    clerkMiddlewareFn = clerkMiddleware();
  }
} catch (e) {
  console.warn('Clerk middleware unavailable:', e.message);
}
if (!clerkMiddlewareFn) {
  clerkMiddlewareFn = (req, _res, next) => { req.auth = { userId: null }; next(); };
}

// Route modules
const metadataRoutes = require('./routes/metadata');
const teamsRoutes = require('./routes/teams');
const playersRoutes = require('./routes/players');
const conferencesRoutes = require('./routes/conferences');
const matchupRoutes = require('./routes/matchup');
const bracketcastRoutes = require('./routes/bracketcast');
const tournamentRoutes = require('./routes/tournament');

const app = express();
const PORT = process.env.PORT || 3001;

// Disable Express's default weak ETag — we generate our own strong ETags in
// the /api middleware below so we can serve 304s for cached league/season
// data.
app.set('etag', false);

// Security headers
// Clerk's modal sign-in requires 'unsafe-inline' + 'unsafe-eval' in script-src,
// inline event handlers via script-src-attr, and form-action allowing Clerk's
// domain. See https://clerk.com/docs/security/clerk-csp.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'",
        'https://*.clerk.accounts.dev',
        'https://clerk.axisbasketball.com',
        'https://challenges.cloudflare.com',
      ],
      'script-src-attr': ["'unsafe-inline'"],
      'connect-src': [
        "'self'",
        'https://api.axisbasketball.com',
        'https://*.clerk.accounts.dev',
        'https://clerk.axisbasketball.com',
        'https://challenges.cloudflare.com',
        'https://clerk-telemetry.com',
      ],
      'img-src': ["'self'", 'data:', 'https://img.clerk.com', "https://cdn.prestosports.com"],
      'worker-src': ["'self'", 'blob:'],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
      'frame-src': [
        "'self'",
        'https://challenges.cloudflare.com',
        'https://*.clerk.accounts.dev',
        'https://clerk.axisbasketball.com',
      ],
      'form-action': [
        "'self'",
        'https://*.clerk.accounts.dev',
        'https://clerk.axisbasketball.com',
      ],
    },
  },
}));

// Rate limiting — 100 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

// Middleware
if (process.env.NODE_ENV === 'production') {
  // Comma-separated list of allowed origins. Defaults cover the custom domain
  // (apex + www) and the legacy Render subdomain.
  const allowedOrigins = (process.env.FRONTEND_URL ||
    'https://axisbasketball.com,https://www.axisbasketball.com,https://naia-analytics.onrender.com'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.use(cors({
    origin: (origin, cb) => {
      // Allow same-origin / curl / server-side requests with no Origin header
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
} else {
  app.use(cors());
}
app.use(express.json());

// Clerk authentication middleware — populates req.auth on all requests
app.use(clerkMiddlewareFn);

// Request logging — concise in production, detailed in dev
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Cache API responses for 5 minutes (data refreshes every 4 hours).
// Also generate strong ETags so the browser can revalidate with a small
// If-None-Match request and we can return 304 Not Modified instead of
// regenerating + retransmitting the full payload. This is the single biggest
// win for users switching back-and-forth between leagues/seasons.
const crypto = require('crypto');
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'public, max-age=300');

  // Only intercept GET (safe + idempotent). Other methods are mutations.
  if (req.method !== 'GET') return next();

  const originalJson = res.json.bind(res);
  res.json = function patchedJson(body) {
    try {
      // Skip ETag generation on error responses — they shouldn't be cached.
      if (res.statusCode >= 400) return originalJson(body);

      const payload = JSON.stringify(body);
      const etag = '"' + crypto.createHash('sha1').update(payload).digest('base64') + '"';
      res.set('ETag', etag);

      const ifNoneMatch = req.get('If-None-Match');
      if (ifNoneMatch && ifNoneMatch === etag) {
        // Body is unchanged — short-circuit with 304.
        res.status(304).end();
        return res;
      }

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.send(payload);
      return res;
    } catch {
      // If anything goes wrong serializing, fall back to default behavior.
      return originalJson(body);
    }
  };
  next();
});

// Health check endpoint (used by Render)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/dist')));
}

// Mount route modules
app.use(metadataRoutes);
app.use(teamsRoutes);
app.use(playersRoutes);
app.use(conferencesRoutes);
app.use(matchupRoutes);
app.use(bracketcastRoutes);
app.use(tournamentRoutes);

// Serve React app for all other routes in production
if (process.env.NODE_ENV === 'production') {
  app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/dist/index.html'));
  });
}

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Start automated task scheduler in production
  if (process.env.NODE_ENV === 'production') {
    startScheduler();
  } else {
    console.log('Scheduler disabled in development (set NODE_ENV=production to enable)');
  }
});

// Graceful shutdown — let in-flight requests finish & close the DB pool
function gracefulShutdown(signal) {
  console.log(`\n${signal} received — shutting down gracefully...`);
  server.close(() => {
    console.log('HTTP server closed.');
    const { pool } = require('./db/pool');
    pool.end().then(() => {
      console.log('Database pool closed.');
      process.exit(0);
    }).catch((err) => {
      console.error('Error closing DB pool:', err);
      process.exit(1);
    });
  });

  // Force exit after 10 seconds if graceful shutdown stalls
  setTimeout(() => {
    console.error('Graceful shutdown timed out — forcing exit.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
