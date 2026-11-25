ALTER TABLE event_activity DROP CONSTRAINT IF EXISTS event_activity_action_check;
ALTER TABLE event_activity ADD CONSTRAINT event_activity_action_check CHECK(action IN ('created','updated','cancelled','confirmed'));
