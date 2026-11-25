ALTER TABLE media ADD COLUMN IF NOT EXISTS r2_key text;
ALTER TABLE media ALTER COLUMN bytes DROP NOT NULL;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='media_storage_present' AND conrelid='media'::regclass) THEN
  ALTER TABLE media ADD CONSTRAINT media_storage_present CHECK (bytes IS NOT NULL OR r2_key IS NOT NULL);
 END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS media_r2_key_unique ON media(r2_key) WHERE r2_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS r2_delete_queue(object_key text PRIMARY KEY,queued_at timestamptz NOT NULL DEFAULT now());
CREATE OR REPLACE FUNCTION queue_deleted_r2_media() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.r2_key IS NOT NULL THEN INSERT INTO r2_delete_queue(object_key) VALUES(OLD.r2_key) ON CONFLICT DO NOTHING; END IF;
 RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS media_r2_delete ON media;
CREATE TRIGGER media_r2_delete AFTER DELETE ON media FOR EACH ROW EXECUTE FUNCTION queue_deleted_r2_media();
