import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  createFolderSidebarHarness,
  folder,
  folderList,
} from "../components/folder-sidebar/test-harness";
import { folders } from "../state/folders";
import { enterFolder, enterFolders } from "./enter-folder";

const harness = createFolderSidebarHarness();
beforeEach(async () => {
  await harness.setup();
  folderList.current = [
    folder("Alpha"),
    folder("Child", "Alpha"),
    folder("Beta"),
  ];
  await folders.refresh();
});
afterEach(() => harness.cleanup());

it("opens a deduplicated union of selected folders and descendants", async () => {
  const router = await harness.mount("/");
  await act(async () => enterFolders(["Alpha", "Child", "Beta"], true));
  expect(router.state.location.pathname).toBe("/");
  expect(router.state.location.search).toMatchObject({
    filters: {
      rules: [
        { field: "folder", operator: "some", value: ["Alpha", "Child", "Beta"] },
      ],
    },
  });
});

it("excludes descendants when opening selected folders without subfolders", async () => {
  const router = await harness.mount("/");
  await act(async () => enterFolders(["Alpha", "Beta"], false));
  expect(router.state.location.search).toMatchObject({
    filters: {
      rules: [{ field: "folder", operator: "some", value: ["Alpha", "Beta"] }],
    },
  });
});

it.each(["/sources", "/downloads"])(
  "returns to the Library when entering a folder from %s",
  async (path) => {
    const router = await harness.mount(path);
    await act(async () => enterFolder("Alpha"));
    expect(router.state.location.pathname).toBe("/folders/Alpha");
    await act(async () => enterFolders([], true));
    expect(router.state.location.pathname).toBe("/");
    expect(router.state.location.search).toEqual({});
  },
);
