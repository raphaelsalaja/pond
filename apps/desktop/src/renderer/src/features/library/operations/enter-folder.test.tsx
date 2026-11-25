import type { Folder } from "@pond/schema/db";
import { act } from "react";
import { beforeEach, expect, it } from "vitest";
import { currentLocation, openLibraryAt } from "@/app/test/library-router";
import { bridge } from "@/shared/test/pond-bridge";
import { folders } from "../state/folders";
import { enterFolder, enterFolders } from "./enter-folder";

function folder(name: string, parentId: string | null = null): Folder {
  return {
    id: name,
    name,
    parentId,
    color: null,
    sortOrder: 0,
    createdAt: new Date(),
  };
}

beforeEach(async () => {
  bridge.use({
    query: {
      "folders.list": () => [
        folder("Alpha"),
        folder("Child", "Alpha"),
        folder("Beta"),
      ],
      "folders.memberships": () => [],
    },
  });
  await folders.refresh();
});

it("opens a deduplicated union of selected folders and descendants", async () => {
  const router = await openLibraryAt("/");
  await act(async () => enterFolders(["Alpha", "Child", "Beta"], true));
  expect(currentLocation(router).pathname).toBe("/");
  expect(currentLocation(router).search).toMatchObject({
    filters: {
      rules: [
        {
          field: "folder",
          operator: "some",
          value: ["Alpha", "Child", "Beta"],
        },
      ],
    },
  });
});

it("excludes descendants when opening selected folders without subfolders", async () => {
  const router = await openLibraryAt("/");
  await act(async () => enterFolders(["Alpha", "Beta"], false));
  expect(currentLocation(router).search).toMatchObject({
    filters: {
      rules: [{ field: "folder", operator: "some", value: ["Alpha", "Beta"] }],
    },
  });
});

it.each(["/sources", "/downloads"])(
  "returns to the Library when entering a folder from %s",
  async (path) => {
    const router = await openLibraryAt(path);
    await act(async () => enterFolder("Alpha"));
    expect(currentLocation(router).pathname).toBe("/folders/Alpha");
    await act(async () => enterFolders([], true));
    expect(currentLocation(router).pathname).toBe("/");
    expect(currentLocation(router).search).toEqual({});
  },
);
