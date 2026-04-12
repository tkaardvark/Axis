require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('============================================================');
    console.log('Migration: Add Season Support');
    console.log('============================================================\n');

    await client.query('BEGIN');

    // Step 1: Add season column to all tables
    console.log('1. Adding season column to teams...');
    await client.query(`
      ALTER TABLE teams ADD COLUMN IF NOT EXISTS season VARCHAR(10) DEFAULT '2025-26'
    `);

    console.log('2. Adding season column to games...');
    await client.query(`
      ALTER TABLE games ADD COLUMN IF NOT EXISTS season VARCHAR(10) DEFAULT '2025-26'
    `);

    console.log('3. Adding season column to team_ratings...');
    await client.query(`
      ALTER TABLE team_ratings ADD COLUMN IF NOT EXISTS season VARCHAR(10) DEFAULT '2025-26'
    `);

    // Step 2: Backfill existing rows
    console.log('4. Backfilling existing rows with 2025-26...');
    await client.query(`UPDATE teams SET season = '2025-26' WHERE season IS NULL`);
    await client.query(`UPDATE games SET season = '2025-26' WHERE season IS NULL`);
    await client.query(`UPDATE team_ratings SET season = '2025-26' WHERE season IS NULL`);

    // Step 3: Drop ALL foreign key constraints that reference teams
    console.log('5. Dropping foreign key constraints...');
    // Drop FK constraints on ALL tables that might reference teams
    for (const tableName of ['games', 'team_ratings']) {
      const fkResult = await client.query(`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = $1
          AND constraint_type = 'FOREIGN KEY'
      `, [tableName]);
      for (const row of fkResult.rows) {
        console.log(`   Dropping FK on ${tableName}: ${row.constraint_name}`);
        await client.query(`ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS "${row.constraint_name}"`);
      }
    }

    // Step 4: Drop old unique constraints and add new composite ones
    console.log('6. Updating unique constraints...');

    // Teams: Drop old unique on team_id, add composite
    const teamsUqResult = await client.query(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'teams'
        AND constraint_type = 'UNIQUE'
    `);
    for (const row of teamsUqResult.rows) {
      console.log(`   Dropping teams constraint: ${row.constraint_name}`);
      await client.query(`ALTER TABLE teams DROP CONSTRAINT IF EXISTS ${row.constraint_name}`);
    }
    await client.query(`ALTER TABLE teams ADD CONSTRAINT teams_team_id_season_unique UNIQUE (team_id, season)`);
    console.log('   Added: teams(team_id, season) UNIQUE');

    // Games: Drop old unique on game_id, add composite
    const gamesUqResult = await client.query(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'games'
        AND constraint_type = 'UNIQUE'
    `);
    for (const row of gamesUqResult.rows) {
      console.log(`   Dropping games constraint: ${row.constraint_name}`);
      await client.query(`ALTER TABLE games DROP CONSTRAINT IF EXISTS ${row.constraint_name}`);
    }
    await client.query(`ALTER TABLE games ADD CONSTRAINT games_game_id_season_unique UNIQUE (game_id, season)`);
    console.log('   Added: games(game_id, season) UNIQUE');

    // Team_ratings: Drop old unique, add composite with season
    const ratingsUqResult = await client.query(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'team_ratings'
        AND constraint_type = 'UNIQUE'
    `);
    for (const row of ratingsUqResult.rows) {
      console.log(`   Dropping team_ratings constraint: ${row.constraint_name}`);
      await client.query(`ALTER TABLE team_ratings DROP CONSTRAINT IF EXISTS ${row.constraint_name}`);
    }
    await client.query(`ALTER TABLE team_ratings ADD CONSTRAINT team_ratings_team_date_season_unique UNIQUE (team_id, date_calculated, season)`);
    console.log('   Added: team_ratings(team_id, date_calculated, season) UNIQUE');

    // Step 5: Add indexes
    console.log('7. Adding season indexes...');
    await client.query(`CREATE INDEX IF NOT EXISTS idx_teams_season ON teams(season)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_games_season ON games(season)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ratings_season ON team_ratings(season)`);

    await client.query('COMMIT');

    console.log('\n✅ Migration complete!');
    console.log('   - season column added to teams, games, team_ratings');
    console.log('   - All existing data tagged as 2025-26');
    console.log('   - Unique constraints updated to include season');
    console.log('   - Foreign key constraints dropped');
    console.log('   - Season indexes created');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
