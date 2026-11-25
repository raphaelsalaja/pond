import { Tooltip } from "@pond/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { LibraryGridProvider } from "@/features/saves/components/card/context";
import { savesStore } from "@/features/saves/pool";
import type { Save } from "@/features/saves/types";
import { recordRenders } from "@/shared/test/render-count";
import { SavePackedGrid } from ".";
import type { PackedItem } from ".";

const COUNT = 400;
const ROW = 100;
const IDS = Array.from({ length: COUNT }, (_, i) => `s${i}`);
const ITEMS: Array<PackedItem> = IDS.map((id, i) => ({
  id,
  top: Math.floor(i / 4) * ROW,
  left: (i % 4) * 100,
  width: 100,
  height: ROW,
  mediaHeight: ROW - 20,
}));

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
  const saves = IDS.map(save);
  savesStore.setState((state) => ({
    ...state,
    byId: new Map(saves.map((entry) => [entry.id, entry])),
    sorted: saves,
    revision: state.revision + 1,
  }));
  host = document.createElement("div");
  host.style.height = "600px";
  host.style.width = "400px";
  host.style.overflowY = "auto";
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

function settleFrames(): Promise<void> {
  return act(async () => {
    for (let i = 0; i < 3; i++) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    }
  });
}

function mountedIds(): Set<string> {
  return new Set(
    [...host.querySelectorAll("[data-save-id]")].flatMap((node) => {
      const id = node.getAttribute("data-save-id");
      return id ? [id] : [];
    }),
  );
}

it("renders only newly mounted cards when scrolling moves the visible bands", async () => {
  const client = new QueryClient();
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Tooltip.Provider>
          <LibraryGridProvider callbacks={CALLBACKS} multiSelectActive={false}>
            <SavePackedGrid
              layout="grid"
              items={ITEMS}
              totalHeight={(COUNT / 4) * ROW}
            />
          </LibraryGridProvider>
        </Tooltip.Provider>
      </QueryClientProvider>,
    ),
  );
  await settleFrames();
  const before = mountedIds();
  expect(before.size).toBeGreaterThan(0);

  const renders = recordRenders();
  await act(async () => {
    host.scrollTop = 1200;
    host.dispatchEvent(new Event("scroll"));
  });
  await settleFrames();
  const after = mountedIds();
  const kept = [...after].filter((id) => before.has(id));
  expect(kept.length).toBeGreaterThan(0);

  const rendered = Object.keys(renders.byKey("SaveCard"));
  expect(rendered.length).toBeGreaterThan(0);
  expect(rendered.filter((id) => kept.includes(id))).toEqual([]);
});
