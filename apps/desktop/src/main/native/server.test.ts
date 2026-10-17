import { spawn } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JsonValue } from "@pond/schema/json";
import type { NativeMessage } from "@pond/schema/native";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeFrame, tryDecodeFrame } from "./frame";
import { nativeSocketPath } from "./paths";
import { startNativeServer, stopNativeServer } from "./server";

let pipeSequence = 0;

async function testEndpoint(): Promise<{ dir: string | null; path: string }> {
  if (process.platform === "win32") {
    pipeSequence += 1;
    return {
      dir: null,
      path: String.raw`\\.\pipe\pond-native-test-${process.pid}-${pipeSequence}`,
    };
  }
  const dir = await mkdtemp(join(tmpdir(), "pond-native-"));
  return { dir, path: join(dir, "native.sock") };
}

async function readFrame(
  path: string,
  request: NativeMessage,
): Promise<JsonValue> {
  const socket = createConnection(path);
  const chunks: Buffer[] = [];
  const done = new Promise<JsonValue>((resolve, reject) => {
    socket.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const decoded = tryDecodeFrame(Buffer.concat(chunks));
      if (decoded.status === "need-more") return;
      if (decoded.status === "invalid") {
        reject(new Error(decoded.error));
        return;
      }
      resolve(decoded.value);
    });
    socket.on("error", reject);
  });
  socket.write(encodeFrame(request));
  return done;
}

describe("native server", () => {
  let dir: string | null = null;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = null;
  });

  it("dispatches a framed request over a temp socket", async () => {
    const endpoint = await testEndpoint();
    dir = endpoint.dir;
    const { path } = endpoint;
    const dispatch = vi.fn(async () => ({
      ok: true as const,
      data: { app: "pond" },
    }));
    const server = await startNativeServer({ path, dispatch });
    try {
      await expect(readFrame(path, { type: "hello" })).resolves.toEqual({
        ok: true,
        data: { app: "pond" },
      });
      expect(dispatch).toHaveBeenCalledWith({ type: "hello" });
    } finally {
      await stopNativeServer(server);
    }
  });

  it("stops while a client holds an unfinished request open", async () => {
    const endpoint = await testEndpoint();
    dir = endpoint.dir;
    const { path } = endpoint;
    const server = await startNativeServer({ path, dispatch: vi.fn() });
    const client = createConnection(path);
    await new Promise<void>((resolve) => client.once("connect", resolve));
    client.write(Buffer.from([1, 0]));
    const clientClosed = new Promise<void>((resolve) =>
      client.once("close", () => resolve()),
    );
    client.on("error", () => {});

    await stopNativeServer(server);
    await clientClosed;
  });

  it("rejects an oversized frame without calling dispatch", async () => {
    const endpoint = await testEndpoint();
    dir = endpoint.dir;
    const { path } = endpoint;
    const dispatch = vi.fn();
    const server = await startNativeServer({ path, dispatch });
    try {
      const header = Buffer.alloc(4);
      header.writeUInt32LE(9 * 1024 * 1024, 0);
      await expect(readFrameRaw(path, header)).resolves.toEqual({
        ok: false,
        error: "invalid",
      });
      expect(dispatch).not.toHaveBeenCalled();
    } finally {
      await stopNativeServer(server);
    }
  });

  const windowsHost = join(
    process.cwd(),
    "resources",
    "bin",
    "pond-native-host.exe",
  );
  /** A running Pond owns the per-user pipe; connecting proves it is taken. */
  function pipeInUse(path: string): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = createConnection(path);
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
    });
  }

  it.skipIf(process.platform !== "win32" || !existsSync(windowsHost))(
    "matches the SID-qualified pipe used by the Windows native host",
    async (context) => {
      if (await pipeInUse(await nativeSocketPath())) {
        context.skip("Pond is running and owns the native host pipe");
      }
      const server = await startNativeServer({
        dispatch: async () => ({ ok: true as const, data: { app: "pond" } }),
      });
      try {
        await expect(
          runNativeHost(windowsHost, { type: "hello" }),
        ).resolves.toEqual({ ok: true, data: { app: "pond" } });
      } finally {
        await stopNativeServer(server);
      }
    },
  );

  it.skipIf(process.platform === "win32")(
    "keeps the replacement socket reachable after the previous listener stops",
    async () => {
      dir = await mkdtemp(join(tmpdir(), "pond-native-"));
      const path = join(dir, "native.sock");
      const first = await startNativeServer({
        path,
        dispatch: async () => ({ ok: true as const, data: { n: 1 } }),
      });
      const second = await startNativeServer({
        path,
        dispatch: async () => ({ ok: true as const, data: { n: 2 } }),
      });
      await stopNativeServer(first);
      await vi.waitFor(
        async () => {
          await expect(readFrame(path, { type: "hello" })).resolves.toEqual({
            ok: true,
            data: { n: 2 },
          });
        },
        { timeout: 3000, interval: 50 },
      );
      await stopNativeServer(second);
    },
  );

  it.skipIf(process.platform === "win32")(
    "restores the socket file if it disappears while listening",
    async () => {
      dir = await mkdtemp(join(tmpdir(), "pond-native-"));
      const path = join(dir, "native.sock");
      const server = await startNativeServer({
        path,
        dispatch: async () => ({ ok: true as const, data: { app: "pond" } }),
      });
      try {
        unlinkSync(path);
        await vi.waitFor(
          async () => {
            await expect(readFrame(path, { type: "hello" })).resolves.toEqual({
              ok: true,
              data: { app: "pond" },
            });
          },
          { timeout: 3000, interval: 100 },
        );
      } finally {
        await stopNativeServer(server);
      }
    },
  );
});

async function runNativeHost(
  executable: string,
  request: NativeMessage,
): Promise<JsonValue> {
  const child = spawn(executable, [], { stdio: ["pipe", "pipe", "ignore"] });
  const chunks: Buffer[] = [];
  child.stdout.on("data", (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  const result = new Promise<JsonValue>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`native host exited ${code}`));
        return;
      }
      const decoded = tryDecodeFrame(Buffer.concat(chunks));
      if (decoded.status !== "ok") {
        reject(new Error("native host returned an incomplete response"));
        return;
      }
      resolve(decoded.value);
    });
  });
  child.stdin.end(encodeFrame(request));
  return result;
}

async function readFrameRaw(path: string, bytes: Buffer): Promise<JsonValue> {
  const socket = createConnection(path);
  const chunks: Buffer[] = [];
  const done = new Promise<JsonValue>((resolve, reject) => {
    socket.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const decoded = tryDecodeFrame(Buffer.concat(chunks));
      if (decoded.status === "need-more") return;
      if (decoded.status === "invalid") {
        reject(new Error(decoded.error));
        return;
      }
      resolve(decoded.value);
    });
    socket.on("error", reject);
  });
  socket.write(bytes);
  return done;
}
