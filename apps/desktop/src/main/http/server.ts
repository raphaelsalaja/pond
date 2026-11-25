import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { API_VERSION } from "@pond/schema/api";
import { app as electronApp } from "electron";
import log from "electron-log/main.js";
import { Hono } from "hono";
import { DEFAULT_INGEST_PORT } from "../../shared/constants";
import { pondMcpSnippet } from "../core/agent/mcp-hosts";
import { getPrefs } from "../core/prefs";
import { getIngestToken } from "../keychain";
import { apiTokens } from "./api-tokens";
import { appNavigateHandler } from "./app-navigate";
import { createAuthLimiter, createRequireAuth } from "./auth";
import { enqueueHandler } from "./enqueue";
import { apiError, handleApiError } from "./errors";
import { libraryRoutes } from "./library";
import { libraryLocationRoutes } from "./library-locations";
import { isLoopback } from "./loopback";
import { operationRoutes } from "./operations";
import { savesRoutes } from "./saves";
import { sessionImportHandler } from "./session-import";
import { sessionPendingHandler } from "./session-pending";

/** The CLI, Raycast and MCP send no `Origin`; browsers get extensions plus pages named in `prefs.api.allowedOrigins`. */
export function isAllowedOrigin(
  origin: string | undefined,
  extraAllowed: ReadonlyArray<string>,
): boolean {
  if (!origin || origin === "null") return false;
  if (origin.startsWith("chrome-extension://")) return true;
  if (origin.startsWith("moz-extension://")) return true;
  if (origin.startsWith("safari-web-extension://")) return true;
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
    const { command, args } = pondMcpSnippet();
    return c.json({
      status: "success",
      data: {
        name: "pond",
        version: electronApp.getVersion(),
        platform: process.platform,
        arch: process.arch,
        apiVersion: API_VERSION,
        ...(isLoopback(getConnInfo(c).remote.address) && {
          mcp: { command, args },
        }),
      },
    });
  });

  const requireAuth = createRequireAuth({
    localToken: getIngestToken,
    scopedToken: apiTokens.authenticate,
    limiter: authLimiter,
    remoteAddress: (c) => getConnInfo(c).remote.address,
  });

  api.use("/api/v2/app/navigate", requireAuth);
  api.use("/api/v2/enqueue", requireAuth);
  api.use("/api/v2/saves/*", requireAuth);
  api.use("/api/v2/library/*", requireAuth);
  api.use("/api/v2/operations/*", requireAuth);
  api.use("/api/v2/session/*", requireAuth);

  api.post("/api/v2/app/navigate", appNavigateHandler);
  api.post("/api/v2/enqueue", enqueueHandler);
  api.route("/api/v2/saves", savesRoutes());
  api.route("/api/v2/library", libraryRoutes());
  api.route("/api/v2/library", libraryLocationRoutes());
  api.route("/api/v2/operations", operationRoutes());
  api.post("/api/v2/session/import", sessionImportHandler);
  api.get("/api/v2/session/pending", sessionPendingHandler);

  api.notFound((c) =>
    apiError(c, "not_found", `No route for ${c.req.method} ${c.req.path}.`),
  );
  api.onError(handleApiError);

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
        if ("closeAllConnections" in nodeServer) {
          nodeServer.closeAllConnections();
        }
      }),
  };
}
