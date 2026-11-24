import { Tooltip } from "@pond/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LibraryGridProvider } from "@/features/saves/components/card/context";
import { primarySelection, selection } from "@/features/saves/navigation";
import { savesStore } from "@/features/saves/pool";
import type { Save } from "@/features/saves/types";
import { recordRenders } from "@/shared/test/render-count";
import { SaveCard } from "./";

const IDS = ["a", "b", "c", "d", "e", "f", "g", "h"];

const SLOT = { width: 200, height: 240, previewHeight: 180, top: 0, left: 0 };

const CALLBACKS = {
  onClick: () => {},
  onAuxClick: () => {},
  onDoubleClick: () => {},
};

function save(id: string): Save {
  return {
    id,
    source: "web",
    sourceId: id,
    url: `https://example.com/${id}`,
    title: id,
    description: null,
    author: null,
    notes: null,
    mediaUrl: null,
    mediaType: null,
    files: [],
    tags: [],
    savedAt: 1,
    createdAt: 1,
    deletedAt: null,
    status: "complete",
    tasks: [],
  };
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  for (const name of ["ResizeObserver", "IntersectionObserver"]) {
    vi.stubGlobal(
      name,
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
        takeRecords() {
          return [];
        }
      },
    );
  }
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  const saves = IDS.map(save);
  savesStore.setState((state) => ({
    ...state,
    byId: new Map(saves.map((entry) => [entry.id, entry])),
    sorted: saves,
    revision: state.revision + 1,
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  selection.clear();
  primarySelection.set(null);
  vi.unstubAllGlobals();
});

function select(id: string) {
  selection.set([id]);
  selection.setCursor(id);
  primarySelection.set(id);
}

it("re-renders only the cards that gain or lose selection", async () => {
  const client = new QueryClient();
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Tooltip.Provider>
          <LibraryGridProvider callbacks={CALLBACKS} multiSelectActive={false}>
            {IDS.map((id, index) => (
              <SaveCard
                key={id}
                id={id}
                view="grid"
                slot={SLOT}
                position={index + 1}
                total={IDS.length}
              />
            ))}
          </LibraryGridProvider>
        </Tooltip.Provider>
      </QueryClientProvider>,
    ),
  );
  await act(async () => select("b"));

  const renders = recordRenders();
  await act(async () => select("f"));

  expect(Object.keys(renders.byKey("SaveCard")).sort()).toEqual(["b", "f"]);
  expect(renders.count("SaveCardBody")).toBe(0);
});
