import {
  existsSync,
  type FSWatcher,
  statSync,
  unlinkSync,
  watch,
} from "node:fs";
import { chmod, mkdir } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { basename, dirname } from "node:path";
import type { JsonValue } from "@pond/schema/json";
import type { NativeMessage, NativeResponse } from "@pond/schema/native";
import log from "electron-log/main.js";
import { encodeReplyFrame, tryDecodeFrame } from "./frame";
import { nativeSocketPath } from "./paths";
import { liveNativePorts } from "./ports";
import { dispatchNative } from "./rpc";

export type NativeDispatch = (raw: JsonValue) => Promise<NativeResponse>;

export interface NativeServerOpts {
  path?: string;
  dispatch?: NativeDispatch;
}

interface BoundSocket {
  path: string;
  ino: number;
  restore: ReturnType<typeof setInterval>;
  watcher: FSWatcher;
  restoring: boolean;
}

const listenPaths = new WeakMap<Server, BoundSocket>();
const openSockets = new WeakMap<Server, Set<Socket>>();

function writeFrame(socket: Socket, value: NativeMessage): void {
  socket.end(encodeReplyFrame(value));
}

function handleConn(socket: Socket, dispatch: NativeDispatch): void {
  const chunks: Buffer[] = [];
  let settled = false;

  const fail = (error: string) => {
    if (settled) return;
    settled = true;
    writeFrame(socket, { ok: false, error });
  };

  socket.on("data", (chunk) => {
    if (settled) return;
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const decoded = tryDecodeFrame(Buffer.concat(chunks));
    if (decoded.status === "need-more") return;
    if (decoded.status === "invalid") {
      fail(decoded.error);
      return;
    }
    settled = true;
    void dispatch(decoded.value).then(
      (res) => writeFrame(socket, res),
      (err) => {
        log.error("[pond native] handler threw", err);
        writeFrame(socket, { ok: false, error: "internal" });
      },
    );
  });

  socket.on("error", (err) => {
    log.warn("[pond native] connection error", err);
  });
}

function bindPath(server: Server, path: string): void {
  const ino = statSync(path).ino;
  const existing = listenPaths.get(server);
  if (existing) {
    existing.path = path;
    existing.ino = ino;
    existing.restoring = false;
    return;
  }
  const restoreMissing = () => {
    const bound = listenPaths.get(server);
    if (!bound || bound.restoring || existsSync(bound.path)) return;
    log.warn("[pond native] sock missing, restoring", bound.path);
    restoreSocket(server);
  };
  const restore = setInterval(restoreMissing, 1000);
  restore.unref();
  const watcher = watch(dirname(path), (_event, filename) => {
    if (filename && filename !== basename(path)) return;
    restoreMissing();
  });
  watcher.unref?.();
  listenPaths.set(server, { path, ino, restore, watcher, restoring: false });
}

function isNamedPipe(path: string): boolean {
  return path.startsWith("\\\\.\\pipe\\");
}

/** Recreate the path after Node's unix close() unlinks it, including when an older process exits. */
function restoreSocket(server: Server): void {
  const bound = listenPaths.get(server);
  if (!bound || bound.restoring || !server.listening) return;
  bound.restoring = true;
  const path = bound.path;
  server.close((err) => {
    if (err) {
      bound.restoring = false;
      log.warn("[pond native] restore close failed", err);
      return;
    }
    server.listen(path, () => {
      void chmod(path, 0o600)
        .catch((chmodErr) => {
          log.warn("[pond native] restore chmod failed", chmodErr);
        })
        .finally(() => {
          bindPath(server, path);
          log.info("[pond native] listening", path);
        });
    });
  });
}

export async function startNativeServer(
  opts: NativeServerOpts = {},
): Promise<Server> {
  const path = opts.path ?? (await nativeSocketPath());
  const dispatch =
    opts.dispatch ?? ((raw) => dispatchNative(raw, liveNativePorts()));
  const namedPipe = isNamedPipe(path);
  if (!namedPipe) {
    await mkdir(dirname(path), { recursive: true });
    try {
      unlinkSync(path);
    } catch {}
  }

  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    handleConn(socket, dispatch);
  });
  openSockets.set(server, sockets);
  await new Promise<void>((resolve, reject) => {
    server.once("error", (err) => {
      log.error("[pond native] listen failed", path, err);
      reject(err);
    });
    server.listen(path, () => resolve());
  });
  if (!namedPipe) {
    await chmod(path, 0o600);
    bindPath(server, path);
  }
  log.info("[pond native] listening", path);
  return server;
}

export async function stopNativeServer(server: Server | null): Promise<void> {
  if (!server) return;
  const bound = listenPaths.get(server);
  if (bound) {
    clearInterval(bound.restore);
    bound.watcher.close();
  }
  const closed = new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  /** `close()` waits for open connections, and a stalled native host would block quitting. */
  for (const socket of openSockets.get(server) ?? []) socket.destroy();
  await closed;
  if (!bound) return;
  try {
    /** A newer listener may already own this path after a reload. */
    if (statSync(bound.path).ino === bound.ino) unlinkSync(bound.path);
  } catch {}
}
