import { AsyncLocalStorage } from "node:async_hooks";
import {
  appendFile,
  mkdir,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";
import { ulid } from "ulid";
import { z } from "zod";
import type { OkResult } from "../../shared/query-contracts-shared";
import {
  type TransferJob,
  TransferJobSchema,
  type TransferRequest,
} from "../../shared/transfer-contracts";
import { renameWithRetry } from "../lib/rename-retry";
import { libraryRoot } from "../paths";
import { runLibraryTransfer } from "./library-transfers";

const CopyCheckpointSchema = z.object({
  key: z.string(),
  path: z.string(),
  size: z.number(),
  sha256: z.string(),
});
type CopyCheckpoint = z.infer<typeof CopyCheckpointSchema>;
interface TransferContext {
  job: TransferJob;
  cancelled: boolean;
  active: boolean;
  persistedAt: number;
  checkpoints: Map<string, CopyCheckpoint>;
  write: () => Promise<void>;
  record: (copy: CopyCheckpoint) => Promise<void>;
}
const scope = new AsyncLocalStorage<TransferContext>();
class TransferCancelledError extends Error {
  constructor() {
    super("Transfer canceled.");
    this.name = "TransferCancelledError";
  }
}

export function createTransferJobStore(directory: string) {
  const entries = new Map<string, TransferJob>();
  const running = new Map<string, TransferContext>();
  let loaded: Promise<void> | null = null;
  let writes = Promise.resolve();
  async function write() {
    const text = JSON.stringify([...entries.values()], null, 2);
    const next = writes
      .catch(() => {})
      .then(async () => {
        await mkdir(directory, { recursive: true });
        await writeFile(join(directory, "jobs.tmp"), text);
        await renameWithRetry(
          join(directory, "jobs.tmp"),
          join(directory, "jobs.json"),
        );
      });
    writes = next;
    await next;
  }
  async function load() {
    loaded ??= (async () => {
      const text = await readFile(join(directory, "jobs.json"), "utf8").catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return null;
          throw error;
        },
      );
      if (!text) return;
      for (const job of z.array(TransferJobSchema).parse(JSON.parse(text))) {
        if (job.status === "running" || job.status === "cancelling") {
          job.status = "interrupted";
          job.error = "Pond closed before this transfer finished.";
        }
        entries.set(job.id, job);
      }
      await write();
    })();
    return loaded;
  }
  async function run<T>(
    request: TransferRequest,
    operation: () => Promise<T>,
    retryId?: string,
  ): Promise<T> {
    if (scope.getStore()?.active) return operation();
    await load();
    const previous = retryId ? entries.get(retryId) : undefined;
    if (
      retryId &&
      (!previous || running.has(retryId) || previous.status === "completed")
    )
      throw new Error("This transfer cannot be retried.");
    const job: TransferJob = previous ?? {
      id: ulid(),
      request,
      status: "running",
      phase: "Preparing",
      completed: 0,
      total: 0,
      bytes: 0,
      currentFile: null,
      error: null,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
    job.status = "running";
    job.error = null;
    job.updatedAt = Date.now();
    entries.set(job.id, job);
    const checkpoints = new Map<string, CopyCheckpoint>();
    if (previous) {
      const text = await readFile(
        join(directory, `${job.id}.jsonl`),
        "utf8",
      ).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return "";
        throw error;
      });
      for (const line of text.split("\n").filter(Boolean)) {
        try {
          const copy = CopyCheckpointSchema.parse(JSON.parse(line));
          checkpoints.set(copy.key, copy);
        } catch {
          /* An interrupted append leaves only the final checkpoint unavailable. */
        }
      }
    }
    const context: TransferContext = {
      job,
      cancelled: false,
      active: true,
      persistedAt: Date.now(),
      checkpoints,
      write,
      async record(copy) {
        await appendFile(
          join(directory, `${job.id}.jsonl`),
          `${JSON.stringify(copy)}\n`,
        );
        checkpoints.set(copy.key, copy);
      },
    };
    running.set(job.id, context);
    try {
      await write();
      const result = await scope.run(context, operation);
      if (context.cancelled) throw new TransferCancelledError();
      job.status = "completed";
      job.currentFile = null;
      return result;
    } catch (error) {
      job.status =
        error instanceof TransferCancelledError ? "cancelled" : "failed";
      job.error = error instanceof Error ? error.message : "Transfer failed.";
      throw error;
    } finally {
      context.active = false;
      running.delete(job.id);
      job.updatedAt = Date.now();
      await write();
    }
  }
  return {
    run,
    async list() {
      await load();
      return [...entries.values()]
        .sort((a, b) => b.startedAt - a.startedAt)
        .map((job) => structuredClone(job));
    },
    async cancel(id: string): Promise<OkResult> {
      await load();
      const context = running.get(id);
      if (!context)
        return { ok: false, error: "This transfer already finished." };
      context.cancelled = true;
      context.job.status = "cancelling";
      context.job.updatedAt = Date.now();
      await write();
      return { ok: true };
    },
  };
}
let store: ReturnType<typeof createTransferJobStore> | undefined;
export function transferJobStore() {
  store ??= createTransferJobStore(
    join(app.getPath("userData"), "transfer-jobs"),
  );
  return store;
}
export function runTransferJob<T>(
  request: TransferRequest,
  operation: () => Promise<T>,
) {
  return runLibraryTransfer(async () => {
    if ((await realpath(request.origin)) !== (await realpath(libraryRoot())))
      throw new Error("The library changed before this transfer started.");
    return transferJobStore().run(request, operation);
  });
}
function activeContext() {
  const current = scope.getStore();
  return current?.active ? current : undefined;
}
export function checkTransferCancellation(): void {
  if (activeContext()?.cancelled) throw new TransferCancelledError();
}
export async function transferPhase(
  phase: string,
  total: number,
): Promise<void> {
  checkTransferCancellation();
  const current = activeContext();
  if (!current) return;
  Object.assign(current.job, {
    phase,
    total,
    completed: 0,
    bytes: 0,
    currentFile: null,
    updatedAt: Date.now(),
  });
  await current.write();
}
export async function transferProgress(path: string, size = 0): Promise<void> {
  const current = activeContext();
  if (!current) return;
  current.job.completed += 1;
  current.job.bytes += size;
  current.job.currentFile = path;
  current.job.updatedAt = Date.now();
  if (Date.now() - current.persistedAt >= 250) {
    current.persistedAt = Date.now();
    await current.write();
  }
}
export function transferCopyCheckpoint(
  key: string,
): CopyCheckpoint | undefined {
  return activeContext()?.checkpoints.get(key);
}
export async function recordTransferCopy(copy: CopyCheckpoint): Promise<void> {
  await activeContext()?.record(copy);
}
