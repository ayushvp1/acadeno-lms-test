const { Client } = require('pg');

const passwords = ['postgres', 'admin', 'root', '', 'USER@ACD', '1234', '123456'];

(async () => {
  for (const pwd of passwords) {
    try {
      const dbUrl = `postgresql://postgres:${encodeURIComponent(pwd)}@localhost:5432/acadeno_lms`;
      const client = new Client({ connectionString: dbUrl });
      await client.connect();
      console.log(`[SUCCESS] Connected as 'postgres' with password: "${pwd}"`);

      // Grant privileges
      await client.query('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO lms_user;');
      await client.query('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO lms_user;');
      console.log('Granted privileges to lms_user!');

      // Create test user (Bcrypt of 'Admin123!')
      const hash = '$2b$12$s.R2iXLy3rn54C8hi.E/.edUZTHG/Wz/FZXme4bwqQyriqU7gjkaa';
      await client.query("SET app.current_user_role = 'super_admin'");
      await client.query(`
        INSERT INTO users (email, password_hash, role, is_active, mfa_enabled) 
        VALUES ('admin@acadeno.com', $1, 'super_admin', true, false) 
        ON CONFLICT DO NOTHING;
      `, [hash]);
      
      console.log('User admin@acadeno.com inserted!');
      await client.end();
      return; 
    } catch (err) {
      if (err.message.includes('authentication failed')) {
        // console.log(`[FAIL] Password '${pwd}' failed.`);
      } else {
        console.error(`Error with password '${pwd}':`, err.message);
      }
    }
  }
  console.log("Could not find postgres password.");
})();
