ALTER TABLE messages ADD COLUMN IF NOT EXISTS checklist jsonb;
ALTER TABLE messages ADD CONSTRAINT messages_checklist_object CHECK (checklist IS NULL OR jsonb_typeof(checklist)='object');
