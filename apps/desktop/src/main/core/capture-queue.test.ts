import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CaptureDraft } from "@pond/schema/capture";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyAfterSave,
  CAPTURE_METADATA_WARNING,
  createCaptureQueue,
} from "./capture-queue";
import type { CaptureQueuePorts } from "./capture-queue";

function noop(): void {}

const roots: Array<string> = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
const draft = (id = "capture-1"): CaptureDraft => ({
  id,
  metadata: { tags: ["reference"], folderIds: [] },
  items: [
    { kind: "url", url: "https://example.com/one" },
    { kind: "url", url: "https://example.com/two" },
  ],
});
async function fixture(process: CaptureQueuePorts["process"]) {
  const root = await mkdtemp(join(tmpdir(), "pond-capture-test-"));
  roots.push(root);
  const ports: CaptureQueuePorts = {
    root: () => root,
    process,
    transfer: async (operation) => operation(),
  };
  return { root, ports, queue: createCaptureQueue(ports) };
}
describe("durable capture queue", () => {
  it("persists acceptance and resumes only the unfinished item after failure", async () => {
    const calls: Array<string> = [];
    let fail = true;
    const { root, ports, queue } = await fixture(
      async (_item, _meta, identity) => {
        calls.push(identity);
        if (identity.endsWith(":1") && fail) {
          throw new Error("offline");
        }
        return { id: identity };
      },
    );
    const accepted = await queue.accept(draft());
    expect(accepted.state).toBe("accepted");
    await queue.idle();
    expect((await queue.list())[0]).toMatchObject({
      state: "failed",
      completed: 1,
      error: "offline",
    });
    expect(
      JSON.parse(
        await readFile(join(root, ".capture-queue/capture-1.json"), "utf8"),
      ).library,
    ).toBe(root);
    fail = false;
    const restarted = createCaptureQueue(ports);
    await restarted.resume("capture-1");
    await restarted.idle();
    expect(calls).toEqual(["capture-1:0", "capture-1:1", "capture-1:1"]);
    expect((await restarted.list())[0]).toMatchObject({
      state: "complete",
      completed: 2,
    });
  });
  it("cancels after the active item and resumes only remaining captures", async () => {
    let release: () => void = noop;
    let began: () => void = noop;
    const started = new Promise<void>((resolve) => {
      began = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls: Array<string> = [];
    const { queue } = await fixture(async (_item, _meta, id) => {
      calls.push(id);
      began();
      await pending;
      return { id };
    });
    await queue.accept(draft());
    await started;
    await queue.cancel("capture-1");
    release();
    await queue.idle();
    expect((await queue.list())[0]).toMatchObject({
      state: "cancelled",
      completed: 1,
    });
    await queue.resume("capture-1");
    await queue.idle();
    expect(calls).toEqual(["capture-1:0", "capture-1:1"]);
    expect((await queue.list())[0]?.state).toBe("complete");
  });
  it("deduplicates a repeated accepted request and reports source duplicates", async () => {
    let calls = 0;
    const { queue } = await fixture(async () => {
      calls++;
      return { id: "existing", duplicate: true };
    });
    await queue.accept(draft());
    await queue.idle();
    await queue.accept(draft());
    await queue.idle();
    expect(calls).toBe(2);
    expect((await queue.list())[0]?.duplicateCount).toBe(2);
  });
  it("completes with a warning when a save landed but its metadata didn't", async () => {
    const { queue } = await fixture(async (_item, _meta, id) =>
      id.endsWith(":1") ? { id, warning: "Saved without folders." } : { id },
    );
    await queue.accept(draft());
    await queue.idle();
    expect((await queue.list())[0]).toMatchObject({
      state: "complete",
      saveIds: ["capture-1:0", "capture-1:1"],
      warning: "Saved without folders.",
    });
  });
  it("rejects invalid capture IDs", async () => {
    const { queue } = await fixture(async () => ({ id: "id" }));

    await expect(queue.cancel("../outside")).rejects.toThrow(
      "Invalid capture ID",
    );
  });
});

describe("applyAfterSave", () => {
  it("keeps the save and warns when tags or folders fail", async () => {
    await expect(
      applyAfterSave({ id: "save-1", duplicate: false }, async () => {
        throw new Error("folder is gone");
      }),
    ).resolves.toEqual({
      id: "save-1",
      duplicate: false,
      warning: CAPTURE_METADATA_WARNING,
    });
  });

  it("passes the save through when its metadata lands", async () => {
    await expect(
      applyAfterSave({ id: "save-1", duplicate: true }, async () => {}),
    ).resolves.toEqual({ id: "save-1", duplicate: true });
  });
});
