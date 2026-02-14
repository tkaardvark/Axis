const express = require('express');
const router = express.Router();
const { pool, DEFAULT_SEASON } = require('../db/pool');

// Get available months that have games
router.get('/api/months', async (req, res) => {
  try {
    const { league = 'mens', season = DEFAULT_SEASON } = req.query;

    const result = await pool.query(`
      SELECT DISTINCT
        EXTRACT(MONTH FROM g.game_date)::int as month,
        EXTRACT(YEAR FROM g.game_date)::int as year
      FROM games g
      JOIN teams t ON g.team_id = t.team_id
      WHERE t.league = $1
        AND g.season = $2
        AND g.is_naia_game = true
      ORDER BY year, month
    `, [league, season]);

    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];

    const months = result.rows.map(r => ({
      value: `${r.year}-${String(r.month).padStart(2, '0')}`,
      label: `${monthNames[r.month]} ${r.year}`
    }));

    res.json(months);
  } catch (err) {
    console.error('Error fetching months:', err);
    res.status(500).json({ error: 'Failed to fetch months' });
  }
});

// Get available seasons
router.get('/api/seasons', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT DISTINCT season FROM teams ORDER BY season DESC'
    );
    res.json(result.rows.map(r => r.season));
  } catch (err) {
    console.error('Error fetching seasons:', err);
    res.status(500).json({ error: 'Failed to fetch seasons' });
  }
});

// Get list of conferences
router.get('/api/conferences', async (req, res) => {
  try {
    const { league = 'mens', season = DEFAULT_SEASON } = req.query;

    const result = await pool.query(
      'SELECT DISTINCT conference FROM teams WHERE league = $1 AND season = $2 AND conference IS NOT NULL AND is_excluded = FALSE ORDER BY conference',
      [league, season]
    );

    res.json(result.rows.map(r => r.conference));
  } catch (err) {
    console.error('Error fetching conferences:', err);
    res.status(500).json({ error: 'Failed to fetch conferences' });
  }
});

// Check if player data exists for a given season/league
// NOTE: This route MUST come before /api/players/:playerId
router.get('/api/players/exists', async (req, res) => {
  try {
    const { season = DEFAULT_SEASON, league = 'mens' } = req.query;

    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM players
      WHERE season = $1 AND league = $2
    `, [season, league]);

    res.json({
      hasPlayers: parseInt(result.rows[0].count) > 0,
      count: parseInt(result.rows[0].count)
    });
  } catch (err) {
    console.error('Error checking player data:', err);
    res.status(500).json({ error: 'Failed to check player data' });
  }
});

router.get('/api/national-averages', async (req, res) => {
  try {
    const { league = 'mens', season = DEFAULT_SEASON } = req.query;

    const result = await pool.query(`
      WITH latest_ratings AS (
        SELECT tr.*
        FROM team_ratings tr
        INNER JOIN (
          SELECT team_id, MAX(date_calculated) as max_date
          FROM team_ratings
          WHERE season = $2
          GROUP BY team_id
        ) latest ON tr.team_id = latest.team_id AND tr.date_calculated = latest.max_date
        WHERE tr.season = $2
      )
      SELECT
        ROUND(AVG(lr.efg_pct)::numeric, 4) as avg_efg_pct,
        ROUND(AVG(lr.turnover_pct)::numeric, 4) as avg_to_rate,
        ROUND(AVG(lr.oreb_pct)::numeric, 4) as avg_oreb_pct,
        ROUND(AVG(lr.ft_rate)::numeric, 4) as avg_ft_rate,
        ROUND(AVG(lr.pace)::numeric, 1) as avg_pace,
        ROUND(AVG(lr.three_pt_rate)::numeric, 4) as avg_three_pt_rate
      FROM teams t
      JOIN latest_ratings lr ON t.team_id = lr.team_id
      WHERE t.league = $1 AND t.season = $2 AND t.is_excluded = FALSE
    `, [league, season]);

    const row = result.rows[0] || {};
    // Parse numeric strings from ROUND() to actual numbers
    const parsed = {};
    for (const [key, value] of Object.entries(row)) {
      parsed[key] = value != null ? parseFloat(value) : null;
    }
    res.json(parsed);
  } catch (err) {
    console.error('Error fetching national averages:', err);
    res.status(500).json({ error: 'Failed to fetch national averages' });
  }
});

router.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Get last data update timestamp
router.get('/api/last-updated', async (req, res) => {
  try {
    const { season = DEFAULT_SEASON } = req.query;
    // Get the most recent updated_at from games table (when game data was last imported)
    const result = await pool.query(`
      SELECT MAX(updated_at) as last_update
      FROM games
      WHERE season = $1
    `, [season]);

    res.json({
      lastUpdated: result.rows[0].last_update,
    });
  } catch (err) {
    console.error('Error fetching last updated:', err);
    res.status(500).json({ error: 'Failed to fetch last updated timestamp' });
  }
});

module.exports = router;
