-- superuser_steps_008.sql
-- Run these in pgAdmin as postgres superuser on acadeno_lms database

CREATE POLICY notifications_self_access ON notifications
  USING (
    current_setting('app.current_user_role', true) = 'super_admin'
    OR user_id::text = current_setting('app.current_user_id', true)
  );
