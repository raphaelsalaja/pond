import { createServer, type Server } from "node:http";
import { app as electronApp } from "electron";
import log from "electron-log/main.js";
import { Hono } from "hono";
import { DEFAULT_INGEST_PORT } from "../../shared/constants";
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

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // curl / non-browser clients
  if (origin.startsWith("chrome-extension://")) return true;
  if (origin.startsWith("moz-extension://")) return true;
  if (origin === "null") return true; // file://
  try {
    const u = new URL(origin);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
  } catch {
    /* fall through */
  }
  return false;
}

function buildApp(): Hono {
  const api = new Hono();

  api.use("*", async (c, next) => {
    const origin = c.req.header("origin");
    if (origin && isAllowedOrigin(origin)) {
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
    const auth = c.req.header("authorization") ?? "";
    const expected = await getIngestToken();
    const presented = auth.replace(/^Bearer\s+/i, "");
    if (!expected || !presented || presented !== expected) {
      return c.json({ status: "error", error: "unauthorized" }, 401);
    }
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
  close: () => Promise<void>;
}

export async function startHttpServer(
  preferredPort = DEFAULT_INGEST_PORT,
): Promise<RunningServer> {
  const hono = buildApp();

  const nodeServer = createServer(async (req, res) => {
    const url = `http://127.0.0.1:${preferredPort}${req.url ?? "/"}`;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) {
        for (const entry of v) headers.append(k, entry);
      } else if (typeof v === "string") {
        headers.set(k, v);
      }
    }
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
    nodeServer.listen(preferredPort, "127.0.0.1", () => {
      nodeServer.off("error", reject);
      resolve();
    });
  });

  log.info(
    `[pond http] listening on http://127.0.0.1:${preferredPort}/api/v2/`,
  );

  return {
    server: nodeServer,
    port: preferredPort,
    close: () =>
      new Promise<void>((resolve, reject) => {
        nodeServer.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
