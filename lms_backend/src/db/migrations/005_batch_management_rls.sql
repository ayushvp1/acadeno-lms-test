-- ============================================================================
-- ACADENO LMS — Batch Management RLS Updates
-- Migration: 004_batch_management_rls.sql
-- ============================================================================

-- 1. DROP existing policies if they exist (to avoid duplicates)
DROP POLICY IF EXISTS super_admin_update_batches ON batches;
DROP POLICY IF EXISTS trainer_update_own_batches ON batches;

-- 2. Super Admin: Allow full UPDATE access
CREATE POLICY super_admin_update_batches
    ON batches FOR UPDATE
    USING (current_setting('app.current_user_role', TRUE) = 'super_admin')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'super_admin');

-- 3. Trainer: Allow UPDATE access ONLY for batches they are assigned to
CREATE POLICY trainer_update_own_batches
    ON batches FOR UPDATE
    USING (
        current_setting('app.current_user_role', TRUE) = 'trainer'
        AND trainer_id = current_setting('app.current_user_id', TRUE)::UUID
    )
    WITH CHECK (
        current_setting('app.current_user_role', TRUE) = 'trainer'
        AND trainer_id = current_setting('app.current_user_id', TRUE)::UUID
    );

-- 4. Ensure BDA remains READ-ONLY (implicitly handled by existing SELECT policy and lack of UPDATE policy)
