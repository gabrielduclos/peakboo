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
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
