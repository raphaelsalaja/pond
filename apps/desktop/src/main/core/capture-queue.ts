import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type CaptureDraft,
  CaptureDraftSchema,
  CaptureItemSchema,
  type CaptureMetadata,
  type CaptureReceipt,
} from "@pond/schema/capture";
import log from "electron-log/main.js";
import { z } from "zod";
import { renameWithRetry } from "../lib/rename-retry";

const JobSchema = z.object({
  draft: CaptureDraftSchema.extend({
    items: z.array(CaptureItemSchema).max(500),
  }),
  total: z.number().int().nonnegative().optional(),
  library: z.string(),
  completed: z.number().int().nonnegative(),
  saveIds: z.array(z.string()),
  duplicateCount: z.number().int().nonnegative().default(0),
  error: z.string().optional(),
  state: z.enum(["accepted", "processing", "complete", "failed", "cancelled"]),
});
type Job = z.infer<typeof JobSchema>;
export interface CaptureQueuePorts {
  root(): string;
  readStored?: (path: string) => Promise<string>;
  writeStored?: (path: string, value: string) => Promise<void>;
  process(
    item: CaptureDraft["items"][number],
    metadata: CaptureMetadata,
    identity: string,
    originUrl?: string,
    trigger?: string,
  ): Promise<{ id: string; duplicate?: boolean }>;
  onComplete?: (receipt: CaptureReceipt) => void | Promise<void>;
  transfer<T>(operation: () => Promise<T>): Promise<T>;
}

export function createCaptureQueue(ports: CaptureQueuePorts) {
  const active = new Map<string, Promise<void>>();
  let serial = Promise.resolve();
  let admission = Promise.resolve();
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = admission.then(operation);
    admission = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  const directory = (root: string) => join(root, ".capture-queue");
  const path = (root: string, id: string) =>
    join(directory(root), `${id}.json`);
  async function persist(job: Job) {
    await mkdir(directory(job.library), { recursive: true });
    const target = path(job.library, job.draft.id);
    const tmp = `${target}.tmp`;
    const value = JSON.stringify(job);
    if (Buffer.byteLength(value) > 128 * 1024 * 1024)
      throw new Error("This capture exceeds the capture queue limit.");
    if (ports.writeStored) await ports.writeStored(tmp, value);
    else await writeFile(tmp, value);
    await renameWithRetry(tmp, target);
  }
  async function read(root: string, id: string): Promise<Job> {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id))
      throw new Error("Invalid capture ID.");
    const target = path(root, id);
    const value = ports.readStored
      ? await ports.readStored(target)
      : await readFile(target, "utf8");
    const result = JobSchema.parse(JSON.parse(value));
    if (result.library !== root || result.draft.id !== id)
      throw new Error("This capture belongs to another library.");
    return result;
  }
  const receipt = (job: Job): CaptureReceipt => ({
    id: job.draft.id,
    library: job.library,
    state: job.state,
    completed: job.completed,
    total: job.total ?? job.draft.items.length,
    error: job.error,
    saveIds: job.saveIds,
    duplicateCount: job.duplicateCount,
  });
  function run(job: Job) {
    const key = path(job.library, job.draft.id);
    if (active.has(key)) return;
    const work = serial
      .then(() =>
        ports.transfer(async () => {
          if (ports.root() !== job.library) return;
          if (existsSync(`${key}.cancel`)) {
            job.state = "cancelled";
            await persist(job);
            return;
          }
          job.state = "processing";
          job.error = undefined;
          await persist(job);
          try {
            while (job.completed < job.draft.items.length) {
              if (existsSync(`${key}.cancel`)) {
                job.state = "cancelled";
                break;
              }
              if (ports.root() !== job.library)
                throw new Error(
                  "Open the original library to resume this capture.",
                );
              const item = job.draft.items[job.completed];
              if (!item) break;
              const result = await ports.process(
                item,
                job.draft.metadata,
                `${job.draft.id}:${job.completed}`,
                job.draft.originUrl,
                job.draft.trigger,
              );
              job.saveIds.push(result.id);
              if (result.duplicate) job.duplicateCount++;
              job.completed++;
              await persist(job);
            }
            if (job.completed === job.draft.items.length) {
              job.state = "complete";
              job.total = job.draft.items.length;
              job.draft.items = [];
            }
          } catch (error) {
            job.state = "failed";
            job.error = error instanceof Error ? error.message : String(error);
          }
          await persist(job);
          if (job.state === "complete" && ports.onComplete) {
            try {
              await ports.onComplete(receipt(job));
            } catch (error) {
              log.warn(
                "[pond capture] onComplete failed",
                job.draft.id,
                job.saveIds,
                error,
              );
            }
          }
        }),
      )
      .catch(async (error) => {
        job.state = "failed";
        job.error = error instanceof Error ? error.message : String(error);
        await persist(job);
      })
      .finally(() => active.delete(key));
    active.set(key, work);
    serial = work.catch(() => {});
  }
  return {
    async accept(input: CaptureDraft): Promise<CaptureReceipt> {
      const draft = CaptureDraftSchema.parse(input);
      const root = ports.root();
      const result = await serialize(() =>
        ports.transfer(async () => {
          try {
            return receipt(await read(root, draft.id));
          } catch (error) {
            if (
              !(
                error instanceof Error &&
                "code" in error &&
                error.code === "ENOENT"
              )
            )
              throw error;
          }
          const job: Job = {
            draft,
            library: root,
            state: "accepted",
            completed: 0,
            saveIds: [],
            duplicateCount: 0,
          };
          await persist(job);
          return receipt(job);
        }),
      );
      if (result.state === "accepted") run(await read(root, draft.id));
      return result;
    },
    async list(): Promise<CaptureReceipt[]> {
      const root = ports.root();
      const entries = await readdir(directory(root)).catch((): string[] => []);
      const out: CaptureReceipt[] = [];
      for (const entry of entries.filter((name) => name.endsWith(".json")))
        out.push(receipt(await read(root, entry.slice(0, -5))));
      return out;
    },
    async resume(
      id: string,
      metadata?: CaptureMetadata,
    ): Promise<CaptureReceipt> {
      const root = ports.root();
      const result = await serialize(() =>
        ports.transfer(async () => {
          const job = await read(root, id);
          if (active.has(path(root, id)) || job.state === "complete")
            return receipt(job);
          await rm(`${path(root, id)}.cancel`, { force: true });
          if (metadata) job.draft.metadata = metadata;
          job.state = "accepted";
          await persist(job);
          return receipt(job);
        }),
      );
      if (result.state === "accepted") run(await read(root, id));
      return result;
    },
    async cancel(id: string): Promise<void> {
      const root = ports.root();
      await serialize(() =>
        ports.transfer(async () => {
          const job = await read(root, id);
          if (job.state === "complete") return;
          if (active.has(path(root, id))) {
            await writeFile(`${path(root, id)}.cancel`, "cancel");
            return;
          }
          job.state = "cancelled";
          await persist(job);
        }),
      );
    },
    async recover(): Promise<void> {
      for (const job of await this.list())
        if (job.state === "accepted" || job.state === "processing") {
          if (existsSync(`${path(ports.root(), job.id)}.cancel`))
            await this.cancel(job.id);
          else await this.resume(job.id);
        }
    },
    async securePending(): Promise<void> {
      const root = ports.root();
      const entries = await readdir(directory(root)).catch((): string[] => []);
      for (const entry of entries.filter((name) => name.endsWith(".json"))) {
        const job = await read(root, entry.slice(0, -5));
        await persist(job);
      }
    },
    async idle(): Promise<void> {
      await serial;
    },
  };
}
