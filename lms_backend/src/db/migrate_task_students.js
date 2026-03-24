const { pool } = require('./index');

async function migrate() {
    console.log('--- Migrating tasks for individual targeting ---');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
            ALTER TABLE tasks 
            ADD COLUMN IF NOT EXISTS target_student_id UUID REFERENCES users(id) ON DELETE CASCADE;
        `);
        await client.query('COMMIT');
        console.log('✅ Migration successful: added target_student_id to tasks.');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', err.message);
    } finally {
        client.release();
        process.exit();
    }
}

migrate();
