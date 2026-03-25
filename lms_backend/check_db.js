require('dotenv').config();
const { pool } = require('./src/db/index');
async function check() {
  const res = await pool.query("SELECT email, role FROM users");
  console.log(res.rows);
  process.exit();
}
check();
