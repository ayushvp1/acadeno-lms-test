require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('./src/db/index');

(async () => {
    try {
        const client = await pool.connect();
        await client.query("SET app.current_user_role = 'super_admin'");
        const res = await client.query("SELECT id, email, role, is_active FROM users LIMIT 5");
        if (res.rows.length === 0) {
            console.log("No users found! Proceeding to create a test user...");
            const hash = await bcrypt.hash('Admin123!', 12);
            await client.query("INSERT INTO users (email, password_hash, role, is_active) VALUES ('admin@acadeno.com', $1, 'super_admin', true)", [hash]);
            console.log("SUCCESS: Created test user => admin@acadeno.com / Admin123!");
        } else {
            console.log("Found existing users:");
            console.log(res.rows);
        }
        client.release();
    } catch (e) {
        console.error("DB Error:", e);
    } finally {
        pool.end();
    }
})();
