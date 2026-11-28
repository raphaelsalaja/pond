import { PrefsSchema } from "@pond/schema";
import { RouterContextProvider } from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { openLibraryAt } from "@/app/test/library-router";
import {
  primarySelection,
  resultNavigation,
  selection,
} from "@/features/saves/navigation";
import { pool } from "@/features/saves/pool";
import { libraryViewContext } from "@/features/saves/state/view-context";
import { bridge } from "@/shared/test/pond-bridge";
import { wireSave } from "@/shared/test/wire-save";
import { LibraryView } from ".";

const SAVE_ID = "grid-save";

function page() {
  return {
    ids: [SAVE_ID],
    total: 1,
    revision: 1,
    libraryId: "library",
    nextCursor: null,
  };
}

async function settlePublished(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    if (resultNavigation.indexOf(SAVE_ID) >= 0) return;
  }
  throw new Error("LibraryView did not publish its result navigation");
}

it("clears grid result navigation when the library view unmounts", async () => {
  const row = wireSave({
    id: SAVE_ID,
    title: "Grid reference",
    mediaType: "link",
    url: "https://fixture.test/grid-reference",
  });
  const prefs = PrefsSchema.parse({});
  bridge.use({
    query: {
      "settings.getPrefs": () => prefs,
      "settings.setPrefs": () => ({ ok: true, prefs }),
      "saves.queryPage": () => page(),
      "saves.queryIds": () => ({
        ids: [SAVE_ID],
        revision: 1,
        libraryId: "library",
      }),
      "saves.getMany": () => [row],
    },
  });
  const router = await openLibraryAt("/");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let unmounted = false;
  try {
    await act(async () =>
      root.render(
        <RouterContextProvider router={router}>
          <LibraryView />
        </RouterContextProvider>,
      ),
    );
    await settlePublished();
    expect(resultNavigation.total()).toBe(1);

    await act(async () => root.unmount());
    unmounted = true;
    expect(resultNavigation.indexOf(SAVE_ID)).toBe(-1);
    expect(resultNavigation.total()).toBe(0);
  } finally {
    if (!unmounted) await act(async () => root.unmount());
    host.remove();
    resultNavigation.setSource({ ids: [] });
    libraryViewContext.set([], "library");
    pool.clear();
    selection.clear();
    primarySelection.set(null);
  }
});
