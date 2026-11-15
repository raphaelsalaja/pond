import { afterEach, expect, it, vi } from "vitest";
import type { DownloadRow } from "@/features/downloads/lib/status-feed";
import { downloadsSelection } from "@/features/downloads/state/downloads-selection";
import type { NotifyOptions } from "@/shared/lib/toast";
import { clearUnfinishedDownloads, trashDownloadRows } from "./actions";

const row: DownloadRow = {
  id: "save-1",
  saveId: "save-1",
  name: "Download",
  url: "https://example.com",
  source: "web",
  status: "failed",
  stage: null,
  op: null,
  progress: null,
  attempts: 1,
  error: null,
  ts: 0,
  durationMs: null,
  live: true,
};

function createTrashFake(outcome: "trashed" | "rejected") {
  const trashed: (readonly string[])[] = [];
  const notices: NotifyOptions[] = [];
  let undone = 0;
  return {
    trashed,
    notices,
    undone: () => undone,
    dependencies: {
      trash: async (ids: readonly string[]) => {
        trashed.push(ids);
        if (outcome === "rejected") throw new Error("Disk unavailable");
        return { changed: ids.length, undoId: null };
      },
      notify: (options: NotifyOptions) => {
        notices.push(options);
        return options.id;
      },
      undo: async () => {
        undone += 1;
        return { ok: true };
      },
    },
  };
}

afterEach(() => downloadsSelection.clear());

it("moves downloads to Trash immediately and offers Undo", async () => {
  const fake = createTrashFake("trashed");
  downloadsSelection.set([row]);

  await trashDownloadRows([row], fake.dependencies);

  expect(fake.trashed).toEqual([["save-1"]]);
  await vi.waitFor(() => expect(downloadsSelection.size()).toBe(0));
  expect(fake.notices).toEqual([
    expect.objectContaining({
      title: "Moved download to Trash",
      action: expect.objectContaining({ label: "Undo" }),
    }),
  ]);

  fake.notices[0]?.action?.onClick();
  expect(fake.undone()).toBe(1);
});

it("does not offer Undo when no downloads changed", async () => {
  const fake = createTrashFake("trashed");
  fake.dependencies.trash = async (ids: readonly string[]) => {
    fake.trashed.push(ids);
    return { changed: 0, undoId: null };
  };
  downloadsSelection.set([row]);

  await trashDownloadRows([row], fake.dependencies);

  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(downloadsSelection.size()).toBe(1);
  expect(fake.notices).toEqual([]);
});

it("handles a rejected Undo request", async () => {
  const fake = createTrashFake("trashed");
  fake.dependencies.undo = async () => {
    throw new Error("Undo unavailable");
  };

  await trashDownloadRows([row], fake.dependencies);
  await vi.waitFor(() => expect(fake.notices).toHaveLength(1));
  fake.notices[0]?.action?.onClick();

  await new Promise((resolve) => setTimeout(resolve, 0));
});

it("reloads hidden downloads after Undo restores them", async () => {
  const notices: NotifyOptions[] = [];
  const events: string[] = [];

  await expect(
    clearUnfinishedDownloads({
      clear: async () => ({ changed: 2, ids: ["loaded", "hidden"] }),
      invalidate: () => events.push("invalidate"),
      reconcile: () => events.push("reconcile"),
      reload: async () => {
        events.push("reload");
      },
      notify: (options) => {
        notices.push(options);
        return options.id;
      },
      undo: async () => ({ ok: true }),
    }),
  ).resolves.toBe(true);
  notices[0]?.action?.onClick();

  await vi.waitFor(() =>
    expect(events).toEqual(["invalidate", "reconcile", "invalidate", "reload"]),
  );
});

it("keeps the selection and skips the Undo notice when Trash fails", async () => {
  const fake = createTrashFake("rejected");
  downloadsSelection.set([row]);

  await trashDownloadRows([row], fake.dependencies);

  expect(fake.trashed).toEqual([["save-1"]]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(downloadsSelection.size()).toBe(1);
  expect(fake.notices).toEqual([]);
});
