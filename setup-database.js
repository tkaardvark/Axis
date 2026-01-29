require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function setupDatabase() {
  try {
    await client.connect();
    console.log('Connected to database!');

    // Create teams table
    await client.query(`
      CREATE TABLE IF NOT EXISTS teams (
        id SERIAL PRIMARY KEY,
        team_id VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        league VARCHAR(10) NOT NULL,
        conference VARCHAR(100),
        json_url TEXT NOT NULL,
        primary_color VARCHAR(7),
        secondary_color VARCHAR(7),
        logo_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Teams table created');

    // Create games table
    await client.query(`
      CREATE TABLE IF NOT EXISTS games (
        id SERIAL PRIMARY KEY,
        game_id VARCHAR(100) UNIQUE NOT NULL,
        team_id VARCHAR(50) REFERENCES teams(team_id),
        opponent_id VARCHAR(50) REFERENCES teams(team_id),
        game_date DATE NOT NULL,
        location VARCHAR(20),
        team_score INTEGER,
        opponent_score INTEGER,
        is_completed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Games table created');

    // Create team_ratings table with ALL columns
    await client.query(`
      CREATE TABLE IF NOT EXISTS team_ratings (
        id SERIAL PRIMARY KEY,
        team_id VARCHAR(50) REFERENCES teams(team_id),
        date_calculated DATE NOT NULL,

        -- Record
        games_played INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        win_pct DECIMAL(5,3),
        naia_wins INTEGER DEFAULT 0,
        naia_losses INTEGER DEFAULT 0,
        naia_win_pct DECIMAL(5,3),

        -- Points
        points_per_game DECIMAL(6,2),
        points_allowed_per_game DECIMAL(6,2),

        -- Efficiency Ratings
        offensive_rating DECIMAL(6,2),
        defensive_rating DECIMAL(6,2),
        net_rating DECIMAL(6,2),
        adjusted_offensive_rating DECIMAL(6,2),
        adjusted_defensive_rating DECIMAL(6,2),
        adjusted_net_rating DECIMAL(6,2),

        -- Shooting Percentages
        fg_pct DECIMAL(5,2),
        fg3_pct DECIMAL(5,2),
        ft_pct DECIMAL(5,2),
        efg_pct DECIMAL(5,2),

        -- Opponent Shooting
        fg_pct_opp DECIMAL(5,2),
        fg3_pct_opp DECIMAL(5,2),
        efg_pct_opp DECIMAL(5,2),

        -- Turnovers
        turnover_pct DECIMAL(5,2),
        turnover_pct_opp DECIMAL(5,2),

        -- Rebounding Percentages
        oreb_pct DECIMAL(5,2),
        dreb_pct DECIMAL(5,2),
        oreb_pct_opp DECIMAL(5,2),
        dreb_pct_opp DECIMAL(5,2),

        -- Per Game Stats - Offense
        assists_per_game DECIMAL(5,2),
        turnovers_per_game DECIMAL(5,2),

        -- Per Game Stats - Defense/Other
        steals_per_game DECIMAL(5,2),
        blocks_per_game DECIMAL(5,2),
        fouls_per_game DECIMAL(5,2),

        -- Per Game Stats - Opponent
        assists_per_game_opp DECIMAL(5,2),
        turnovers_per_game_opp DECIMAL(5,2),
        steals_per_game_opp DECIMAL(5,2),
        blocks_per_game_opp DECIMAL(5,2),
        fouls_per_game_opp DECIMAL(5,2),

        -- Rebounding Per Game
        oreb_per_game DECIMAL(5,2),
        dreb_per_game DECIMAL(5,2),
        total_reb_per_game DECIMAL(5,2),
        oreb_per_game_opp DECIMAL(5,2),
        dreb_per_game_opp DECIMAL(5,2),
        total_reb_per_game_opp DECIMAL(5,2),

        -- Attempt Rates
        ft_rate DECIMAL(5,2),
        three_pt_rate DECIMAL(5,2),

        -- Strength of Schedule
        rpi DECIMAL(5,3),
        strength_of_schedule DECIMAL(6,3),
        opponent_win_pct DECIMAL(5,3),
        opponent_opponent_win_pct DECIMAL(5,3),
        osos DECIMAL(6,2),
        dsos DECIMAL(6,2),
        nsos DECIMAL(6,2),

        -- Assist/Turnover Ratio
        assist_turnover_ratio DECIMAL(5,2),

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(team_id, date_calculated)
      )
    `);
    console.log('✓ Team ratings table created');

    // Create indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_teams_league ON teams(league)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_games_team ON games(team_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_games_date ON games(game_date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ratings_team_date ON team_ratings(team_id, date_calculated)');
    console.log('✓ Indexes created');

    console.log('\n✅ Database setup complete!');
  } catch (err) {
    console.error('Error setting up database:', err);
  } finally {
    await client.end();
  }
}

setupDatabase();
