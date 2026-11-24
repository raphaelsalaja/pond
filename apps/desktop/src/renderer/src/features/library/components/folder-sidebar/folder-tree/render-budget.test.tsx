import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { folders } from "@/features/library/state/folders";
import { recordRenders } from "@/shared/test/render-count";
import {
  createFolderSidebarHarness,
  folder,
  folderList,
} from "../test-harness";

const harness = createFolderSidebarHarness();

beforeEach(() => harness.setup());
afterEach(() => harness.cleanup());

it("re-renders only the two rows that swap places when you open another folder", async () => {
  folderList.current = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"].map(
    (name) => folder(name),
  );
  await folders.refresh();
  await harness.mount();
  await act(async () => harness.button("Alpha").click());

  const renders = recordRenders();
  await act(async () => harness.button("Delta").click());

  expect(Object.keys(renders.byKey("FolderTreeRowInner")).sort()).toEqual([
    "Alpha",
    "Delta",
  ]);
});
