import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type AutoImportWorkerOptions,
  createAutoImportWorker,
} from "./auto-import-worker";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture(mode: "copy" | "move" = "copy") {
  const root = await mkdtemp(join(tmpdir(), "pond-watch-test-"));
  roots.push(root);
  const directory = join(root, "watched");
  const library = join(root, "library");
  const trash = join(root, "trash");
  await mkdir(join(directory, "nested"), { recursive: true });
  await mkdir(library);
  await mkdir(trash);
  let time = 0;
  const imported = new Map<string, string>();
  const options: AutoImportWorkerOptions = {
    directory,
    checkpointPath: join(library, "checkpoints.json"),
    mode,
    now: () => time,
    stableMs: 1000,
    async ingest({ path, sourceId }) {
      const existing = imported.get(sourceId);
      if (existing) return { ok: true, id: existing };
      const id = `save-${imported.size}`;
      await copyFile(path, join(library, id));
      imported.set(sourceId, id);
      return { ok: true, id };
    },
    async trash(path) {
      await rename(path, join(trash, basename(path)));
    },
  };
  return {
    directory,
    library,
    trash,
    imported,
    options,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe("auto-import reconciliation", () => {
  it("imports existing nested files only after they remain stable", async () => {
    const { directory, library, imported, options, advance } = await fixture();
    const path = join(directory, "nested", "image.png");
    await writeFile(path, "partial");
    const worker = await createAutoImportWorker(options);
    await worker.scan();
    advance(1000);
    await writeFile(path, "complete original");
    await worker.scan();
    expect(imported.size).toBe(0);
    advance(1000);
    await worker.scan();
    expect(imported.size).toBe(1);
    expect(await readFile(join(library, "save-0"), "utf8")).toBe(
      "complete original",
    );
    await worker.stop();
  });

  it("uses durable checkpoints across restart and imports replacement content at the same path", async () => {
    const { directory, imported, options, advance } = await fixture();
    const path = join(directory, "image.png");
    await writeFile(path, "first");
    let worker = await createAutoImportWorker(options);
    await worker.scan();
    advance(1000);
    await worker.scan();
    await worker.stop();
    worker = await createAutoImportWorker(options);
    await worker.scan();
    advance(1000);
    await worker.scan();
    expect(imported.size).toBe(1);
    await writeFile(path, "replacement image");
    await worker.scan();
    advance(1000);
    await worker.scan();
    expect(imported.size).toBe(2);
    await worker.stop();
  });

  it("retries a non-throwing failure and deletes source only after durable successful import", async () => {
    const { directory, imported, options, advance } = await fixture("move");
    const path = join(directory, "image.png");
    await writeFile(path, "original");
    const ingest = options.ingest;
    let attempts = 0;
    options.ingest = (input) =>
      ++attempts === 1 ? Promise.resolve({ ok: false }) : ingest(input);
    const worker = await createAutoImportWorker(options);
    await worker.scan();
    advance(1000);
    await worker.scan();
    expect(await readFile(path, "utf8")).toBe("original");
    advance(1000);
    await worker.scan();
    expect(imported.size).toBe(1);
    expect(await readdir(directory)).not.toContain("image.png");
    await worker.stop();
  });

  it("moves an imported source to the trash instead of deleting it", async () => {
    const { directory, trash, options, advance } = await fixture("move");
    await writeFile(join(directory, "image.png"), "original");
    const worker = await createAutoImportWorker(options);
    await worker.scan();
    advance(1000);
    await worker.scan();
    expect(await readdir(directory)).not.toContain("image.png");
    expect(await readFile(join(trash, "image.png"), "utf8")).toBe("original");
    await worker.stop();
  });

  it("drains in-flight import before stop resolves and accepts no later work", async () => {
    const { directory, imported, options, advance } = await fixture();
    await writeFile(join(directory, "image.png"), "original");
    let release = () => {};
    const barrier = new Promise<void>((done) => {
      release = done;
    });
    let entered = () => {};
    const started = new Promise<void>((done) => {
      entered = done;
    });
    const ingest = options.ingest;
    options.ingest = async (input) => {
      entered();
      await barrier;
      return ingest(input);
    };
    const worker = await createAutoImportWorker(options);
    await worker.scan();
    advance(1000);
    const scan = worker.scan();
    await started;
    let stopped = false;
    const stop = worker.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    release();
    await scan;
    await stop;
    await writeFile(join(directory, "second.png"), "second");
    await worker.scan();
    advance(1000);
    await worker.scan();
    expect(imported.size).toBe(1);
  });

  it("does not delete a source replaced while its snapshot was imported", async () => {
    const { directory, library, options, advance } = await fixture("move");
    const path = join(directory, "image.png");
    await writeFile(path, "original");
    const ingest = options.ingest;
    options.ingest = async (input) => {
      await writeFile(path, "new replacement");
      return ingest(input);
    };
    const worker = await createAutoImportWorker(options);
    await worker.scan();
    advance(1000);
    await worker.scan();
    expect(await readFile(path, "utf8")).toBe("new replacement");
    expect(await readFile(join(library, "save-0"), "utf8")).toBe("original");
    await worker.stop();
  });

  it("refuses to start over a corrupt checkpoint file instead of overwriting it", async () => {
    const { options } = await fixture();
    await writeFile(options.checkpointPath, "{not json");
    await expect(createAutoImportWorker(options)).rejects.toThrow();
    expect(await readFile(options.checkpointPath, "utf8")).toBe("{not json");
  });
});
