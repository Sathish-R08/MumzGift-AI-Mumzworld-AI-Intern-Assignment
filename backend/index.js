import "dotenv/config";
import express from "express";
import cors from "cors";
import giftRouter from "./routes/giftFinder.js";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Comma-separated allowed origins (e.g. "https://app.vercel.app,http://localhost:3000")
const corsOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
    methods: ["GET", "POST", "OPTIONS"],
  })
);

// Safe defaults for reverse proxies and browsers
// Set TRUST_PROXY=1 when behind e.g. Render, Fly, or nginx (correct client IP / secure cookies)
app.set("trust proxy", process.env.TRUST_PROXY === "1");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});
app.use(express.json({ limit: "256kb" }));

// Liveness for deploy / load balancers (does not call OpenRouter)
app.get("/api/health", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, service: "mumzgift-api" });
});

app.use("/api", giftRouter);

// Central error handler for unexpected throws outside route handlers
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(PORT, () => {
  console.log(`MumzGift API listening on http://localhost:${PORT}`);
});

// Avoid silent crash when another dev server still holds the port (EADDRINUSE)
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `\nPort ${PORT} is already in use. Stop the other process (e.g. old "npm run dev") or from repo root run: npm run free-ports\n` +
        `Or set a different PORT in backend/.env and match CORS_ORIGIN if the UI port changes.\n`
    );
  } else {
    console.error("Server failed to start:", err);
  }
  process.exit(1);
});
