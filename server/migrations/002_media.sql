ALTER TABLE rooms ADD COLUMN IF NOT EXISTS image text;
CREATE TABLE IF NOT EXISTS media (
 id uuid PRIMARY KEY, owner_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
 name text NOT NULL, mime text NOT NULL, size integer NOT NULL CHECK(size>0 AND size<=10485760),
 bytes bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_id uuid REFERENCES media(id);
CREATE INDEX IF NOT EXISTS media_owner ON media(owner_id);
