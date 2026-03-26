-- ================================================================
-- superuser_steps.sql
-- Open pgAdmin, connect as the postgres / admin superuser,
-- then run these statements.
-- ================================================================

-- task_submissions.is_late
ALTER TABLE task_submissions  ADD COLUMN IF NOT EXISTS is_late         BOOLEAN NOT NULL DEFAULT FALSE;

-- content_items.is_downloadable
ALTER TABLE content_items     ADD COLUMN IF NOT EXISTS is_downloadable  BOOLEAN NOT NULL DEFAULT TRUE;

-- tasks.status (FR-CRS-05 consistency with content_items)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived'));
UPDATE tasks SET status = 'published' WHERE is_published = TRUE AND status = 'draft';

-- tasks.instructions (renaming from rubric for code consistency)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS instructions TEXT;
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'rubric') THEN
        UPDATE tasks SET instructions = rubric WHERE instructions IS NULL;
    END IF;
END $$;
