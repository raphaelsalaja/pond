import { expect, it } from "vitest";
import { ConversionPresetSchema } from "../../shared/conversion-contracts";
import { createConversionJobs } from "./conversion-jobs";

const preset = ConversionPresetSchema.parse({
  id: "web",
  name: "Web",
  format: "webp",
});
it("cancels a running conversion and never starts the remaining selection", async () => {
  const began = Promise.withResolvers<void>();
  const finished = Promise.withResolvers<void>();
  const resolved: Array<string> = [];
  const jobs = createConversionJobs({
    scope: () => "fixture",
    async resolve(id) {
      resolved.push(id);
      return id;
    },
    async convert({ signal }) {
      began.resolve();
      await new Promise<void>((_, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            finished.resolve();
            reject(new Error("Cancelled"));
          },
          { once: true },
        );
      });
      return "unused";
    },
    async compress() {
      return { changed: 0, skipped: 0, bytesBefore: 0, bytesAfter: 0 };
    },
    async compressVideos() {
      return {
        changed: 0,
        skipped: 0,
        failed: 0,
        bytesBefore: 0,
        bytesAfter: 0,
      };
    },
  });
  const job = jobs.start({
    ids: ["a", "b"],
    fileIndex: 0,
    preset,
    directory: "/output",
  });
  await began.promise;
  jobs.cancel(job.id);
  await finished.promise;
  await Promise.resolve();
  await Promise.resolve();
  expect(jobs.status(job.id)?.status).toBe("cancelled");
  expect(resolved).toEqual(["a"]);
  expect(jobs.status(job.id)?.outputs).toEqual([]);
});
it("reports completed outputs separately from a failed file", async () => {
  const done = Promise.withResolvers<void>();
  const jobs = createConversionJobs({
    scope: () => "fixture",
    async resolve(id) {
      return id;
    },
    async convert({ source }) {
      if (source === "bad") {
        done.resolve();
        throw new Error("Unsupported file");
      }
      return `${source}.webp`;
    },
    async compress() {
      return { changed: 0, skipped: 0, bytesBefore: 0, bytesAfter: 0 };
    },
    async compressVideos() {
      return {
        changed: 0,
        skipped: 0,
        failed: 0,
        bytesBefore: 0,
        bytesAfter: 0,
      };
    },
  });
  const job = jobs.start({
    ids: ["good", "bad", "never"],
    fileIndex: 0,
    preset,
    directory: "/output",
  });
  await done.promise;
  await expect.poll(() => jobs.status(job.id)?.status).toBe("failed");
  expect(jobs.status(job.id)).toMatchObject({
    status: "failed",
    completed: 1,
    outputs: ["good.webp"],
    error: "Unsupported file",
  });
});

it("reports transactional compression progress and byte savings", async () => {
  const finished = Promise.withResolvers<void>();
  const jobs = createConversionJobs({
    scope: () => "fixture",
    async resolve(id) {
      return id;
    },
    async convert({ source }) {
      return source;
    },
    async compress({ onProgress }) {
      onProgress?.(1, 2);
      onProgress?.(2, 2);
      finished.resolve();
      return {
        changed: 2,
        skipped: 0,
        bytesBefore: 1000,
        bytesAfter: 600,
      };
    },
    async compressVideos() {
      return {
        changed: 0,
        skipped: 0,
        failed: 0,
        bytesBefore: 0,
        bytesAfter: 0,
      };
    },
  });
  const job = jobs.startCompression({
    ids: ["a", "b"],
    fileIndex: 0,
    mode: "quality",
    quality: 75,
  });
  await finished.promise;
  await Promise.resolve();
  expect(jobs.status(job.id)).toMatchObject({
    kind: "compression",
    status: "complete",
    completed: 2,
    total: 2,
    progress: 1,
    bytesBefore: 1000,
    bytesAfter: 600,
  });
});

it("runs video compression as a compression job with its own savings", async () => {
  const finished = Promise.withResolvers<void>();
  const requested: Array<Array<string>> = [];
  const jobs = createConversionJobs({
    scope: () => "fixture",
    async resolve(id) {
      return id;
    },
    async convert({ source }) {
      return source;
    },
    async compress() {
      throw new Error("Image compression must not run for videos.");
    },
    async compressVideos({ ids, quality, onProgress }) {
      requested.push([...ids, quality]);
      onProgress?.(1, 1);
      finished.resolve();
      return {
        changed: 1,
        skipped: 0,
        failed: 1,
        bytesBefore: 10_000,
        bytesAfter: 4000,
      };
    },
  });
  const job = jobs.startVideoCompression({
    ids: ["a", "a"],
    quality: "balanced",
  });
  await finished.promise;
  await Promise.resolve();
  expect(requested).toEqual([["a", "balanced"]]);
  expect(jobs.status(job.id)).toMatchObject({
    kind: "compression",
    status: "complete",
    total: 1,
    changed: 1,
    failed: 1,
    bytesBefore: 10_000,
    bytesAfter: 4000,
  });
});
