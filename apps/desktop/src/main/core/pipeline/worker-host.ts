import { stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { app, utilityProcess } from "electron";
import log from "electron-log/main.js";
import { ulid } from "ulid";
import { resolveMainOut } from "../../lib/resolve-preload";
import { binariesAvailable, FFMPEG_PATH_ENV } from "../refresh/binaries";
import { QueueWorkerResponseSchema } from "./worker-contract";
import {
  createQueueWorkerHost,
  type QueueWorkerHostDependencies,
  type QueueWorkerResult,
} from "./worker-host-core";
import { runsQueueWorkerInProcess } from "./worker-mode";
import { executeQueueWorkerRequest } from "./worker-operations";

const dependencies: QueueWorkerHostDependencies = {
  spawn: () => {
    if (!app.isReady()) {
      throw new Error("Queue workers require Electron to be ready.");
    }
    const ffmpeg = binariesAvailable().ffmpeg;
    const child = utilityProcess.fork(resolveMainOut("queue-worker.js"), [], {
      serviceName: "Pond Queue Worker",
      stdio: ["ignore", "ignore", "pipe"],
      env: ffmpeg ? { ...process.env, [FFMPEG_PATH_ENV]: ffmpeg } : process.env,
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      log.warn("[pond queue workers] stderr", String(chunk).trim());
    });
    return {
      onMessage: (listener) => {
        child.on("message", (message) => {
          const response = QueueWorkerResponseSchema.safeParse(message);
          if (response.success) listener(response.data);
        });
      },
      onExit: (listener) => {
        child.on("exit", listener);
      },
      postMessage: (request) => child.postMessage(request),
      kill: () => child.kill(),
    };
  },
  createJobId: ulid,
  validateSourcePath: async (path) => {
    if (!isAbsolute(path)) return false;
    const info = await stat(path);
    return info.isFile();
  },
  onStopped: () => log.info("[pond queue workers] stopped"),
};

if (runsQueueWorkerInProcess())
  dependencies.execute = executeQueueWorkerRequest;

const host = createQueueWorkerHost(dependencies);

export type { QueueWorkerResult } from "./worker-host-core";

export async function runQueueWorkerJob(
  ...args: Parameters<typeof host.run>
): Promise<QueueWorkerResult> {
  return host.run(...args);
}

export function disposeQueueWorkerHost(): void {
  host.dispose();
}
