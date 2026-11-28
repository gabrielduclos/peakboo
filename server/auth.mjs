import pg from "pg";
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 15000,
  connectionTimeoutMillis: 15000,
});
export const origins = (process.env.FRONTEND_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);
if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET)
  throw new Error("DATABASE_URL and BETTER_AUTH_SECRET are required");
export const auth = betterAuth({
  appName: "PedroChat",
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL:
    process.env.BETTER_AUTH_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "http://localhost:3001",
  trustedOrigins: origins,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  rateLimit: { enabled: true, window: 60, max: 30 },
  plugins: [bearer()],
});
