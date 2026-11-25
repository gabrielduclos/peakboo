import {fromNodeHeaders} from "better-auth/node";
export const jsonError = (res, status, error) => res.status(status).json({ error });
export function registerSession(app,auth){
app.use("/api", async (req, res, next) => {
  try {
    const s = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!s) return jsonError(res, 401, "UNAUTHORIZED");
    req.user = s.user;
    req.session = s.session;
    next();
  } catch {
    // An unavailable authentication database is not an invalid session.
    jsonError(res, 503, "SERVICE_UNAVAILABLE");
  }
});
}
export function createMemberMiddleware(pool){
async function member(req, res, next) {
  try {
    if (
      Object.values(req.params).some(
        (id) =>
          !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
            id,
          ),
      )
    )
      return jsonError(res, 404, "NOT_FOUND");
    const r = await pool.query(
      "SELECT r.*, m.user_id, m.joined_at::text AS member_joined_at FROM rooms r JOIN members m ON m.room_id=r.id WHERE r.id=$1 AND m.user_id=$2 AND r.kind='group'",
      [req.params.room, req.user.id],
    );
    if (!r.rowCount) return jsonError(res, 404, "NOT_FOUND");
    req.room = r.rows[0];
    if(req.params.message){
      const visible=await pool.query("SELECT 1 FROM messages WHERE id=$1 AND room_id=$2 AND created_at >= $3::timestamptz",[req.params.message,req.params.room,req.room.member_joined_at]);
      if(!visible.rowCount)return jsonError(res,404,"NOT_FOUND");
    }
    next();
  } catch (e) {
    next(e);
  }
}
return member;
}
