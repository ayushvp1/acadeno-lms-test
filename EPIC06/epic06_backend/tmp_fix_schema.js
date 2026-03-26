const { pool } = require('./src/db/index');

async function fixSchema() {
    const client = await pool.connect();
    try {
        console.log('Starting schema fix...');
        await client.query("SELECT set_config('app.current_user_role', 'super_admin', false)");
        
        console.log('1. Fixing users table...');
        await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT");
        await client.query("UPDATE users SET full_name = SPLIT_PART(email, '@', 1) WHERE full_name IS NULL");
        await client.query("ALTER TABLE users ALTER COLUMN full_name SET NOT NULL");
        
        console.log('2. Fixing batches table...');
        // First check which columns are missing
        const colsRes = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'batches'");
        const columns = colsRes.rows.map(c => c.column_name);
        
        if (!columns.includes('batch_code')) await client.query("ALTER TABLE batches ADD COLUMN batch_code VARCHAR(50) UNIQUE");
        if (!columns.includes('schedule_type')) await client.query("ALTER TABLE batches ADD COLUMN schedule_type VARCHAR(20) DEFAULT 'weekday' CHECK (schedule_type IN ('weekday','weekend','custom'))");
        if (!columns.includes('class_days')) await client.query("ALTER TABLE batches ADD COLUMN class_days JSONB DEFAULT '[]'");
        if (!columns.includes('class_time_start')) await client.query("ALTER TABLE batches ADD COLUMN class_time_start TIME");
        if (!columns.includes('class_time_end')) await client.query("ALTER TABLE batches ADD COLUMN class_time_end TIME");
        if (!columns.includes('meeting_url')) await client.query("ALTER TABLE batches ADD COLUMN meeting_url TEXT");
        if (!columns.includes('status')) await client.query("ALTER TABLE batches ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('upcoming','active','completed','cancelled'))");
        
        console.log('3. Creating trainer_course_pool...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS trainer_course_pool (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                trainer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                added_by UUID REFERENCES users(id),
                added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (course_id, trainer_id)
            )
        `);
        
        console.log('Schema fix completed successfully.');
    } catch (err) {
        console.error('SCHEMA FIX ERROR:', err.message);
    } finally {
        client.release();
        process.exit();
    }
}

fixSchema();
