import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createLocalAttachmentService } from "./local-attachments";

const roots: Array<string> = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

it("registers selected files without importing them into the library", async () => {
  const root = await mkdtemp(join(tmpdir(), "pond-agent-files-"));
  roots.push(root);
  const path = join(root, "reference.txt");
  await writeFile(path, "Local reference");
  const attachments = createLocalAttachmentService({
    pickFiles: async () => ({
      canceled: false,
      filePaths: [path],
    }),
  });

  const picked = await attachments.pickLocalAttachments();
  expect(picked.ok).toBe(true);
  if (!picked.ok) {
    throw new Error(picked.error);
  }
  expect(picked.files).toEqual([
    expect.objectContaining({
      name: "reference.txt",
      mediaType: "text/plain",
      size: 15,
    }),
  ]);
  expect(picked.files[0]).not.toHaveProperty("path");

  const loaded = await attachments.loadLocalAttachments([
    picked.files[0]?.id ?? "",
  ]);
  expect(loaded[0]?.data.toString("utf8")).toBe("Local reference");
});
