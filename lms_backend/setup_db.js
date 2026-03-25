require('dotenv').config();
const { pool } = require('./src/db/index');
const bcrypt = require('bcrypt');
(async () => {
  try {
    await pool.query('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO lms_user;');
    console.log('Granted tables');
    await pool.query('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO lms_user;');
    console.log('Granted sequences');
    
    // Also we need to make sure we SET the role as super_admin so the INSERT bypasses RLS
    await pool.query("SET app.current_user_role = 'super_admin'");
    const hash = await bcrypt.hash('Admin123!', 12);
    await pool.query(`INSERT INTO users (email, password_hash, role, is_active, mfa_enabled) VALUES ('admin@acadeno.com', $1, 'super_admin', true, false) ON CONFLICT DO NOTHING;`, [hash]);
    console.log('Test user inserted/verified!');
  } catch(e) {
    console.error('Error running setup:', e.message);
  } finally {
    pool.end();
  }
})();
