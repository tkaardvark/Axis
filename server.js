require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { startScheduler } = require('./scheduler');

// Route modules
const metadataRoutes = require('./routes/metadata');
const teamsRoutes = require('./routes/teams');
const playersRoutes = require('./routes/players');
const conferencesRoutes = require('./routes/conferences');
const matchupRoutes = require('./routes/matchup');
const bracketcastRoutes = require('./routes/bracketcast');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
if (process.env.NODE_ENV === 'production') {
  app.use(cors({
    origin: process.env.FRONTEND_URL || 'https://naia-analytics.onrender.com',
  }));
} else {
  app.use(cors());
}
app.use(express.json());

// Cache API responses for 5 minutes (data refreshes every 4 hours)
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'public, max-age=300');
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

// Serve React app for all other routes in production
if (process.env.NODE_ENV === 'production') {
  app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/dist/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Start automated task scheduler in production
  if (process.env.NODE_ENV === 'production') {
    startScheduler();
  } else {
    console.log('Scheduler disabled in development (set NODE_ENV=production to enable)');
  }
});
