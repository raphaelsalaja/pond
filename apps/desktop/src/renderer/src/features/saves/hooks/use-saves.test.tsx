import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { pagingStore } from "@/features/saves/state/bootstrap";
import { useSavePaging } from "./use-saves";

const initial = pagingStore.state;

afterEach(() => {
  pagingStore.setState(() => initial);
});

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
