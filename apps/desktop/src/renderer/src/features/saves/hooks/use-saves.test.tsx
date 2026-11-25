import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { pagingStore } from "@/features/saves/state/bootstrap";
import { savesStore, upsertSave } from "@/features/saves/state/pool";
import type { Save } from "@/features/saves/types";
import { useSavePaging, useSavesById } from "./use-saves";

const initial = pagingStore.state;
const initialSaves = savesStore.state;

afterEach(() => {
  pagingStore.setState(() => initial);
  savesStore.setState(() => initialSaves);
});

function save(id: string, title: string): Save {
  return {
    id,
    source: "web",
    sourceId: id,
    url: `https://example.com/${id}`,
    title,
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
  };
}

function Reader({ onRender }: { onRender: () => void }) {
  onRender();
  useSavePaging();
  return null;
}

it("re-renders paging readers only when a field they read changes", async () => {
  let renders = 0;
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(
        <Reader
          onRender={() => {
            renders++;
          }}
        />,
      );
    });
    const before = renders;
    await act(async () => {
      pagingStore.setState((state) => ({ ...state, ready: !state.ready }));
    });
    expect(renders).toBe(before);
    await act(async () => {
      pagingStore.setState((state) => ({ ...state, total: state.total + 1 }));
    });
    expect(renders).toBe(before + 1);
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});

function SavesReader({
  ids,
  onRender,
}: {
  ids: ReadonlyArray<string>;
  onRender: (titles: Array<string | null>) => void;
}) {
  onRender(useSavesById(ids).map((row) => row.title));
  return null;
}

it("re-renders a reader of some Saves only when one of them changes", async () => {
  upsertSave(save("a", "Alpha"));
  upsertSave(save("b", "Bravo"));
  const seen: Array<Array<string | null>> = [];
  const ids = ["a", "missing"];
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(
        <SavesReader ids={ids} onRender={(titles) => seen.push(titles)} />,
      );
    });
    const before = seen.length;
    await act(async () => {
      upsertSave(save("b", "Bravo renamed"));
    });
    expect(seen.length).toBe(before);
    await act(async () => {
      upsertSave(save("a", "Alpha renamed"));
    });
    expect(seen.at(-1)).toEqual(["Alpha renamed"]);
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});
