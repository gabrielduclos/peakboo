import { readFile } from "node:fs/promises";
import { getMigrations } from "better-auth/db/migration";
import { pool, auth } from "./auth.mjs";
export async function migrate() {
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(8349751)");
    await c.query(
      await readFile(
        new URL("./migrations/001_initial.sql", import.meta.url),
        "utf8",
      ),
    );
    await c.query(
      "INSERT INTO peakboo_migrations(version) VALUES('001_initial') ON CONFLICT DO NOTHING",
    );
    await c.query(await readFile(new URL("./migrations/002_media.sql", import.meta.url), "utf8"));
    await c.query("INSERT INTO peakboo_migrations(version) VALUES('002_media') ON CONFLICT DO NOTHING");
    await c.query(await readFile(new URL("./migrations/003_message_actions.sql", import.meta.url), "utf8"));
    await c.query("INSERT INTO peakboo_migrations(version) VALUES('003_message_actions') ON CONFLICT DO NOTHING");
    await c.query(await readFile(new URL("./migrations/004_profiles_contacts.sql", import.meta.url), "utf8"));
    await c.query("INSERT INTO peakboo_migrations(version) VALUES('004_profiles_contacts') ON CONFLICT DO NOTHING");
    await c.query(await readFile(new URL("./migrations/005_event_activity.sql", import.meta.url), "utf8"));
    await c.query("INSERT INTO peakboo_migrations(version) VALUES('005_event_activity') ON CONFLICT DO NOTHING");
    await c.query(await readFile(new URL("./migrations/006_r2_media.sql", import.meta.url),"utf8"));
    await c.query("INSERT INTO peakboo_migrations(version) VALUES('006_r2_media') ON CONFLICT DO NOTHING");
    await c.query(await readFile(new URL("./migrations/007_push.sql",import.meta.url),"utf8"));
    await c.query("INSERT INTO peakboo_migrations(version) VALUES('007_push') ON CONFLICT DO NOTHING");
    const singleReaction=await c.query("SELECT 1 FROM peakboo_migrations WHERE version='008_single_reaction'");
    if(!singleReaction.rowCount){
      await c.query(await readFile(new URL("./migrations/008_single_reaction.sql",import.meta.url),"utf8"));
      await c.query("INSERT INTO peakboo_migrations(version) VALUES('008_single_reaction')");
    }
    const reactionActivity=await c.query("SELECT 1 FROM peakboo_migrations WHERE version='009_reaction_activity'");
    if(!reactionActivity.rowCount){
      await c.query(await readFile(new URL("./migrations/009_reaction_activity.sql",import.meta.url),"utf8"));
      await c.query("INSERT INTO peakboo_migrations(version) VALUES('009_reaction_activity')");
    }
    const attendance=await c.query("SELECT 1 FROM peakboo_migrations WHERE version='010_attendance_activity'");
    if(!attendance.rowCount){
      await c.query(await readFile(new URL("./migrations/010_attendance_activity.sql",import.meta.url),"utf8"));
      await c.query("INSERT INTO peakboo_migrations(version) VALUES('010_attendance_activity')");
    }
    const lists=await c.query("SELECT 1 FROM peakboo_migrations WHERE version='011_shared_lists'");
    if(!lists.rowCount){
      await c.query(await readFile(new URL("./migrations/011_shared_lists.sql",import.meta.url),"utf8"));
      await c.query("INSERT INTO peakboo_migrations(version) VALUES('011_shared_lists')");
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
