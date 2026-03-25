require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const migrationPath = path.join(__dirname, 'src/db/migrations/008_add_user_names.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log('Running migration 008...');
    await client.query(sql);
    console.log('✅ Migration successful!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
