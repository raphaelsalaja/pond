import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { pagingStore } from "@/features/saves/state/bootstrap";
import { useSavePaging } from "./use-saves";

const initial = pagingStore.state;

afterEach(() => {
  pagingStore.setState(() => initial);
});

it("re-renders paging readers only when a field they read changes", async () => {
  let renders = 0;
  function Reader() {
    renders++;
    useSavePaging();
    return null;
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(() => root.render(<Reader />));
    const before = renders;
    await act(() =>
      pagingStore.setState((state) => ({ ...state, ready: !state.ready })),
    );
    expect(renders).toBe(before);
    await act(() =>
      pagingStore.setState((state) => ({ ...state, total: state.total + 1 })),
    );
    expect(renders).toBe(before + 1);
  } finally {
    await act(() => root.unmount());
  }
});
