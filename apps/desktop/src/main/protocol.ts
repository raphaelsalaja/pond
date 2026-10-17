import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { app, net, protocol } from "electron";
import log from "electron-log/main.js";
import mime from "mime-types";
import { POND_PROTOCOL } from "../shared/constants";
import {
  libraryMediaMetadata,
  readLibraryMediaRange,
} from "./core/storage/library-media-storage";
import {
  ensureThumbnailInBackground,
  getOrCreateThumbnail,
  lookupCachedThumbnail,
} from "./core/thumbnail";
import { VIDEO_CACHE_HOST } from "./core/video-preview-proxy";
import { isPathInside } from "./lib/path-identity";
import { clampThumbWidth } from "./lib/thumbnail";
import { libraryRoot, resolvePaths, saveFile } from "./paths";

const ONE_YEAR_SECONDS = 31_536_000;

const META_HOST = "_meta";
const META_DIR = "_meta";

const REPLAY_HOST = "_replay";
const REPLAY_ASSETS = new Map([
  ["index.html", "index.html"],
  ["ui.js", "ui.js"],
  ["replay/ui.js", "ui.js"],
  ["replay/sw.js", "sw.js"],
]);

function replayAssetsDir(): string | null {
  const roots = [
    process.resourcesPath ? join(process.resourcesPath, "replay") : "",
    join(app.getAppPath(), "resources", "replay"),
  ].filter(Boolean);
  for (const root of roots) {
    if (existsSync(join(root, "index.html"))) return root;
  }
  return null;
}

export function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: POND_PROTOCOL,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true,
        /** wabac.js replays archives through a service worker registered from pond://_replay. */
        allowServiceWorkers: true,
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
      const { resolved, root } = resolveTarget(host, file);
      if (!root || !isPathInside(root, resolved)) {
        return new Response("forbidden", { status: 403 });
      }

      const version = url.searchParams.get("v");
      let target = resolved;
      let immutable = version !== null;

      const previewParam = url.searchParams.get("preview");
      const widthParam =
        previewParam ?? url.searchParams.get("tw") ?? url.searchParams.get("w");
      if (host !== META_HOST && widthParam) {
        const width = clampThumbWidth(Number(widthParam));
        if (width !== null) {
          const request = {
            saveId: host,
            sourcePath: resolved,
            width,
            version,
          };
          const thumb = previewParam
            ? await getOrCreateThumbnail({ ...request, priority: "foreground" })
            : lookupCachedThumbnail(request);
          if (thumb) {
            target = thumb.path;
            immutable = true;
          } else if (!previewParam) {
            ensureThumbnailInBackground({
              saveId: host,
              sourcePath: resolved,
              width,
              version,
              priority: "background",
            });
            immutable = false;
          }
        }
      }

      const info = await stat(target);
      if (!info.isFile()) {
        return new Response("not found", { status: 404 });
      }

      const total = (await libraryMediaMetadata(target)).originalSize;
      const ext = extname(target).toLowerCase();
      const contentType = mime.contentType(ext) || "application/octet-stream";

      const headers = new Headers();
      headers.set("content-type", contentType);
      headers.set("accept-ranges", "bytes");
      /** ACAO header so the renderer can read bytes into a canvas without tainting it. */
      headers.set("access-control-allow-origin", "*");
      headers.set(
        "cache-control",
        immutable
          ? `public, max-age=${ONE_YEAR_SECONDS}, immutable`
          : "public, max-age=600",
      );

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
        headers.set("content-range", `bytes ${start}-${end}/${total}`);
        headers.set("content-length", String(length));
        return new Response(
          request.method === "HEAD" ? null : fileBody(target, { start, end }),
          { status: 206, headers },
        );
      }

      headers.set("content-length", String(total));
      return new Response(request.method === "HEAD" ? null : fileBody(target), {
        status: 200,
        headers,
      });
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

function fileBody(path: string, range?: { start: number; end: number }) {
  const bounded = range
    ? readLibraryMediaRange({
        path,
        start: range.start,
        endExclusive: range.end + 1,
      })
    : (async function* () {
        const metadata = await libraryMediaMetadata(path);
        yield* readLibraryMediaRange({
          path,
          start: 0,
          endExclusive: metadata.originalSize,
        });
      })();
  /** SAFETY: `bounded` yields only byte buffers, while `Readable.toWeb` omits that specialization. */
  return Readable.toWeb(Readable.from(bounded)) as ReadableStream<
    Uint8Array<ArrayBufferLike>
  >;
}

interface ProtocolTarget {
  resolved: string;
  root: string | null;
}

function resolveTarget(host: string, file: string): ProtocolTarget {
  if (host === META_HOST) {
    const base = join(libraryRoot(), META_DIR);
    return { resolved: resolve(join(base, file)), root: base };
  }
  if (host === REPLAY_HOST) {
    const base = replayAssetsDir();
    const asset = base ? REPLAY_ASSETS.get(file) : undefined;
    if (!base || !asset) {
      return { resolved: "", root: null };
    }
    return { resolved: join(base, asset), root: base };
  }
  if (host === VIDEO_CACHE_HOST) {
    const base = join(libraryRoot(), VIDEO_CACHE_HOST);
    return { resolved: resolve(join(base, file)), root: base };
  }
  return {
    resolved: resolve(saveFile(host, file)),
    root: resolvePaths().savesDir,
  };
}
