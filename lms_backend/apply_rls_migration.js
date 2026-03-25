require('dotenv').config();
const { pool } = require('./src/db/index');
const fs = require('fs');
const path = require('path');

async function applyMigration() {
  const client = await pool.connect();
  try {
    const sqlPath = path.join(__dirname, 'src', 'db', 'migrations', '004_batch_management_rls.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('Applying RLS migration...');
    await client.query(sql);
    console.log('Migration applied successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    client.release();
    pool.end();
  }
}

applyMigration();
