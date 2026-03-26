/**
 * run_migration_008.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Applies 008_notifications.sql to create the notifications table.
 *
 * Run once:  node run_migration_008.js
 * ─────────────────────────────────────────────────────────────────────────────
 */
require('dotenv').config();
const { pool } = require('./src/db/index');
const fs       = require('fs');
const path     = require('path');

const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const RESET  = '\x1b[0m';
const ok   = (m) => console.log(`${GREEN}  ✅ ${m}${RESET}`);
const warn = (m) => console.log(`${YELLOW}  ⚠️  ${m}${RESET}`);
const info = (m) => console.log(`${CYAN}     ${m}${RESET}`);

async function tryRun(client, label, sql) {
  try {
    await client.query(sql);
    ok(label);
    return true;
  } catch (err) {
    warn(`${label}  →  SKIPPED (${err.message.split('\n')[0]})`);
    return false;
  }
}

// ─── SQL Sections ──────────────────────────────────────────────────────────

const S_CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS notifications (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          TEXT          NOT NULL,
  title         TEXT          NOT NULL,
  body          TEXT          NOT NULL,
  is_read       BOOLEAN       NOT NULL DEFAULT FALSE,
  reference_id  UUID,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);`;

const S_INDEX = `
CREATE INDEX IF NOT EXISTS idx_notifications_user_is_read
  ON notifications (user_id, is_read, created_at DESC);`;

const S_RLS_ENABLE = `ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;`;

const S_RLS_POLICY = `
CREATE POLICY notifications_self_access ON notifications
  USING (
    current_setting('app.current_user_role', true) = 'super_admin'
    OR user_id::text = current_setting('app.current_user_id', true)
  );`;

const S_GRANT = `GRANT ALL PRIVILEGES ON TABLE notifications TO lms_user;`;

// ─── Runner ────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Migration 008 — Notifications Table');
  console.log('══════════════════════════════════════════════════════\n');

  const client = await pool.connect();
  const arrSkipped = [];

  try {
    // §1 — Create notifications table
    info('§1  CREATE TABLE notifications');
    if (!await tryRun(client, 'notifications table', S_CREATE_TABLE)) {
      arrSkipped.push(S_CREATE_TABLE.trim());
    }

    // §2 — Index (may fail if table owned by superuser)
    info('§2  CREATE INDEX');
    if (!await tryRun(client, 'idx_notifications_user_is_read', S_INDEX)) {
      arrSkipped.push(S_INDEX.trim());
    }

    // §3 — RLS (may fail if table owned by superuser)
    info('§3  ENABLE ROW LEVEL SECURITY');
    if (!await tryRun(client, 'notifications RLS enable', S_RLS_ENABLE)) {
      arrSkipped.push(S_RLS_ENABLE.trim());
    }

    info('§4  CREATE POLICY notifications_self_access');
    if (!await tryRun(client, 'notifications_self_access policy', S_RLS_POLICY)) {
      arrSkipped.push(S_RLS_POLICY.trim());
    }

    // §5 — Grant (may fail if table owned by superuser)
    info('§5  GRANT TO lms_user');
    if (!await tryRun(client, 'GRANT notifications to lms_user', S_GRANT)) {
      arrSkipped.push(S_GRANT.trim());
    }

  } finally {
    client.release();
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  if (arrSkipped.length === 0) {
    console.log(`${GREEN}  Migration 008 complete — all steps applied ✅${RESET}`);
  } else {
    console.log(`${YELLOW}  Migration 008 done with ${arrSkipped.length} skipped step(s).${RESET}`);
    const strSuperuserFile = path.join(__dirname, 'superuser_steps_008.sql');
    const strContent = [
      '-- superuser_steps_008.sql',
      '-- Run these in pgAdmin as postgres superuser on acadeno_lms database',
      '',
      ...arrSkipped,
      ''
    ].join('\n');
    fs.writeFileSync(strSuperuserFile, strContent);
    console.log(`${YELLOW}  Skipped statements written to: superuser_steps_008.sql${RESET}`);
  }
  console.log('══════════════════════════════════════════════════════\n');

  await pool.end();
}

main().catch(err => {
  console.error('\x1b[31mFatal:\x1b[0m', err);
  process.exit(1);
});
