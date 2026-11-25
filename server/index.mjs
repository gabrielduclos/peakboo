import express from "express";
import {privateSocial} from "./social.mjs";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { toNodeHandler } from "better-auth/node";
import { auth, pool, origins } from "./auth.mjs";
import { migrate } from "./migrate.mjs";
import {createPush} from "./push.mjs";
import {r2,drainR2Deletes} from "./r2.mjs";
import {createRealtime} from "./realtime.mjs";
import {jsonError,registerSession,createMemberMiddleware} from "./middleware/access.mjs";
import {registerNotifications} from "./routes/notifications.mjs";
import {registerBootstrap} from "./routes/bootstrap.mjs";
import {registerGroups,registerGroupMembership} from "./routes/groups.mjs";
import {registerMessageHistory,registerMessageActions} from "./routes/messages.mjs";
import {registerEvents} from "./routes/events.mjs";
import {registerLists} from "./routes/lists.mjs";
import {registerMedia} from "./routes/media.mjs";

await migrate();
if(r2)void drainR2Deletes(pool).catch(()=>console.error("R2 cleanup pending"));
const app = express();
const push=createPush(pool);
await push.start();
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: (origin, cb) =>
      cb(
        null,
        !origin ||
          origins.includes(origin) ||
          origin === process.env.RENDER_EXTERNAL_URL,
      ),
    credentials: true,
    exposedHeaders: ["set-auth-token"],
  }),
);
// Prevent browser and intermediary storage of authenticated data and auth responses.
app.use("/api", (_req,res,next)=>{res.set("Cache-Control","private, no-store");next()});
app.get("/api/health", (_, res) => res.json({ status: "ok", app: "peakboo" }));
app.all("/api/auth/{*splat}", toNodeHandler(auth));
app.use(express.json({ limit: "32kb" }));
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 180,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "RATE_LIMIT" },
  }),
);
app.get("/api/public/profiles/:handle",(_,res)=>res.status(404).json({error:"NOT_FOUND"}));
app.get("/api/public-media/:id",(_,res)=>res.status(404).json({error:"NOT_FOUND"}));
const realtime=createRealtime(pool);
const {live,publish,notifyUsers,notifyAccount}=realtime;
registerSession(app,auth);
privateSocial(app,pool,notifyUsers);
push.register(app);
const member=createMemberMiddleware(pool);
realtime.register(app);
const routes={pool,member,jsonError,publish,push,live,notifyUsers,notifyAccount};
registerBootstrap(app,routes);
registerNotifications(app,routes);
registerGroups(app,routes);
registerMessageHistory(app,routes);
registerGroupMembership(app,routes);
registerMessageActions(app,routes);
registerEvents(app,routes);
registerMedia(app,routes);
registerLists(app,routes);

app.use("/api", (_, res) => jsonError(res, 404, "NOT_FOUND"));
// The API stays available to Cloudflare; the Render HTML is a local-only portfolio.
const dist = fileURLToPath(new URL("../dist-portfolio", import.meta.url));
if (existsSync(dist)) {
  app.use((_req,res,next)=>{res.set("Content-Security-Policy","script-src 'self'; script-src-attr 'none'; object-src 'none'; base-uri 'self'; default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; font-src 'self' data:; worker-src 'self' blob:; form-action 'self'; frame-ancestors 'none'; manifest-src 'self'; connect-src 'self'");next()});
  app.use(express.static(dist));
  app.get("/{*splat}", (_, res) => res.sendFile(path.join(dist, "index.html")));
}
app.use((err, req, res, next) => {
  console.error("Request failed:", err.code || err.name);
  if (!res.headersSent)
    jsonError(
      res,
      err.type === "entity.too.large" ? 413 : err.type === "entity.parse.failed" ? 400 : 500,
      err.type === "entity.parse.failed" ? "INVALID_INPUT" : "SERVER_ERROR",
    );
});
// Only run the existing verified, non-destructive migration when legacy media remains.
let legacyMigration;
let shuttingDown = false;
async function migrateLegacyMediaOnStartup() {
  if (!r2) return;
  try {
    const pending = await pool.query("SELECT 1 FROM media WHERE r2_key IS NULL AND bytes IS NOT NULL LIMIT 1");
    if (!pending.rowCount || shuttingDown) return;
    legacyMigration = execFile(process.execPath, [fileURLToPath(new URL("./migrate-r2.mjs", import.meta.url)), "100"], {timeout: 600000, maxBuffer: 65536}, (error, stdout) => {
      legacyMigration = undefined;
      if (error) console.error("R2 legacy media migration incomplete; original bytes retained");
      else console.log(stdout.trim());
    });
  } catch {
    console.error("R2 legacy media migration could not start; original bytes retained");
  }
}
const server = app.listen(Number(process.env.PORT || 3001), "0.0.0.0", () => {
  console.log("Peakboo ready");
  void migrateLegacyMediaOnStartup();
});
process.on("SIGTERM", () => {
  shuttingDown = true;
  legacyMigration?.kill();
  push.stop();
  realtime.close();
  server.close(() => pool.end().then(() => process.exit(0)));
});
