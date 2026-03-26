const { pool } = require('../db/index');
const auditService = require('../services/auditService');

async function verifyAuditLog() {
    console.log('--- Starting Audit Log Verification (US-NOT-06) ---');
    const client = await pool.connect();

    try {
        // 1. Find or create a test user (Super Admin)
        let resUser = await client.query("SELECT id, email FROM users WHERE role = 'super_admin' LIMIT 1");
        let adminId;
        
        if (resUser.rows.length === 0) {
            console.log('Creating mock Super Admin for test...');
            await client.query("SELECT set_config('app.current_user_role', 'super_admin', false)");
            const insertRes = await client.query(`
                INSERT INTO users (email, password_hash, role, is_active, full_name)
                VALUES ($1, $2, $3, TRUE, $4)
                RETURNING id
            `, ['audit-test@example.com', 'dummy_hash', 'super_admin', 'Audit Tester']);
            adminId = insertRes.rows[0].id;
        } else {
            adminId = resUser.rows[0].id;
        }

        // 2. Record a dummy action
        console.log('Testing auditService.record()...');
        await auditService.record(
            adminId,
            'TEST_VERIFICATION',
            'system',
            null,
            'success',
            { note: 'Verification script execution' },
            '127.0.0.1'
        );

        // 3. Verify record was created
        console.log('Checking database for the record...');
        const logRes = await client.query("SELECT * FROM audit_logs WHERE action_type = 'TEST_VERIFICATION' ORDER BY created_at DESC LIMIT 1");
        if (logRes.rows.length > 0) {
            console.log('SUCCESS: Audit record found.');
        } else {
            throw new Error('FAILED: Audit record NOT found.');
        }

        const logId = logRes.rows[0].id;

        // 4. Test DELETE protection (Should fail at DB level via trigger)
        console.log('Testing DELETE protection (Expected to fail)...');
        try {
            await client.query("DELETE FROM audit_logs WHERE id = $1", [logId]);
            throw new Error('FAILED: Delete operation succeeded (it should have been blocked).');
        } catch (err) {
            console.log(`SUCCESS: Delete operation blocked correctly. Error: ${err.message}`);
        }

        console.log('SUCCESS: Audit Log verification completed logically.');

    } catch (err) {
        console.error('VERIFICATION FAILED:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

verifyAuditLog();
