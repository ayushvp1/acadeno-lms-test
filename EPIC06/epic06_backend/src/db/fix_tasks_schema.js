const { pool } = require('./index');

async function migrate() {
    console.log('--- Migrating tasks table: status and instructions ---');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Add status column if it doesn't exist
        await client.query(`
            ALTER TABLE tasks 
            ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
            CHECK (status IN ('draft', 'published', 'archived'));
        `);

        // 2. Populate status from is_published
        await client.query(`
            UPDATE tasks 
            SET status = 'published' 
            WHERE is_published = TRUE AND status = 'draft';
        `);

        // 3. Add instructions column if it doesn't exist
        await client.query(`
            ALTER TABLE tasks 
            ADD COLUMN IF NOT EXISTS instructions TEXT;
        `);

        // 4. Populate instructions from rubric if rubric exists and instructions is empty
        const columnCheck = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'tasks' AND column_name = 'rubric'
        `);

        if (columnCheck.rows.length > 0) {
            await client.query(`
                UPDATE tasks 
                SET instructions = rubric 
                WHERE instructions IS NULL;
            `);
            console.log('✅ Migrated rubric data to instructions.');
        }

        await client.query('COMMIT');
        console.log('✅ Migration successful: tasks table updated with status and instructions.');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', err.message);
    } finally {
        client.release();
        process.exit();
    }
}

migrate();
