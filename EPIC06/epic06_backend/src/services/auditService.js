const { pool } = require('../db/index');

/**
 * Centrally records a platform action for audit purposes.
 * 
 * @param {string} actorId - ID of the user performing the action.
 * @param {string} actionType - Category of action (e.g. 'LOGIN', 'COURSE_CREATE').
 * @param {string} resourceType - The entity type being affected.
 * @param {string} resourceId - (Optional) UUID of the specific resource.
 * @param {string} status - 'success' or 'failure'.
 * @param {object} details - Metadata about the action (request data, error info).
 * @param {string} ip - IP address of the requester.
 */
async function record(actorId, actionType, resourceType, resourceId = null, status = 'success', details = {}, ip = '0.0.0.0') {
    const client = await pool.connect();
    try {
        // Internal system actions bypass RLS by using super_admin context if needed,
        // but here we just need to INSERT into the audit table.
        await client.query("SELECT set_config('app.current_user_role', 'super_admin', false)");

        const query = `
            INSERT INTO audit_logs (actor_id, action_type, resource_type, resource_id, status, details, ip_address)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;

        await client.query(query, [
            actorId,
            actionType,
            resourceType,
            resourceId,
            status,
            JSON.stringify(details),
            ip
        ]);

        console.log(`[AUDIT] Action logged: ${actionType} by ${actorId}`);
    } catch (err) {
        console.error('[AUDIT ERROR] Failed to record log:', err.message);
        // We do not throw here to prevent auditing failures from breaking business logic
    } finally {
        client.release();
    }
}

module.exports = { record };
