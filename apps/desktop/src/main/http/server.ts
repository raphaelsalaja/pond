import { createServer, type Server } from "node:http";
import { app as electronApp } from "electron";
import log from "electron-log/main.js";
import { Hono } from "hono";
import { DEFAULT_INGEST_PORT } from "../../shared/constants";
import { getPrefs } from "../core/prefs";
import { getIngestToken } from "../keychain";
import { itemAddHandler } from "./item-add";
import { itemGetHandler } from "./item-get";
import { itemInfoHandler } from "./item-info";
import { libraryInfoHandler } from "./library-info";
import { pairingHandler } from "./pairing";

/**
 * Local HTTP server on `127.0.0.1:41610`. The Hono app is the single place
 * that translates browser-extension requests into `Transaction`s.
 *
 * Auth model:
 *  - `GET /api/v2/app/info`  public (used by the extension to probe).
 *  - everything else         requires `Authorization: Bearer <ingest-token>`.
 *
 * CORS: extension-friendly -- we echo the request origin back if it's
 * either `chrome-extension://*` or `http://localhost:*`. Eagle's API is
 * fully open on localhost; we're slightly stricter because extensions
 * plus third-party web pages on localhost are a real exposure vector.
 */

/**
 * Decide whether to echo `Access-Control-Allow-*` for the given
 * Origin. We deliberately do NOT echo for missing/`null` origins
 * (curl, non-browser clients) — those still get served, but without
 * CORS headers, which means a browser making a cross-site request
 * with `omit` credentials still can't read the body.
 *
 * Loopback origins (localhost / 127.0.0.1) are always trusted.
 * Browser-extension origins are trusted (the pond extension lives
 * there). Everything else has to be on the user-configured
 * `prefs.api.allowedOrigins` allowlist.
 */
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
  } catch {
    /* fall through */
  }
  for (const allowed of extraAllowed) {
    if (!allowed) continue;
    if (origin === allowed) return true;
    if (allowed.endsWith("*") && origin.startsWith(allowed.slice(0, -1))) {
      return true;
    }
  }
  return false;
}

/**
 * In-memory per-IP auth-failure tracker. We reset the counter on a
 * successful auth, so a legitimate client that mistypes once isn't
 * locked out. After `MAX_FAILURES` failures inside `WINDOW_MS`, the
 * IP is rejected outright for the remainder of the window. Cheap
 * defense against a slow brute-force on the bearer token if it ever
 * leaks; defense-in-depth, since the token itself is 192 bits.
 */
const AUTH_FAILURES = new Map<string, { count: number; resetAt: number }>();
const AUTH_WINDOW_MS = 5 * 60_000;
const AUTH_MAX_FAILURES = 10;

function recordAuthFailure(ip: string): boolean {
  const now = Date.now();
  const entry = AUTH_FAILURES.get(ip);
  if (!entry || entry.resetAt < now) {
    AUTH_FAILURES.set(ip, { count: 1, resetAt: now + AUTH_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > AUTH_MAX_FAILURES;
}

function clearAuthFailure(ip: string): void {
  AUTH_FAILURES.delete(ip);
}

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
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      // Hono's `c.req.raw` is a `Request`, but the underlying Node
      // socket address lives on the Node request we wrap below; we
      // pass it through via a custom header.
      c.req.header("x-pond-remote") ||
      "unknown";
    const blocked = AUTH_FAILURES.get(ip);
    if (
      blocked &&
      blocked.resetAt > Date.now() &&
      blocked.count > AUTH_MAX_FAILURES
    ) {
      return c.json({ status: "error", error: "rate_limited" }, 429);
    }
    const auth = c.req.header("authorization") ?? "";
    const expected = await getIngestToken();
    const presented = auth.replace(/^Bearer\s+/i, "");
    if (!expected || !presented || presented !== expected) {
      const tripped = recordAuthFailure(ip);
      if (tripped) {
        log.warn("[pond http] rate limited after repeated auth failures", ip);
      }
      return c.json({ status: "error", error: "unauthorized" }, 401);
    }
    clearAuthFailure(ip);
    await next();
  };

  api.use("/api/v2/item/*", requireAuth);
  api.use("/api/v2/library/*", requireAuth);
  api.use("/api/v2/pair", requireAuth);

  api.post("/api/v2/item/add", itemAddHandler);
  api.post("/api/v2/item/get", itemGetHandler);
  api.get("/api/v2/item/get", itemGetHandler);
  api.get("/api/v2/item/info", itemInfoHandler);
  api.get("/api/v2/library/info", libraryInfoHandler);
  api.get("/api/v2/pair", pairingHandler);

  api.notFound((c) => c.json({ status: "error", error: "not found" }, 404));
  api.onError((err, c) => {
    log.error("[pond http] unhandled error", err);
    return c.json({ status: "error", error: String(err) }, 500);
  });

  return api;
}

export interface RunningServer {
  server: Server;
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

  const nodeServer = createServer(async (req, res) => {
    const url = `http://${host}:${preferredPort}${req.url ?? "/"}`;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) {
        for (const entry of v) headers.append(k, entry);
      } else if (typeof v === "string") {
        headers.set(k, v);
      }
    }
    // Surface the Node socket's remote address as a header so the
    // Hono handlers can rate-limit per IP. Stripped from any value
    // the client may have set so callers can't forge it.
    headers.delete("x-pond-remote");
    const remote = req.socket?.remoteAddress;
    if (remote) headers.set("x-pond-remote", remote);
    const init: RequestInit & { duplex?: "half" } = {
      method: req.method ?? "GET",
      headers,
    };
    if (req.method && !["GET", "HEAD"].includes(req.method)) {
      init.body = req as unknown as ReadableStream<Uint8Array>;
      init.duplex = "half";
    }
    try {
      const request = new Request(url, init);
      const response = await hono.fetch(request);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
    } catch (err) {
      log.error("[pond http] bridge error", err);
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ status: "error", error: String(err) }));
    }
  });

  await new Promise<void>((resolve, reject) => {
    nodeServer.once("error", reject);
    nodeServer.listen(preferredPort, host, () => {
      nodeServer.off("error", reject);
      resolve();
    });
  });

  log.info(`[pond http] listening on http://${host}:${preferredPort}/api/v2/`);

  return {
    server: nodeServer,
    port: preferredPort,
    host,
    close: () =>
      new Promise<void>((resolve, reject) => {
        nodeServer.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
