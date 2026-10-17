import { Server as HttpServer } from "node:http";
import { type ServerType, serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { app as electronApp } from "electron";
import log from "electron-log/main.js";
import { Hono } from "hono";
import { DEFAULT_INGEST_PORT } from "../../shared/constants";
import { getPrefs } from "../core/prefs";
import { getIngestToken } from "../keychain";
import { createAuthLimiter, tokensMatch } from "./auth";
import { enqueueHandler } from "./enqueue";
import { libraryRoutes } from "./library";
import { libraryInfoHandler } from "./library-info";
import { libraryLocationRoutes } from "./library-locations";
import { operationRoutes } from "./operations";
import { saveInfoHandler } from "./save-info";
import { saveThumbHandler } from "./save-thumb";
import { savesGetHandler } from "./saves-get";
import { sessionImportHandler } from "./session-import";
import { sessionPendingHandler } from "./session-pending";

function isAllowedOrigin(
  origin: string | undefined,
  extraAllowed: readonly string[],
): boolean {
  if (!origin || origin === "null") return false;
  if (origin.startsWith("chrome-extension://")) return true;
  if (origin.startsWith("moz-extension://")) return true;
  try {
    const u = new URL(origin);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
  } catch {}
  for (const allowed of extraAllowed) {
    if (!allowed) continue;
    if (origin === allowed) return true;
    if (allowed.endsWith("*") && origin.startsWith(allowed.slice(0, -1))) {
      return true;
    }
  }
  return false;
}

const authLimiter = createAuthLimiter();

function buildApp(): Hono {
  const api = new Hono();

  api.use("*", async (c, next) => {
    const origin = c.req.header("origin");
    const prefs = await getPrefs();
    if (origin && isAllowedOrigin(origin, prefs.api.allowedOrigins)) {
      c.res.headers.set("Access-Control-Allow-Origin", origin);
      c.res.headers.set("Vary", "Origin");
      c.res.headers.set(
        "Access-Control-Allow-Headers",
        "authorization, content-type",
      );
      c.res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    }
    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }
    await next();
  });

  api.get("/api/v2/app/info", async (c) => {
    return c.json({
      status: "success",
      data: {
        name: "pond",
        version: electronApp.getVersion(),
        platform: process.platform,
        arch: process.arch,
      },
    });
  });

  const requireAuth = async (
    c: Parameters<Parameters<Hono["use"]>[1]>[0],
    next: () => Promise<void>,
  ) => {
    const ip = getConnInfo(c).remote.address || "unknown";
    if (authLimiter.isBlocked(ip)) {
      return c.json({ status: "error", error: "rate_limited" }, 429);
    }
    const auth = c.req.header("authorization") ?? "";
    const expected = await getIngestToken();
    const presented = auth.replace(/^Bearer\s+/i, "");
    if (!expected || !presented || !tokensMatch(expected, presented)) {
      const tripped = authLimiter.recordFailure(ip);
      if (tripped) {
        log.warn("[pond http] rate limited after repeated auth failures", ip);
      }
      return c.json({ status: "error", error: "unauthorized" }, 401);
    }
    authLimiter.clear(ip);
    await next();
  };

  api.use("/api/v2/enqueue", requireAuth);
  api.use("/api/v2/saves/*", requireAuth);
  api.use("/api/v2/library/*", requireAuth);
  api.use("/api/v2/operations/*", requireAuth);
  api.use("/api/v2/session/*", requireAuth);

  api.post("/api/v2/enqueue", enqueueHandler);
  api.post("/api/v2/saves/get", savesGetHandler);
  api.get("/api/v2/saves/get", savesGetHandler);
  api.get("/api/v2/saves/info", saveInfoHandler);
  api.get("/api/v2/saves/thumb", saveThumbHandler);
  api.get("/api/v2/library/info", libraryInfoHandler);
  api.route("/api/v2/library", libraryRoutes());
  api.route("/api/v2/library", libraryLocationRoutes());
  api.route("/api/v2/operations", operationRoutes());
  api.post("/api/v2/session/import", sessionImportHandler);
  api.get("/api/v2/session/pending", sessionPendingHandler);

  api.notFound((c) => c.json({ status: "error", error: "not found" }, 404));
  api.onError((err, c) => {
    log.error("[pond http] unhandled error", err);
    return c.json({ status: "error", error: String(err) }, 500);
  });

  return api;
}

export interface RunningServer {
  server: ServerType;
  port: number;
  host: string;
  close: () => Promise<void>;
}

export async function startHttpServer(
  preferredPort = DEFAULT_INGEST_PORT,
  bind: "loopback" | "lan" = "loopback",
): Promise<RunningServer> {
  const hono = buildApp();
  const host = bind === "lan" ? "0.0.0.0" : "127.0.0.1";

  const nodeServer = await new Promise<ServerType>((resolve, reject) => {
    const server = serve(
      { fetch: hono.fetch, hostname: host, port: preferredPort },
      () => resolve(server),
    );
    server.once("error", reject);
  });

  log.info(`[pond http] listening on http://${host}:${preferredPort}/api/v2/`);

  return {
    server: nodeServer,
    port: preferredPort,
    host,
    close: () =>
      new Promise<void>((resolve, reject) => {
        nodeServer.close((err) => (err ? reject(err) : resolve()));
        /** `close()` waits for open connections, so a held request would block quitting. */
        if (nodeServer instanceof HttpServer) nodeServer.closeAllConnections();
      }),
  };
}
