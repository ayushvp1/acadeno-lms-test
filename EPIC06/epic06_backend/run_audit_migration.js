const fs = require('fs');
const path = require('path');
const { pool } = require('./src/db/index');

async function runMigration() {
    const migrationPath = path.join(__dirname, 'src', 'db', 'migrations', '014_audit_logs.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    const client = await pool.connect();
    try {
        console.log('Running migration: 014_audit_logs.sql...');
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('COMMIT');
        console.log('Migration successful!');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
