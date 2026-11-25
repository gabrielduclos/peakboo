CREATE TABLE IF NOT EXISTS event_activity (
 id uuid PRIMARY KEY,
 event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 actor_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 action text NOT NULL CHECK(action IN ('created','updated','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_activity_event_time ON event_activity(event_id,created_at DESC);
