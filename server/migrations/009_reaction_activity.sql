-- Historical reactions remain valid but must not trigger new notifications.
ALTER TABLE reactions ADD COLUMN IF NOT EXISTS changed_at timestamptz;
ALTER TABLE reactions ADD COLUMN IF NOT EXISTS activity_id uuid;
CREATE INDEX IF NOT EXISTS reactions_activity_time ON reactions(changed_at DESC) WHERE activity_id IS NOT NULL;
