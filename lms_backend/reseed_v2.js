require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('./src/db/index');

(async () => {
    const client = await pool.connect();
    try {
        await client.query("SET app.current_user_role = 'super_admin'");
        
        const staffPassword = 'Admin123!';
        const hash = await bcrypt.hash(staffPassword, 12);

        const staff = [
            { email: 'admin@acadeno.com', role: 'super_admin' },
            { email: 'hr@acadeno.com', role: 'hr' },
            { email: 'bda@acadeno.com', role: 'bda' },
            { email: 'trainer@acadeno.com', role: 'trainer' }
        ];

        console.log("Standardizing staff credentials...");

        for (const s of staff) {
            // UPSERT logic: Insert or update password if email exists
            await client.query(
                `INSERT INTO users (email, password_hash, role, is_active, mfa_enabled) 
                 VALUES ($1, $2, $3, true, false)
                 ON CONFLICT (email) 
                 DO UPDATE SET password_hash = $2, role = $3, is_active = true, mfa_enabled = false`,
                [s.email, hash, s.role]
            );
            console.log(`SET: ${s.email} / ${staffPassword} (${s.role})`);
        }

        console.log("\n--- TEST CREDENTIALS (READY) ---");
        staff.forEach(s => console.log(`${s.role.toUpperCase()}: ${s.email} / ${staffPassword}`));
        console.log("-------------------------------");

    } catch (err) {
        console.error("SEED Error:", err.message);
    } finally {
        client.release();
        pool.end();
    }
})();
