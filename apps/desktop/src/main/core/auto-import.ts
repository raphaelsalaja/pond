import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import log from "electron-log/main.js";
import { z } from "zod";
import { libraryRoot } from "../paths";
import { createAutoImportWorker } from "./auto-import-worker";
import { emitFeedback } from "./feedback";
import { createManualSave } from "./manual-import";
import { getPrefs } from "./prefs";

const AutoImportLogSchema = z.object({
  entries: z.array(
    z.object({
      at: z.number(),
      name: z.string(),
      mode: z.enum(["copy", "move"]),
      ok: z.boolean(),
      id: z.string().optional(),
    }),
  ),
});
type AutoImportLog = z.infer<typeof AutoImportLogSchema>;

let worker: Awaited<ReturnType<typeof createAutoImportWorker>> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let generation = 0;

function logPath(root = libraryRoot()): string {
  return join(root, "auto-import-log.json");
}

async function readLogFile(root: string): Promise<AutoImportLog> {
  let raw: string;
  try {
    raw = await readFile(logPath(root), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return { entries: [] };
    throw error;
  }
  return AutoImportLogSchema.parse(JSON.parse(raw));
}

export function readAutoImportLog(): Promise<AutoImportLog> {
  return readLogFile(libraryRoot());
}

export async function stopAutoImport(): Promise<void> {
  generation += 1;
  if (timer) clearInterval(timer);
  timer = null;
  const previous = worker;
  worker = null;
  await previous?.stop();
}

export async function startAutoImport(): Promise<void> {
  await stopAutoImport();
  const current = generation;
  const root = resolve(libraryRoot());
  const prefs = await getPrefs();
  const cfg = prefs.autoImport;
  if (current !== generation || !cfg.enabled || !cfg.path) return;
  const directory = resolve(cfg.path);
  if (
    directory === root ||
    directory.startsWith(`${root}${sep}`) ||
    root.startsWith(`${directory}${sep}`)
  ) {
    log.warn("[pond auto-import] watched folder overlaps the library");
    return;
  }
  const next = await createAutoImportWorker({
    directory,
    checkpointPath: join(root, "auto-import-checkpoints.json"),
    mode: cfg.mode,
    async ingest(input) {
      if (resolve(libraryRoot()) !== root)
        throw new Error("The import library changed.");
      return createManualSave({
        filePaths: [input.path],
        sourceId: input.sourceId,
        importedFrom: "watched-folder",
      });
    },
    async report(entry) {
      try {
        const history = await readLogFile(root);
        history.entries = [
          { ...entry, at: Date.now(), mode: cfg.mode },
          ...history.entries,
        ].slice(0, 200);
        await mkdir(root, { recursive: true });
        await writeFile(logPath(root), JSON.stringify(history, null, 2));
      } catch (error) {
        log.warn("[pond auto-import] import log not updated", error);
      }
      if (entry.ok) {
        await emitFeedback("autoImport").catch((error) =>
          log.warn("[pond auto-import] feedback failed", error),
        );
      }
    },
  });
  if (current !== generation) {
    await next.stop();
    return;
  }
  worker = next;
  let scanning = false;
  const tick = async () => {
    if (scanning || current !== generation) return;

    scanning = true;
    try {
      await next.scan();
    } catch (error) {
      log.warn("[pond auto-import] scan failed", error);
    } finally {
      scanning = false;
    }
  };
  await tick();
  if (current === generation) timer = setInterval(() => void tick(), 1000);
}
