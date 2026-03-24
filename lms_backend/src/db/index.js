require('dotenv').config();
const { Pool } = require('pg');

// ==========================================================================
// ACADENO LMS — Database Connection & Query Wrapper
// ==========================================================================
// Central pg Pool configuration.
// Exposes a custom `query` function to enforce Row-Level Security (RLS)
// by setting the custom `app.current_user_role` variable before executing
// queries.
// ==========================================================================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Generic pool error handler
pool.on('error', (err) => {
  console.error('Unexpected error on idle pg client', err);
  process.exit(-1);
});

/**
 * Executes a PostgreSQL query while enforcing a specific user role.
 * This ensures that RLS policies are applied correctly.
 * 
 * @param {string} text   - The SQL query text.
 * @param {Array}  params - Parameterized values for the query.
 * @param {string} role   - The role of the user executing the query (defaults to 'student').
 */
async function query(text, params, role = 'student') {
  const client = await pool.connect();
  try {
    // Set the session variable for RLS policies
    // (Ensure you reset this or use transactions + SET LOCAL if your pooling strategy reuses connections intensely)
    await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [role]);

    const result = await client.query(text, params);
    
    // Reset to prevent role leaking across pooled connections
    await client.query(`RESET app.current_user_role`);
    
    return result;
  } finally {
    client.release();
  }
}

module.exports = { query, pool };