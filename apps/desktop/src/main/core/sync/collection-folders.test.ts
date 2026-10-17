import type { Folder, SourceSyncPrefs } from "@pond/schema/db";
import { sourceLabel } from "@pond/schema/sources";
import { describe, expect, it, vi } from "vitest";
import {
  type CollectionFolderStore,
  fileCollectionSaves,
} from "./collection-folders";

function folder(id: string, name: string, parentId: string | null): Folder {
  return {
    id,
    name,
    parentId,
    color: null,
    sortOrder: 0,
    createdAt: new Date(0),
  };
}

function fakeStore(initial: Folder[], saves: Record<string, string>) {
  const folders = [...initial];
  const memberships = new Map<string, string[]>();
  let next = 0;
  const store = {
    listFolders: vi.fn(async () => [...folders]),
    createFolder: vi.fn(async (name: string, parentId: string | null) => {
      const created = folder(`f${++next}`, name, parentId);
      folders.push(created);
      return created;
    }),
    saveIds: vi.fn(
      async (_source: string, sourceIds: string[]) =>
        new Map(
          sourceIds.flatMap((id) => {
            const saveId = saves[id];
            return saveId ? [[id, saveId] as const] : [];
          }),
        ),
    ),
    folderIds: vi.fn(async () => memberships),
    assign: vi.fn(
      async (assignments: Array<{ saveId: string; folderIds: string[] }>) => {
        for (const { saveId, folderIds } of assignments) {
          memberships.set(saveId, folderIds);
        }
      },
    ),
    rememberFolders: vi.fn(async () => {}),
  } satisfies CollectionFolderStore;
  return { store, folders, memberships };
}

const DESIGN = { id: "c1", name: "Design" };
const TYPE = { id: "c2", name: "Type" };

function twitter(sync: Partial<SourceSyncPrefs> = {}) {
  return {
    id: "twitter:1",
    source: "twitter" as const,
    sync: {
      lastSyncedAt: null,
      lastError: null,
      highWaterMark: null,
      lastFullSyncAt: null,
      knownCount: 0,
      runningSince: null,
      importScope: {
        listKinds: ["saved" as const],
        collections: [DESIGN, TYPE],
      },
      ...sync,
    },
  };
}

describe("fileCollectionSaves", () => {
  it("files each save under Source / collection and remembers the Folders", async () => {
    const { store, folders, memberships } = fakeStore([], {
      t1: "s1",
      t2: "s2",
    });
    memberships.set("s1", ["mine"]);

    await expect(
      fileCollectionSaves(
        twitter(),
        [
          { sourceId: "t1", collectionIds: ["c1"] },
          { sourceId: "t2", collectionIds: ["c1", "c2"] },
          { sourceId: "t3", collectionIds: ["c2"] },
        ],
        store,
      ),
    ).resolves.toBe(2);

    const root = folders.find((f) => f.parentId === null);
    expect(root?.name).toBe(sourceLabel("twitter"));
    const design = folders.find((f) => f.name === "Design");
    const type = folders.find((f) => f.name === "Type");
    expect(design?.parentId).toBe(root?.id);
    expect(memberships.get("s1")).toEqual(["mine", design?.id]);
    expect(memberships.get("s2")).toEqual([design?.id, type?.id]);
    expect(store.rememberFolders).toHaveBeenCalledWith("twitter:1", {
      collectionFolders: { c1: design?.id, c2: type?.id },
    });
  });

  it("reuses a remembered Folder after you rename it", async () => {
    const renamed = folder("kept", "Moodboard", "root");
    const { store, memberships } = fakeStore(
      [folder("root", sourceLabel("twitter"), null), renamed],
      { t1: "s1" },
    );

    await fileCollectionSaves(
      twitter({
        importScope: { listKinds: ["saved"], collections: [DESIGN] },
        collectionFolders: { c1: "kept" },
      }),
      [{ sourceId: "t1", collectionIds: ["c1"] }],
      store,
    );

    expect(store.createFolder).not.toHaveBeenCalled();
    expect(store.rememberFolders).not.toHaveBeenCalled();
    expect(memberships.get("s1")).toEqual(["kept"]);
  });

  it("leaves Folders alone when Add to Folders is off", async () => {
    const { store } = fakeStore([], { t1: "s1" });

    await expect(
      fileCollectionSaves(
        twitter({
          importScope: {
            listKinds: ["saved"],
            collections: [DESIGN],
            addToFolders: false,
          },
        }),
        [{ sourceId: "t1", collectionIds: ["c1"] }],
        store,
      ),
    ).resolves.toBe(0);
    expect(store.listFolders).not.toHaveBeenCalled();
  });

  it("skips saves already in their Folder", async () => {
    const { store, memberships } = fakeStore(
      [
        folder("root", sourceLabel("twitter"), null),
        folder("d", "Design", "root"),
      ],
      { t1: "s1" },
    );
    memberships.set("s1", ["d"]);

    await expect(
      fileCollectionSaves(
        twitter({
          importScope: { listKinds: ["saved"], collections: [DESIGN] },
        }),
        [{ sourceId: "t1", collectionIds: ["c1"] }],
        store,
      ),
    ).resolves.toBe(0);
    expect(store.assign).not.toHaveBeenCalled();
  });
});
