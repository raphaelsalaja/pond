import { open, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { net, protocol } from "electron";
import log from "electron-log/main.js";
import { POND_PROTOCOL } from "../shared/constants";
import { itemFile, libraryRoot, resolvePaths } from "./paths";

const META_HOST = "_meta";
const META_DIR = "_meta";

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
      const host = url.hostname;
      const file = decodeURIComponent(url.pathname.replace(/^\//, ""));
      if (!host || !file) {
        return new Response("bad request", { status: 400 });
      }

      const { resolved, prefix } = resolveTarget(host, file);
      if (!resolved.startsWith(prefix)) {
        return new Response("forbidden", { status: 403 });
      }

      const info = await stat(resolved);
      if (!info.isFile()) {
        return new Response("not found", { status: 404 });
      }

      const total = info.size;
      const ext = extname(resolved).toLowerCase();
      const contentType = MIME[ext] ?? "application/octet-stream";

      const headers = new Headers();
      headers.set("content-type", contentType);
      headers.set("accept-ranges", "bytes");

      const rangeHeader = request.headers.get("range");
      if (rangeHeader) {
        const m = /^bytes=(\d+)-(\d*)$/i.exec(rangeHeader.trim());
        if (!m) {
          headers.set("content-range", `bytes */${total}`);
          return new Response("invalid range", { status: 416, headers });
        }
        const start = Number(m[1]);
        const end =
          m[2] && m[2].length > 0
            ? Math.min(Number(m[2]), total - 1)
            : total - 1;
        if (
          !Number.isFinite(start) ||
          !Number.isFinite(end) ||
          start > end ||
          start < 0 ||
          start >= total
        ) {
          headers.set("content-range", `bytes */${total}`);
          return new Response("range not satisfiable", {
            status: 416,
            headers,
          });
        }
        const length = end - start + 1;
        const buf = Buffer.alloc(length);
        const fh = await open(resolved, "r");
        try {
          await fh.read(buf, 0, length, start);
        } finally {
          await fh.close();
        }
        headers.set("content-range", `bytes ${start}-${end}/${total}`);
        headers.set("content-length", String(length));
        return new Response(buf, { status: 206, headers });
      }

      const fullBuf = Buffer.alloc(total);
      const fh = await open(resolved, "r");
      try {
        await fh.read(fullBuf, 0, total, 0);
      } finally {
        await fh.close();
      }
      headers.set("content-length", String(total));
      return new Response(fullBuf, { status: 200, headers });
    } catch (err) {
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
  void net;
}

function resolveTarget(
  host: string,
  file: string,
): { resolved: string; prefix: string } {
  if (host === META_HOST) {
    const base = join(libraryRoot(), META_DIR);
    return { resolved: resolve(join(base, file)), prefix: normalize(base) };
  }
  return {
    resolved: resolve(itemFile(host, file)),
    prefix: normalize(resolvePaths().itemsDir),
  };
}
