CREATE TABLE IF NOT EXISTS profiles (
 user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 handle text UNIQUE CHECK(handle ~ '^[a-z][a-z0-9_]{2,31}$'),
 bio text NOT NULL DEFAULT '' CHECK(length(bio)<=500),
 cover text, is_public boolean NOT NULL DEFAULT false,
 handle_changed_at timestamptz
);
CREATE TABLE IF NOT EXISTS contacts (
 user_a text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 user_b text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 requester text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_a,user_b), CHECK(user_a COLLATE "C" < user_b COLLATE "C"), CHECK(requester IN (user_a,user_b))
);
CREATE INDEX IF NOT EXISTS contacts_user_b ON contacts(user_b);
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'group' CHECK(kind IN ('group','direct'));
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS direct_a text REFERENCES "user"(id) ON DELETE CASCADE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS direct_b text REFERENCES "user"(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS rooms_direct_pair ON rooms(direct_a,direct_b) WHERE kind='direct';
