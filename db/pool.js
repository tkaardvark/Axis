const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Default season constant
const DEFAULT_SEASON = '2025-26';

module.exports = { pool, DEFAULT_SEASON };
