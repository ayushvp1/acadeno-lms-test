const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  const sqlFile = path.join(__dirname, '../../migration_epic8.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');

  try {
    console.log('Running migration_epic8.sql...');
    await pool.query(sql);
    console.log('Migration successful!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
