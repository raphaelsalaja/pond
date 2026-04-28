import { readFile } from "node:fs/promises";
import { extname, normalize, resolve } from "node:path";
import { net, protocol } from "electron";
import log from "electron-log/main.js";
import { POND_PROTOCOL } from "../shared/constants";
import { itemFile, resolvePaths } from "./paths";

/**
 * Custom protocol handler for `pond://<itemId>/<file>`. Renderer uses these
 * URIs in `<img src>` / `<video src>`, which means if the library ever
 * moves on disk, nothing rendered needs rewriting -- only `resolvePaths`
 * changes. Has to be registered before the `app.ready` event.
 */

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
};

export function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: POND_PROTOCOL,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
  ]);
}

export function registerProtocol() {
  protocol.handle(POND_PROTOCOL, async (request) => {
    try {
      const url = new URL(request.url);
      const itemId = url.hostname;
      const file = decodeURIComponent(url.pathname.replace(/^\//, ""));
      if (!itemId || !file) {
        return new Response("bad request", { status: 400 });
      }

      const resolved = resolve(itemFile(itemId, file));
      const prefix = normalize(resolvePaths().itemsDir);
      if (!resolved.startsWith(prefix)) {
        return new Response("forbidden", { status: 403 });
      }

      const buf = await readFile(resolved);
      const headers = new Headers();
      const ext = extname(resolved).toLowerCase();
      headers.set("content-type", MIME[ext] ?? "application/octet-stream");
      return new Response(buf, { status: 200, headers });
    } catch (err) {
      // Logged at `debug` rather than `warn` — the renderer now handles
      // 404s gracefully (cards swap to placeholder, carousel skips broken
      // slides) and a noisy main-process log was making real warnings
      // hard to spot. The DevTools network panel still surfaces 404s if
      // you need to debug a specific path.
      const isMissing =
        err instanceof Error && /ENOENT/.test(err.message ?? "");
      if (isMissing) {
        log.debug("[pond://] not found", request.url);
      } else {
        log.warn("[pond://] resolve failed", request.url, err);
      }
      return new Response("not found", { status: 404 });
    }
  });
  // `net` is imported only so Electron's ESM typings stay happy when the
  // module is bundled; `protocol.handle` already handles streaming.
  void net;
}
