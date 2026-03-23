const bcrypt = require('bcrypt');
const { pool } = require('./src/db/index');

(async () => {
    try {
        const client = await pool.connect();
        await client.query("SET app.current_user_role = 'super_admin'");
        
        console.log("DELETING USERS...");
        await client.query("DELETE FROM users");
        
        const adminHash = await bcrypt.hash('Admin123!', 12);
        await client.query(
            "INSERT INTO users (email, password_hash, role, is_active, mfa_enabled) VALUES ('admin@acadeno.com', $1, 'super_admin', true, false)", 
            [adminHash]
        );
        console.log("SUCCESS: Re-created admin@acadeno.com / Admin123!");

        const bdaHash = await bcrypt.hash('Test@1234', 12);
        await client.query(
            "INSERT INTO users (email, password_hash, role, is_active, mfa_enabled) VALUES ('bda@acadeno.com', $1, 'bda', true, false)", 
            [bdaHash]
        );
        console.log("SUCCESS: Re-created bda@acadeno.com / Test@1234");

        const res = await client.query("SELECT email, role FROM users");
        console.log("FINAL USERS:", res.rows);

        client.release();
    } catch (e) {
        console.error("RE-SEED ERROR:", e.message);
    } finally {
        pool.end();
    }
})();
