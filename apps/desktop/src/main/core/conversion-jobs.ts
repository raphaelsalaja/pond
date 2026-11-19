import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  type ConversionJob,
  type ConversionPreset,
  ConversionPresetSchema,
  type ImageCompressionRequest,
  type VideoCompressionRequest,
} from "../../shared/conversion-contracts";
import { resolveSaveFilePath } from "../ipc/helpers";
import { readBundleJson, writeBundleJson } from "../lib/library-config";
import { resolvePaths } from "../paths";
import { convertMedia } from "./convert-media";
import { compressExistingImages } from "./image-compression";
import { compressExistingVideos } from "./video-compression";

export function conversionPresets(
  root = resolvePaths().libraryRoot,
): ConversionPreset[] {
  const file = join(root, "conversion-presets.json");
  const stored = readBundleJson<ConversionPreset[]>(file);
  if (!stored) {
    if (existsSync(file))
      throw new Error("Conversion presets could not be read.");
    return [];
  }
  return z.array(ConversionPresetSchema).parse(stored.data);
}
export function saveConversionPreset(
  preset: ConversionPreset,
): ConversionPreset {
  const parsed = ConversionPresetSchema.parse(preset);
  const presets = conversionPresets().filter((item) => item.id !== parsed.id);
  writeBundleJson(join(resolvePaths().libraryRoot, "conversion-presets.json"), [
    ...presets,
    parsed,
  ]);
  return parsed;
}
export function deleteConversionPreset(id: string): void {
  writeBundleJson(
    join(resolvePaths().libraryRoot, "conversion-presets.json"),
    conversionPresets().filter((item) => item.id !== id),
  );
}

interface ConversionRuntime {
  scope(): string;
  resolve(id: string, fileIndex: number): Promise<string>;
  withSource?<T>(
    id: string,
    fileIndex: number,
    operation: (source: string) => Promise<T>,
  ): Promise<T>;
  convert: typeof convertMedia;
  compress: typeof compressExistingImages;
  compressVideos: typeof compressExistingVideos;
}
const runtime: ConversionRuntime = {
  scope: () => resolvePaths().libraryRoot,
  async resolve(id, fileIndex) {
    const target = await resolveSaveFilePath(id, fileIndex);
    if (!target.ok) throw new Error(`No file is available for save ${id}.`);
    return target.path;
  },
  async withSource(id, fileIndex, operation) {
    const source = await this.resolve(id, fileIndex);
    return operation(source);
  },
  convert: convertMedia,
  compress: compressExistingImages,
  compressVideos: compressExistingVideos,
};
export function createConversionJobs(operations: ConversionRuntime) {
  const jobs = new Map<
    string,
    { value: ConversionJob; controller: AbortController }
  >();
  function runCompression(
    requested: readonly string[],
    compress: (
      ids: string[],
      hooks: {
        signal: AbortSignal;
        assertActive: () => void;
        onProgress: (completed: number, total: number) => void;
      },
    ) => Promise<{
      changed: number;
      skipped: number;
      failed?: number;
      bytesBefore: number;
      bytesAfter: number;
    }>,
  ): ConversionJob {
    if (
      [...jobs.values()].filter((job) => job.value.status === "running")
        .length >= 2
    )
      throw new Error(
        "Two conversion jobs are already running. Wait or cancel one before starting another.",
      );
    const scope = operations.scope();
    const ids = [...new Set(requested)];
    const value: ConversionJob = {
      id: crypto.randomUUID(),
      kind: "compression",
      status: "running",
      completed: 0,
      total: ids.length,
      progress: 0,
      currentId: null,
      directory: "",
      outputs: [],
      changed: 0,
      skipped: 0,
      failed: 0,
      bytesBefore: 0,
      bytesAfter: 0,
      error: null,
    };
    const controller = new AbortController();
    jobs.set(value.id, { value, controller });
    void (async () => {
      try {
        const result = await compress(ids, {
          signal: controller.signal,
          assertActive() {
            if (operations.scope() !== scope)
              throw new Error(
                "The active library changed. Start the compression again.",
              );
          },
          onProgress(completed, total) {
            value.completed = completed;
            value.progress = total > 0 ? completed / total : 0;
            value.currentId = ids[completed] ?? null;
          },
        });
        value.completed = value.total;
        value.progress = 1;
        value.currentId = null;
        value.changed = result.changed;
        value.skipped = result.skipped;
        value.failed = result.failed ?? 0;
        value.bytesBefore = result.bytesBefore;
        value.bytesAfter = result.bytesAfter;
        value.status = "complete";
      } catch (error) {
        value.currentId = null;
        value.status = controller.signal.aborted ? "cancelled" : "failed";
        value.error =
          error instanceof Error ? error.message : "Compression failed.";
      }
    })();
    return structuredClone(value);
  }
  return {
    start(input: {
      ids: readonly string[];
      fileIndex: number;
      preset: ConversionPreset;
      directory: string;
    }): ConversionJob {
      if (
        [...jobs.values()].filter((job) => job.value.status === "running")
          .length >= 2
      )
        throw new Error(
          "Two conversion jobs are already running. Wait or cancel one before starting another.",
        );
      const scope = operations.scope();
      const ids = [...new Set(input.ids)];
      const value: ConversionJob = {
        id: crypto.randomUUID(),
        kind: "export",
        status: "running",
        completed: 0,
        total: ids.length,
        progress: 0,
        currentId: null,
        directory: input.directory,
        outputs: [],
        changed: 0,
        skipped: 0,
        failed: 0,
        bytesBefore: 0,
        bytesAfter: 0,
        error: null,
      };
      const controller = new AbortController();
      jobs.set(value.id, { value, controller });
      for (const [id, job] of jobs) {
        if (jobs.size <= 20) break;
        if (job.value.status !== "running") jobs.delete(id);
      }
      void (async () => {
        try {
          for (const id of ids) {
            controller.signal.throwIfAborted();
            value.currentId = id;
            if (operations.scope() !== scope)
              throw new Error(
                "The active library changed. Start the export again.",
              );
            const convert = async (source: string) => {
              if (operations.scope() !== scope)
                throw new Error(
                  "The active library changed. Start the export again.",
                );
              return operations.convert({
                source,
                directory: input.directory,
                preset: input.preset,
                signal: controller.signal,
                onProgress(progress) {
                  value.progress = Math.min(
                    0.999,
                    (value.completed + progress) / value.total,
                  );
                },
              });
            };
            const output = operations.withSource
              ? await operations.withSource(id, input.fileIndex, convert)
              : await convert(await operations.resolve(id, input.fileIndex));
            value.outputs.push(output);
            value.completed += 1;
            value.changed += 1;
            value.progress = value.completed / value.total;
          }
          value.currentId = null;
          value.status = controller.signal.aborted ? "cancelled" : "complete";
        } catch (error) {
          value.currentId = null;
          value.status = controller.signal.aborted ? "cancelled" : "failed";
          value.error =
            error instanceof Error ? error.message : "Conversion failed.";
        }
      })();
      return structuredClone(value);
    },
    startCompression(input: ImageCompressionRequest): ConversionJob {
      return runCompression(input.ids, (ids, hooks) =>
        operations.compress({ ...input, ids, ...hooks }),
      );
    },
    startVideoCompression(input: VideoCompressionRequest): ConversionJob {
      return runCompression(input.ids, (ids, hooks) =>
        operations.compressVideos({ ...input, ids, ...hooks }),
      );
    },
    status(id: string): ConversionJob | null {
      const job = jobs.get(id);
      return job ? structuredClone(job.value) : null;
    },
    cancel(id: string): ConversionJob | null {
      const job = jobs.get(id);
      if (job?.value.status === "running") job.controller.abort();
      return job ? structuredClone(job.value) : null;
    },
  };
}
export const conversionJobs = createConversionJobs(runtime);
