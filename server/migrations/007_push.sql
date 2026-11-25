CREATE TABLE IF NOT EXISTS push_subscriptions (
 id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 session_id text NOT NULL REFERENCES "session"(id) ON DELETE CASCADE, endpoint text NOT NULL UNIQUE, p256dh text NOT NULL, auth_key text NOT NULL,
 locale text NOT NULL DEFAULT 'pt' CHECK(locale IN ('pt','en')), preview boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user ON push_subscriptions(user_id);
CREATE TABLE IF NOT EXISTS push_muted_groups (
 user_id text NOT NULL, room_id uuid NOT NULL,
 PRIMARY KEY(user_id,room_id),
 FOREIGN KEY(room_id,user_id) REFERENCES members(room_id,user_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS push_reminders (
 subscription_id uuid NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
 event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 starts_at timestamptz NOT NULL, minutes integer NOT NULL CHECK(minutes IN (15,60)),
 sent_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(subscription_id,event_id,starts_at,minutes)
);
CREATE INDEX IF NOT EXISTS push_reminders_time ON push_reminders(sent_at);
CREATE INDEX IF NOT EXISTS events_push_time ON events(starts_at) WHERE NOT cancelled;
