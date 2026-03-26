-- ============================================================================
-- ACADENO LMS — Migration 010: Batch Announcements (US-TR-03)
-- ============================================================================
-- Allows trainers to post batch-wide announcements with pinning and expiry.
-- ============================================================================

CREATE TABLE IF NOT EXISTS batch_announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    trainer_id UUID NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    is_pinned BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_announcements_batch ON batch_announcements(batch_id);
CREATE INDEX IF NOT EXISTS idx_announcements_expiry ON batch_announcements(expires_at);

-- Comments
COMMENT ON TABLE batch_announcements IS 'Stores batch-wide communications from trainers to students.';
COMMENT ON COLUMN batch_announcements.is_pinned IS 'If true, the announcement stays at the top of the feed.';
COMMENT ON COLUMN batch_announcements.expires_at IS 'Optional date after which the announcement is hidden from students.';
