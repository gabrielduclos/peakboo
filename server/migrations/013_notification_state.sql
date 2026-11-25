CREATE TABLE IF NOT EXISTS notification_state (
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 notice_id text NOT NULL CHECK (length(notice_id) BETWEEN 1 AND 160),
 seen boolean NOT NULL DEFAULT false,
 dismissed boolean NOT NULL DEFAULT false,
 PRIMARY KEY (user_id,notice_id)
);
