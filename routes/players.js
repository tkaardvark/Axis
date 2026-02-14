const express = require('express');
const router = express.Router();
const { pool, DEFAULT_SEASON } = require('../db/pool');

// Get all players (with filtering and sorting)
router.get('/api/players', async (req, res) => {
  try {
    const {
      league = 'mens',
      season = DEFAULT_SEASON,
      conference,
      team_id,
      team,
      position,
      year,
      sort_by = 'pts_pg',
      sort_order = 'DESC',
      limit = 100,
      offset = 0,
      min_gp = 5  // Minimum games played filter
    } = req.query;

    // Build WHERE clause
    let whereConditions = ['p.league = $1', 'p.season = $2', 'p.gp >= $3', 't.is_excluded = FALSE'];
    let params = [league, season, parseInt(min_gp) || 0];
    let paramIndex = 4;

    if (conference) {
      whereConditions.push(`t.conference = $${paramIndex}`);
      params.push(conference);
      paramIndex++;
    }

    if (team_id) {
      whereConditions.push(`p.team_id = $${paramIndex}`);
      params.push(team_id);
      paramIndex++;
    }

    if (team) {
      whereConditions.push(`t.name = $${paramIndex}`);
      params.push(team);
      paramIndex++;
    }

    if (position) {
      whereConditions.push(`p.position ILIKE $${paramIndex}`);
      params.push(`%${position}%`);
      paramIndex++;
    }

    if (year) {
      whereConditions.push(`p.year ILIKE $${paramIndex}`);
      params.push(`%${year}%`);
      paramIndex++;
    }

    // Validate sort column
    const validSortColumns = [
      // Per game stats
      'pts_pg', 'reb_pg', 'ast_pg', 'stl_pg', 'blk_pg', 'min_pg', 'to_pg',
      // Percentages
      'fg_pct', 'fg3_pct', 'ft_pct',
      // Totals
      'pts', 'reb', 'ast', 'stl', 'blk', 'gp', 'turnovers', 'pf',
      'fgm', 'fga', 'fg3m', 'fg3a', 'ftm', 'fta',
      'oreb', 'dreb', 'min',
      // Calculated
      'ast_to_ratio', 'oreb_pg', 'dreb_pg',
      // Name
      'last_name', 'first_name'
    ];
    const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'pts_pg';
    const order = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Map calculated columns to their expressions
    const calculatedColumns = {
      'oreb_pg': 'ROUND(CAST(p.oreb AS DECIMAL) / NULLIF(p.gp, 0), 1)',
      'dreb_pg': 'ROUND(CAST(p.dreb AS DECIMAL) / NULLIF(p.gp, 0), 1)'
    };

    const orderByExpr = calculatedColumns[sortColumn]
      ? `${calculatedColumns[sortColumn]} ${order} NULLS LAST`
      : `p.${sortColumn} ${order} NULLS LAST`;

    const query = `
      SELECT
        p.*,
        t.name as team_name,
        t.conference,
        t.logo_url as team_logo_url,
        t.primary_color as team_primary_color,
        ROUND(CAST(p.oreb AS DECIMAL) / NULLIF(p.gp, 0), 1) as oreb_pg,
        ROUND(CAST(p.dreb AS DECIMAL) / NULLIF(p.gp, 0), 1) as dreb_pg
      FROM players p
      JOIN teams t ON p.team_id = t.team_id AND p.season = t.season
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY ${orderByExpr}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(parseInt(limit) || 100, parseInt(offset) || 0);

    const result = await pool.query(query, params);

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM players p
      JOIN teams t ON p.team_id = t.team_id AND p.season = t.season
      WHERE ${whereConditions.join(' AND ')}
    `;
    const countResult = await pool.query(countQuery, params.slice(0, -2));

    res.json({
      players: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('Error fetching players:', err);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// Get single player by ID
router.get('/api/players/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;
    const { season = DEFAULT_SEASON } = req.query;

    const result = await pool.query(`
      SELECT
        p.*,
        t.name as team_name,
        t.conference,
        t.logo_url as team_logo_url,
        t.primary_color as team_primary_color
      FROM players p
      JOIN teams t ON p.team_id = t.team_id AND p.season = t.season
      WHERE p.player_id = $1 AND p.season = $2
    `, [playerId, season]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching player:', err);
    res.status(500).json({ error: 'Failed to fetch player' });
  }
});

module.exports = router;
