import { afterEach, expect, it, vi } from "vitest";
import { selection } from "@/features/saves/state/selection";
import { tagClipboard } from "@/features/tags";
import { pool } from "../state/pool";
import { normalise, SavePatchSchema } from "./reconcile";
import {
  addTagsToSelection,
  copyTagsForSelection,
  copyUrlsForSelection,
  pasteTagsForSelection,
  retryFailedSelection,
  trashSelection,
} from "./selection";

const ids = Array.from({ length: 301 }, (_, index) => `save-${index}`);
function seed() {
  const save = normalise(
    SavePatchSchema.parse({ id: ids[0], url: "https://example.com/0" }),
  );
  if (!save) {
    throw new Error("Invalid fixture");
  }
  pool.upsert(save);
}
afterEach(() => {
  pool.clear();
  selection.clear();
  tagClipboard.clear();
  vi.unstubAllGlobals();
});
function hasTitle(detail: unknown): detail is { title: string } {
  return (
    typeof detail === "object" &&
    detail !== null &&
    "title" in detail &&
    typeof detail.title === "string"
  );
}
function notificationTitle(event: Event): string | undefined {
  if (!("detail" in event)) {
    return undefined;
  }
  return hasTitle(event.detail) ? event.detail.title : undefined;
}
it("adds tags and retries using all selected IDs without hydrating the renderer pool", async () => {
  seed();
  const query = vi.fn(async (method: string) =>
    method === "saves.bulkEdit"
      ? { changed: 301 }
      : { ok: true, requeued: 301 },
  );
  vi.stubGlobal("window", { pond: { query } });
  await addTagsToSelection(ids, ["Reviewed"]);
  await retryFailedSelection(ids);
  expect(query.mock.calls).toEqual([
    [
      "saves.bulkEdit",
      { ids, operation: { kind: "tags", tags: ["Reviewed"] } },
    ],
    ["saves.retryFailed", { ids }],
  ]);
  expect(pool.snapshot()).toHaveLength(1);
});
it("confirms a tag copy but lets the pasted tags speak for themselves", async () => {
  const save = normalise(
    SavePatchSchema.parse({
      id: "tagged",
      url: "https://example.com/tagged",
      tags: ["Reviewed"],
    }),
  );
  if (!save) {
    throw new Error("Invalid fixture");
  }
  pool.upsert(save);
  const titles: Array<string | undefined> = [];
  const query = vi.fn(async () => ({ changed: 301 }));
  vi.stubGlobal("window", {
    pond: { query },
    dispatchEvent: (event: Event) => titles.push(notificationTitle(event)),
  });

  await copyTagsForSelection(["tagged"]);
  expect(titles).toEqual(["Tags copied"]);

  await pasteTagsForSelection(ids);
  expect(query).toHaveBeenCalledWith("saves.bulkEdit", {
    ids,
    operation: { kind: "tags", tags: ["Reviewed"] },
  });
  expect(titles).toEqual(["Tags copied"]);
});
it("hydrates cold metadata before copying every selected URL", async () => {
  seed();
  let copied = "";
  const requested: Array<Array<string>> = [];
  vi.stubGlobal("window", {
    pond: {
      query: async (
        method: string,
        input: { ids?: Array<string>; text?: string },
      ) => {
        if (method === "saves.getMany") {
          requested.push(input.ids ?? []);
          return (input.ids ?? []).map((id) => ({
            id,
            url: `https://example.com/${id.slice(5)}`,
          }));
        }
        if (method === "clipboard.writeText") {
          copied = input.text ?? "";
          return { ok: true };
        }
        throw new Error(`Unexpected query ${method}`);
      },
    },
  });
  expect((await copyUrlsForSelection(ids)).ok).toBe(true);
  expect(requested.flat()).toEqual(ids.slice(1));
  expect(copied.split("\n")).toHaveLength(301);
  expect(copied.split("\n").at(-1)).toBe("https://example.com/300");
});
it("keeps the full selection available when a bulk mutation fails", async () => {
  seed();
  selection.set(ids);
  vi.stubGlobal("window", {
    pond: {
      query: async () => {
        throw new Error("Disk unavailable");
      },
    },
  });
  await expect(trashSelection(ids)).rejects.toThrow("Disk unavailable");
  expect(selection.snapshot()).toEqual(ids);
  expect(pool.get("save-0")?.deletedAt).toBeNull();
});
