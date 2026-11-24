// Adapted from Uorqui profiles and friendship flows. PeakBoo owns its data and API.
import { z } from "zod";
const reserved = new Set([
  "admin",
  "support",
  "peakboo",
  "system",
  "moderator",
  "root",
  "api",
  "auth",
  "settings",
  "help",
  "privacy",
]);
const handle = z
  .string()
  .regex(/^[a-z][a-z0-9_]{2,31}$/)
  .refine((v) => !reserved.has(v));
const profileInput = z
  .object({
    handle,
    name: z.string().trim().min(2).max(80),
    bio: z.string().trim().max(500),
    isPublic: z.boolean(),
  })
  .strict();
const fail = (res, status, error) => res.status(status).json({ error });
const fields = `u.id,u.name,u.image,p.handle,p.bio,p.cover,p.is_public AS "isPublic",u."createdAt" AS "createdAt",p.handle_changed_at AS "handleChangedAt"`;
const ownMedia = /^\/api\/media\/([a-f0-9-]{36})$/i;
function publicPhoto(url) {
  const id = ownMedia.exec(url || "")?.[1];
  return id ? "/api/public-media/" + id : null;
}
export function publicSocial(app, pool) {
  app.get("/api/public/profiles/:handle", async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!handle.safeParse(req.params.handle).success)
      return fail(res, 404, "NOT_FOUND");
    const p = (
      await pool.query(
        `SELECT ${fields} FROM profiles p JOIN "user" u ON u.id=p.user_id WHERE p.handle=$1 AND p.is_public`,
        [req.params.handle],
      )
    ).rows[0];
    if (!p) return fail(res, 404, "NOT_FOUND");
    const { handleChangedAt, isPublic, ...safe } = p;
    res.json({
      profile: {
        ...safe,
        image: publicPhoto(p.image),
        cover: publicPhoto(p.cover),
      },
    });
  });
  app.get("/api/public-media/:id", async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!/^[a-f0-9-]{36}$/i.test(req.params.id))
      return fail(res, 404, "NOT_FOUND");
    const a = (
      await pool.query(
        `SELECT a.mime,a.bytes FROM media a JOIN profiles p ON p.user_id=a.owner_id JOIN "user" u ON u.id=p.user_id WHERE a.id=$1 AND a.room_id IS NULL AND p.is_public AND (u.image='/api/media/'||a.id::text OR p.cover='/api/media/'||a.id::text) AND a.mime IN ('image/jpeg','image/png','image/webp','image/gif')`,
        [req.params.id],
      )
    ).rows[0];
    if (!a) return fail(res, 404, "NOT_FOUND");
    res
      .set({ "Content-Type": a.mime, "X-Content-Type-Options": "nosniff" })
      .send(a.bytes);
  });
}
export function privateSocial(app, pool, notify) {
  const ensure = async (id) =>
    pool.query(
      "INSERT INTO profiles(user_id) VALUES($1) ON CONFLICT DO NOTHING",
      [id],
    );
  app.get("/api/me/profile", async (req, res) => {
    await ensure(req.user.id);
    res
      .set("Cache-Control", "no-store")
      .json({
        profile: (
          await pool.query(
            `SELECT ${fields} FROM profiles p JOIN "user" u ON u.id=p.user_id WHERE p.user_id=$1`,
            [req.user.id],
          )
        ).rows[0],
      });
  });
  app.put("/api/me/profile", async (req, res) => {
    const input = profileInput.safeParse(req.body);
    if (!input.success) return fail(res, 400, "INVALID_INPUT");
    await ensure(req.user.id);
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const old = (
        await c.query("SELECT * FROM profiles WHERE user_id=$1 FOR UPDATE", [
          req.user.id,
        ])
      ).rows[0];
      if (
        old.handle &&
        old.handle !== input.data.handle &&
        Date.now() - new Date(old.handle_changed_at).getTime() < 15 * 86400000
      ) {
        await c.query("ROLLBACK");
        return fail(res, 423, "USERNAME_CHANGE_COOLDOWN");
      }
      await c.query(
        "UPDATE profiles SET handle=$2,bio=$3,is_public=$4,handle_changed_at=CASE WHEN handle IS DISTINCT FROM $2 THEN now() ELSE handle_changed_at END WHERE user_id=$1",
        [req.user.id, input.data.handle, input.data.bio, input.data.isPublic],
      );
      await c.query('UPDATE "user" SET name=$2 WHERE id=$1', [
        req.user.id,
        input.data.name,
      ]);
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      if (e.code === "23505") return fail(res, 409, "HANDLE_TAKEN");
      throw e;
    } finally {
      c.release();
    }
    notify([req.user.id]);
    res.json({ ok: true });
  });
  app.get("/api/profiles/search", async (req, res) => {
    const q = String(req.query.q || "")
      .trim()
      .replace(/^@/, "");
    if (q.length < 2 || q.length > 40) return fail(res, 400, "INVALID_INPUT");
    const pattern = "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
    res
      .set("Cache-Control", "no-store")
      .json({
        profiles: (
          await pool.query(
            `SELECT ${fields} FROM profiles p JOIN "user" u ON u.id=p.user_id WHERE p.is_public AND u.id<>$1 AND (p.handle ILIKE $2 OR u.name ILIKE $2) ORDER BY p.handle LIMIT 15`,
            [req.user.id, pattern],
          )
        ).rows,
      });
  });
}
