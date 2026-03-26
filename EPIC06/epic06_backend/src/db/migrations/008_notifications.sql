-- ==========================================================================
-- ACADENO LMS — Migration 008: Notifications Table (EPIC-06 Prompt I)
-- ==========================================================================
-- Stores in-app notifications for students.
-- Used by:
--   - Discussion reply handler (US-STU-09): type = 'discussion_reply'
--   - Task evaluation (US-CRS-06):           type = 'task_evaluated'
--   - Certificate generation (US-STU-07):    type = 'certificate_ready'
-- ==========================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          TEXT          NOT NULL,
  title         TEXT          NOT NULL,
  body          TEXT          NOT NULL,
  is_read       BOOLEAN       NOT NULL DEFAULT FALSE,
  reference_id  UUID,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Index for fast unread-count badge queries (GET /api/student/notifications/count)
CREATE INDEX IF NOT EXISTS idx_notifications_user_is_read
  ON notifications (user_id, is_read, created_at DESC);

-- Row Level Security: users can only access their own notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_self_access ON notifications
  USING (
    current_setting('app.current_user_role', true) = 'super_admin'
    OR user_id::text = current_setting('app.current_user_id', true)
  );
