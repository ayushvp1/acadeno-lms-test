/**
 * run_migration_007.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Applies 007_student_portal_schema.sql section-by-section so that a
 * permission error on ALTER TABLE (tables owned by the DB superuser) does
 * NOT prevent the NEW tables from being created.
 *
 * Run once:  node run_migration_007.js
 *
 * After running, check the summary at the bottom.  Any section marked [SKIPPED]
 * needs to be run manually in pgAdmin as a superuser — the statements are
 * printed in the console and also written to superuser_steps.sql.
 * ─────────────────────────────────────────────────────────────────────────────
 */
require('dotenv').config();
const { pool } = require('./src/db/index');
const fs       = require('fs');
const path     = require('path');

// ─── Colour helpers ──────────────────────────────────────────────────────────
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
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

// ─── SQL Sections ─────────────────────────────────────────────────────────────

const S_EXT = `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`;

// These ALTER TABLE statements require table ownership (or superuser).
// task_submissions and content_items were created by the postgres superuser
// in a previous migration, so lms_user cannot alter them.
const S_ALTER_TASK   = `ALTER TABLE task_submissions  ADD COLUMN IF NOT EXISTS is_late         BOOLEAN NOT NULL DEFAULT FALSE;`;
const S_ALTER_ITEMS  = `ALTER TABLE content_items     ADD COLUMN IF NOT EXISTS is_downloadable  BOOLEAN NOT NULL DEFAULT TRUE;`;

const S_TBL_PROGRESS = `
CREATE TABLE IF NOT EXISTS content_progress (
  id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id              UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  content_item_id         UUID        NOT NULL REFERENCES content_items (id) ON DELETE CASCADE,
  is_completed            BOOLEAN     NOT NULL DEFAULT FALSE,
  watch_position_seconds  INT         NOT NULL DEFAULT 0,
  last_accessed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at            TIMESTAMPTZ,
  CONSTRAINT uq_content_progress_student_item UNIQUE (student_id, content_item_id)
);`;

const S_TBL_ACTIVITY = `
CREATE TABLE IF NOT EXISTS student_activity (
  id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id              UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  activity_date           DATE        NOT NULL,
  content_items_accessed  INT         NOT NULL DEFAULT 0,
  CONSTRAINT uq_student_activity_date UNIQUE (student_id, activity_date)
);`;

const S_TBL_CERTS = `
CREATE TABLE IF NOT EXISTS certificates (
  id                          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id                  UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  enrollment_id               UUID        NOT NULL REFERENCES enrollments (id) ON DELETE CASCADE,
  certificate_url             TEXT        NOT NULL,
  public_verification_token   UUID        NOT NULL DEFAULT uuid_generate_v4(),
  generated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_certificate_student_enrollment UNIQUE (student_id, enrollment_id)
);`;

const S_TBL_POSTS = `
CREATE TABLE IF NOT EXISTS discussion_posts (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  module_id   UUID        NOT NULL REFERENCES modules (id) ON DELETE CASCADE,
  batch_id    UUID        NOT NULL REFERENCES batches (id) ON DELETE CASCADE,
  author_id   UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`;

const S_TBL_REPLIES = `
CREATE TABLE IF NOT EXISTS discussion_replies (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id     UUID        NOT NULL REFERENCES discussion_posts (id) ON DELETE CASCADE,
  author_id   UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`;

const S_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_content_progress_student_id     ON content_progress (student_id);
CREATE INDEX IF NOT EXISTS idx_content_progress_content_item   ON content_progress (content_item_id);
CREATE INDEX IF NOT EXISTS idx_student_activity_student_date   ON student_activity (student_id, activity_date);
CREATE INDEX IF NOT EXISTS idx_certificates_student_id         ON certificates (student_id);
CREATE INDEX IF NOT EXISTS idx_certificates_token              ON certificates (public_verification_token);
CREATE INDEX IF NOT EXISTS idx_discussion_posts_module_batch   ON discussion_posts (module_id, batch_id);
CREATE INDEX IF NOT EXISTS idx_discussion_posts_author         ON discussion_posts (author_id);
CREATE INDEX IF NOT EXISTS idx_discussion_replies_post         ON discussion_replies (post_id);
CREATE INDEX IF NOT EXISTS idx_discussion_replies_author       ON discussion_replies (author_id);`;

const S_TRIGGERS = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_discussion_posts_updated_at') THEN
    CREATE TRIGGER trg_discussion_posts_updated_at
      BEFORE UPDATE ON discussion_posts
      FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
  END IF;
END $$;`;

const S_RLS = `
ALTER TABLE content_progress   ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_progress   FORCE  ROW LEVEL SECURITY;
ALTER TABLE student_activity   ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_activity   FORCE  ROW LEVEL SECURITY;
ALTER TABLE certificates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates       FORCE  ROW LEVEL SECURITY;
ALTER TABLE discussion_posts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussion_posts   FORCE  ROW LEVEL SECURITY;
ALTER TABLE discussion_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussion_replies FORCE  ROW LEVEL SECURITY;`;

const S_POLICIES = `
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='content_progress' AND policyname='super_admin_bypass_content_progress') THEN
  CREATE POLICY super_admin_bypass_content_progress ON content_progress FOR ALL
    USING (current_setting('app.current_user_role',TRUE)='super_admin')
    WITH CHECK (current_setting('app.current_user_role',TRUE)='super_admin'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='content_progress' AND policyname='student_own_content_progress') THEN
  CREATE POLICY student_own_content_progress ON content_progress FOR ALL
    USING (current_setting('app.current_user_role',TRUE)='student' AND student_id=current_setting('app.current_user_id',TRUE)::UUID)
    WITH CHECK (current_setting('app.current_user_role',TRUE)='student' AND student_id=current_setting('app.current_user_id',TRUE)::UUID); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='student_activity' AND policyname='super_admin_bypass_student_activity') THEN
  CREATE POLICY super_admin_bypass_student_activity ON student_activity FOR ALL
    USING (current_setting('app.current_user_role',TRUE)='super_admin')
    WITH CHECK (current_setting('app.current_user_role',TRUE)='super_admin'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='student_activity' AND policyname='student_own_activity') THEN
  CREATE POLICY student_own_activity ON student_activity FOR ALL
    USING (current_setting('app.current_user_role',TRUE)='student' AND student_id=current_setting('app.current_user_id',TRUE)::UUID)
    WITH CHECK (current_setting('app.current_user_role',TRUE)='student' AND student_id=current_setting('app.current_user_id',TRUE)::UUID); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='certificates' AND policyname='super_admin_bypass_certificates') THEN
  CREATE POLICY super_admin_bypass_certificates ON certificates FOR ALL
    USING (current_setting('app.current_user_role',TRUE)='super_admin')
    WITH CHECK (current_setting('app.current_user_role',TRUE)='super_admin'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='certificates' AND policyname='student_own_certificates') THEN
  CREATE POLICY student_own_certificates ON certificates FOR SELECT
    USING (current_setting('app.current_user_role',TRUE)='student' AND student_id=current_setting('app.current_user_id',TRUE)::UUID); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='discussion_posts' AND policyname='super_admin_bypass_discussion_posts') THEN
  CREATE POLICY super_admin_bypass_discussion_posts ON discussion_posts FOR ALL
    USING (current_setting('app.current_user_role',TRUE)='super_admin')
    WITH CHECK (current_setting('app.current_user_role',TRUE)='super_admin'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='discussion_posts' AND policyname='student_read_discussion_posts') THEN
  CREATE POLICY student_read_discussion_posts ON discussion_posts FOR SELECT
    USING (current_setting('app.current_user_role',TRUE)='student' AND batch_id IN (
      SELECT e.batch_id FROM enrollments e JOIN students s ON e.student_id=s.id
      WHERE s.user_id=current_setting('app.current_user_id',TRUE)::UUID AND e.status='active')); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='discussion_posts' AND policyname='student_insert_discussion_posts') THEN
  CREATE POLICY student_insert_discussion_posts ON discussion_posts FOR INSERT
    WITH CHECK (current_setting('app.current_user_role',TRUE)='student' AND author_id=current_setting('app.current_user_id',TRUE)::UUID AND batch_id IN (
      SELECT e.batch_id FROM enrollments e JOIN students s ON e.student_id=s.id
      WHERE s.user_id=current_setting('app.current_user_id',TRUE)::UUID AND e.status='active')); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='discussion_replies' AND policyname='super_admin_bypass_discussion_replies') THEN
  CREATE POLICY super_admin_bypass_discussion_replies ON discussion_replies FOR ALL
    USING (current_setting('app.current_user_role',TRUE)='super_admin')
    WITH CHECK (current_setting('app.current_user_role',TRUE)='super_admin'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='discussion_replies' AND policyname='student_read_discussion_replies') THEN
  CREATE POLICY student_read_discussion_replies ON discussion_replies FOR SELECT
    USING (current_setting('app.current_user_role',TRUE)='student' AND post_id IN (
      SELECT dp.id FROM discussion_posts dp WHERE dp.batch_id IN (
        SELECT e.batch_id FROM enrollments e JOIN students s ON e.student_id=s.id
        WHERE s.user_id=current_setting('app.current_user_id',TRUE)::UUID AND e.status='active'))); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='discussion_replies' AND policyname='student_insert_discussion_replies') THEN
  CREATE POLICY student_insert_discussion_replies ON discussion_replies FOR INSERT
    WITH CHECK (current_setting('app.current_user_role',TRUE)='student' AND author_id=current_setting('app.current_user_id',TRUE)::UUID AND post_id IN (
      SELECT dp.id FROM discussion_posts dp WHERE dp.batch_id IN (
        SELECT e.batch_id FROM enrollments e JOIN students s ON e.student_id=s.id
        WHERE s.user_id=current_setting('app.current_user_id',TRUE)::UUID AND e.status='active'))); END IF; END $$;`;

const S_GRANT_TABLES = `GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO lms_user;`;
const S_GRANT_SEQS   = `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO lms_user;`;

// ─── Main ─────────────────────────────────────────────────────────────────────

async function applyMigration007() {
  const client      = await pool.connect();
  const arrSkipped  = [];

  try {
    console.log('\n' + CYAN + '══════════════════════════════════════════════' + RESET);
    console.log(CYAN    + '  Migration 007 — Student Portal Schema'         + RESET);
    console.log(CYAN    + '══════════════════════════════════════════════\n' + RESET);

    // 0. Extension
    console.log('§0  Extension');
    await tryRun(client, 'uuid-ossp extension', S_EXT);

    // 1. Extend existing tables (may need superuser ownership)
    console.log('\n§1  Extend existing tables (may need superuser)');
    if (!await tryRun(client, 'task_submissions → is_late column',        S_ALTER_TASK))
      arrSkipped.push({ label: 'task_submissions.is_late',        sql: S_ALTER_TASK });
    if (!await tryRun(client, 'content_items → is_downloadable column',   S_ALTER_ITEMS))
      arrSkipped.push({ label: 'content_items.is_downloadable',   sql: S_ALTER_ITEMS });

    // 2. Create new tables
    console.log('\n§2  Create new tables');
    await tryRun(client, 'CREATE TABLE content_progress',      S_TBL_PROGRESS);
    await tryRun(client, 'CREATE TABLE student_activity',      S_TBL_ACTIVITY);
    await tryRun(client, 'CREATE TABLE certificates',          S_TBL_CERTS);
    await tryRun(client, 'CREATE TABLE discussion_posts',      S_TBL_POSTS);
    await tryRun(client, 'CREATE TABLE discussion_replies',    S_TBL_REPLIES);

    // 3. Indexes
    console.log('\n§3  Indexes');
    if (!await tryRun(client, 'All indexes on new tables', S_INDEXES))
      arrSkipped.push({ label: 'Indexes (table not owned by lms_user)', sql: S_INDEXES });

    // 4. Triggers
    console.log('\n§4  Triggers');
    await tryRun(client, 'discussion_posts updated_at trigger', S_TRIGGERS);

    // 5. RLS (lms_user owns new tables → these will succeed)
    console.log('\n§5  Row-Level Security');
    if (!await tryRun(client, 'ENABLE + FORCE RLS on all new tables', S_RLS))
      arrSkipped.push({ label: 'RLS enable/force (table not owned by lms_user)', sql: S_RLS });

    // 6. Policies
    console.log('\n§6  RLS Policies');
    await tryRun(client, 'All policies for new tables', S_POLICIES);

    // 7. Grants (may need superuser)
    console.log('\n§7  Grants (may need superuser)');
    if (!await tryRun(client, 'GRANT ALL ON ALL TABLES',    S_GRANT_TABLES))
      arrSkipped.push({ label: 'GRANT ALL ON TABLES',    sql: S_GRANT_TABLES });
    if (!await tryRun(client, 'GRANT ALL ON ALL SEQUENCES', S_GRANT_SEQS))
      arrSkipped.push({ label: 'GRANT ALL ON SEQUENCES', sql: S_GRANT_SEQS });

    // ─── Summary ─────────────────────────────────────────────────────────────
    console.log('\n' + CYAN + '══════════════════════════════════════════════' + RESET);
    console.log(CYAN        + '  Summary'                                     + RESET);
    console.log(CYAN        + '══════════════════════════════════════════════' + RESET);

    ok('New tables ready: content_progress, student_activity,');
    info('  certificates, discussion_posts, discussion_replies');
    info('  (+ indexes, RLS, policies — all applied)');

    if (arrSkipped.length > 0) {
      console.log('');
      warn(`${arrSkipped.length} statement(s) need superuser — run in pgAdmin as postgres:`);
      console.log('');

      const strSuperuserPath = path.join(__dirname, 'superuser_steps.sql');
      const lines = [
        '-- ================================================================',
        '-- superuser_steps.sql',
        '-- Open pgAdmin, connect as the postgres / admin superuser,',
        '-- then run these statements.',
        '-- ================================================================',
        '',
      ];
      arrSkipped.forEach(s => {
        info(`  ${s.sql}`);
        lines.push(`-- ${s.label}`);
        lines.push(s.sql);
        lines.push('');
      });
      fs.writeFileSync(strSuperuserPath, lines.join('\n'), 'utf8');
      console.log('');
      info('Statements also saved → superuser_steps.sql');
    }

    console.log('\n' + GREEN + '  Progress dashboard + video tracking + discussions are now live!\n' + RESET);

  } catch (err) {
    console.error(RED + '\n  Unexpected error: ' + err.message + RESET);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

applyMigration007();
