const express = require('express');
const router = express.Router();
const { pool, DEFAULT_SEASON } = require('../db/pool');
const { resolveSource } = require('../utils/dataSource');

// Get available months that have games
router.get('/api/months', async (req, res) => {
  try {
    const { league = 'mens', season = DEFAULT_SEASON, source } = req.query;
    const useBoxScore = resolveSource({ league, season, source }) === 'boxscore';

    let result;
    if (useBoxScore) {
      result = await pool.query(`
        SELECT DISTINCT
          EXTRACT(MONTH FROM e.game_date)::int as month,
          EXTRACT(YEAR FROM e.game_date)::int as year
        FROM exp_game_box_scores e
        JOIN teams t ON t.team_id = e.away_team_id AND t.season = e.season
        WHERE t.league = $1
          AND e.season = $2
          AND COALESCE(e.is_naia_game, false) = true
          AND e.away_score IS NOT NULL AND e.home_score IS NOT NULL
        ORDER BY year, month
      `, [league, season]);
    } else {
      result = await pool.query(`
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
    }

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
    const { season = DEFAULT_SEASON, league = 'mens', source } = req.query;
    const useBoxScore = resolveSource({ league, season, source }) === 'boxscore';

    let result;
    if (useBoxScore) {
      result = await pool.query(`
        SELECT MAX(updated_at) as last_update
        FROM exp_game_box_scores
        WHERE season = $1
      `, [season]);
    } else {
      // Get the most recent updated_at from games table (when game data was last imported)
      result = await pool.query(`
        SELECT MAX(updated_at) as last_update
        FROM games
        WHERE season = $1
      `, [season]);
    }

    res.json({
      lastUpdated: result.rows[0].last_update,
    });
  } catch (err) {
    console.error('Error fetching last updated:', err);
    res.status(500).json({ error: 'Failed to fetch last updated timestamp' });
  }
});

// Get recent box score import log entries (gap-fill discoveries)
router.get('/api/import-log', async (req, res) => {
  try {
    const { limit = 50, source, season, league } = req.query;

    let whereConditions = [];
    let params = [];
    let paramIdx = 1;

    if (source) {
      whereConditions.push(`source = $${paramIdx++}`);
      params.push(source);
    }
    if (season) {
      whereConditions.push(`season = $${paramIdx++}`);
      params.push(season);
    }
    if (league) {
      whereConditions.push(`league = $${paramIdx++}`);
      params.push(league);
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const result = await pool.query(`
      SELECT id, box_score_url, season, league, game_date,
             away_team_name, home_team_name, away_score, home_score,
             source, job_name, lookback_days,
             player_count, play_count, status, error_message,
             created_at
      FROM box_score_import_log
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIdx}
    `, [...params, Math.min(parseInt(limit), 200)]);

    res.json(result.rows);
  } catch (err) {
    // Table might not exist yet — return empty array
    if (err.code === '42P01') {
      return res.json([]);
    }
    console.error('Error fetching import log:', err);
    res.status(500).json({ error: 'Failed to fetch import log' });
  }
});

module.exports = router;
