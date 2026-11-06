import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readEnrichmentSidecar } from "./enrichment-sidecar";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("enrichment sidecar", () => {
  it("round-trips portable sensitive-content metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "pond-enrichment-test-"));
    roots.push(root);
    const dir = join(root, "items", "save-1.info");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "enrichment.json"),
      JSON.stringify({
        schemaVersion: 1,
        updatedAt: 1,
        data: {
          sensitiveScore: 0.91,
          sensitiveModel: "model@revision",
        },
      }),
    );

    expect(await readEnrichmentSidecar("save-1", root)).toEqual({
      sensitiveScore: 0.91,
      sensitiveModel: "model@revision",
    });
  });
});
