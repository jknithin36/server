import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import compression from "compression";
import { randomUUID } from "crypto";

import { check } from "./routes/check";
import { rules } from "./routes/rules";
import { diagram } from "./routes/diagram";
import { pool } from "./services/db";
import { debug as debugRoutes } from "./routes/debug";

const app = express();

/** Behind a proxy/CDN (Vercel/Render/Nginx), trust X-Forwarded-For for real IPs */
app.set("trust proxy", 1);

/** Security + perf */
app.disable("x-powered-by");
app.use(helmet());
app.use(compression());

/** =========================
 *  CORS
 *  - allows prod from env FRONTEND_ORIGIN (recommended) or fallback
 *  - allows all Vercel preview deploys (*.vercel.app)
 *  - allows local dev at http://localhost:3000
 *  - handles OPTIONS preflight (Express 5 safe: uses "(.*)" instead of "*")
 *  ========================= */
const PROD_FALLBACK =
  process.env.FRONTEND_ORIGIN || "https://uscomplicance.vercel.app";

const allowedStatic = [
  PROD_FALLBACK, // production (env or fallback)
  "http://localhost:3000", // local dev (Next.js)
].filter(Boolean) as string[];

const corsOptions: cors.CorsOptions = {
  origin(origin, cb) {
    // Allow non-browser clients (curl, server-to-server)
    if (!origin) return cb(null, true);

    // Exact matches (prod/local)
    if (allowedStatic.includes(origin)) return cb(null, true);

    // Allow ALL Vercel preview deployments
    try {
      const host = new URL(origin).host;
      if (host.endsWith(".vercel.app")) return cb(null, true);
    } catch {
      // ignore parse errors, then fall through to reject
    }

    return cb(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false, // set to true ONLY if you use cookies/auth across origins
  maxAge: 86400,
};

// Apply CORS early
app.use(cors(corsOptions));
// Express 5-safe catch-all for preflight (avoid "*" which breaks path-to-regexp@6)
app.options("(.*)", cors(corsOptions));

/** Body parsing + JSON error guard */
app.use(express.json({ limit: "1mb" }));
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (err?.type === "entity.too.large")
      return res.status(413).json({ error: "Payload too large" });
    if (err instanceof SyntaxError)
      return res.status(400).json({ error: "Invalid JSON" });
    next(err);
  }
);

/** Request ID for tracing */
app.use((req, res, next) => {
  (req as any).id = randomUUID();
  res.setHeader("X-Request-Id", (req as any).id);
  next();
});

/** Logging (include request id) */
morgan.token("id", (req: any) => req.id);
app.use(
  morgan(":id :method :url :status :response-time ms - :res[content-length]")
);

/** Rate limit */
app.use(
  rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

/** DB pool errors */
pool.on("error", (e: any) => {
  console.error("pg pool error:", e);
});

/** Liveness */
app.get("/health", async (_req, res) => {
  try {
    const r = await pool.query("SELECT 1 AS ok");
    res.json({
      ok: true,
      db: r.rows?.[0]?.ok === 1,
      uptimeSec: Math.round(process.uptime()),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

/** Readiness */
app.get("/ready", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ready: true });
  } catch (e: any) {
    res.status(503).json({ ready: false, error: e?.message });
  }
});

/** Routes */
app.use(check);
app.use(rules);
app.use(diagram);
if (process.env.NODE_ENV !== "production") {
  app.use(debugRoutes);
}

/** 404 fallback */
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

/** Error handler (last) */
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal error" });
  }
);

/** Boot */
const PORT = Number(process.env.PORT ?? 3001);
const server = app.listen(PORT, () => {
  console.log(`✅ API listening on http://localhost:${PORT}`);
});

/** Keep-alive & graceful shutdown */
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

function shutdown(signal: string) {
  console.log(`${signal} received. Shutting down...`);
  server.close(async () => {
    try {
      await pool.end();
    } catch {}
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
["SIGINT", "SIGTERM"].forEach((sig) =>
  process.on(sig as NodeJS.Signals, () => shutdown(sig))
);
