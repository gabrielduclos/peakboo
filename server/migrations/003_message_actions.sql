ALTER TABLE media ADD COLUMN IF NOT EXISTS width integer;
ALTER TABLE media ADD COLUMN IF NOT EXISTS height integer;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to uuid REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS message_reports(message_id uuid REFERENCES messages(id) ON DELETE CASCADE,user_id text REFERENCES "user"(id) ON DELETE CASCADE,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(message_id,user_id));
