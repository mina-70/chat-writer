import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const sessionSecret = process.env["SESSION_SECRET"];

if (!sessionSecret) {
  throw new Error("SESSION_SECRET environment variable is required");
}

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(sessionSecret));

app.use("/api", router);

// ── Serve the built frontend from this same process ─────────────────────────
// On Replit, the frontend and API run as two separately-routed services.
// Outside Replit there's no such router, so this process serves both:
// the chat-app's static build plus a SPA fallback for client-side routing.
const staticDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../chat-app/dist/public",
);

app.use(express.static(staticDir));

app.use((req, res, next) => {
  if (req.method !== "GET") {
    next();
    return;
  }
  if (req.path.startsWith("/api")) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.sendFile(path.join(staticDir, "index.html"));
});

export default app;
