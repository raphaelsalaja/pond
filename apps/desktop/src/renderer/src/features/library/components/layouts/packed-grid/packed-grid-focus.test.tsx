import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { resultNavigation, selection } from "@/features/saves/navigation";
import { PackedGrid } from ".";

afterEach(() => {
  selection.clear();
  resultNavigation.setSource({ key: "empty", ids: [] });
});

it("repairs a removed result cursor when focus enters the new collection", async () => {
  selection.setCursor("removed");
  const host = document.createElement("div");
  host.style.overflowY = "auto";
  Object.defineProperties(host, {
    offsetHeight: { value: 600 },
    offsetWidth: { value: 600 },
  });
  host.scrollTo = () => {};
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(() =>
      root.render(
        <PackedGrid
          layout="grid"
          totalHeight={100}
          items={[
            {
              id: "available",
              left: 0,
              top: 0,
              width: 100,
              height: 100,
              mediaHeight: 100,
            },
          ]}
          renderItem={(item) => (
            <span
              key={item.id}
              id={`save-option-${item.id}`}
              role="option"
              tabIndex={-1}
              aria-selected={false}
            >
              {item.id}
            </span>
          )}
        />,
      ),
    );
    const collection = host.querySelector<HTMLElement>(
      "[data-save-collection]",
    );
    if (!collection) throw new Error("Missing collection");
    await act(() => collection.focus());
    expect(collection.getAttribute("aria-activedescendant")).toBe(
      "save-option-available",
    );
    expect(selection.getCursor()).toBe("available");
  } finally {
    await act(() => root.unmount());
    host.remove();
  }
});

it("keeps a virtual cursor mounted and reveals it on focus return without changing selection", async () => {
  const items = Array.from({ length: 100 }, (_, index) => ({
    id: String(index),
    left: 0,
    top: index * 100,
    width: 100,
    height: 100,
    mediaHeight: 100,
  }));
  resultNavigation.setSource({
    key: "focus-return",
    ids: items.map((item) => item.id),
  });
  selection.set(["0", "90"]);
  selection.setCursor("90");
  const host = document.createElement("div");
  host.style.overflowY = "auto";
  Object.defineProperties(host, {
    offsetHeight: { value: 600 },
    offsetWidth: { value: 600 },
    clientHeight: { value: 600 },
  });
  host.scrollTo = () => {};
  document.body.append(host);
  const root = createRoot(host);
  let pageRequests = 0;
  try {
    await act(() =>
      root.render(
        <PackedGrid
          layout="grid"
          totalHeight={10000}
          items={items}
          onEndReached={() => {
            pageRequests++;
          }}
          renderItem={(item) => (
            <span
              key={item.id}
              id={`save-option-${item.id}`}
              role="option"
              tabIndex={-1}
              aria-selected={selection.has(item.id)}
            >
              {item.id}
            </span>
          )}
        />,
      ),
    );
    const collection = host.querySelector<HTMLElement>(
      "[data-save-collection]",
    );
    if (!collection) throw new Error("Missing collection");
    expect(document.getElementById("save-option-90")).not.toBeNull();
    expect(pageRequests).toBe(0);
    await act(() => collection.focus());
    expect(host.scrollTop).toBeGreaterThan(0);
    const other = document.createElement("button");
    host.append(other);
    other.focus();
    host.scrollTop = 0;
    await act(() => collection.focus());
    expect(host.scrollTop).toBeGreaterThan(0);
    expect(selection.snapshot()).toEqual(["0", "90"]);
    expect(selection.getCursor()).toBe("90");
    expect(document.activeElement).toBe(collection);
  } finally {
    await act(() => root.unmount());
    host.remove();
  }
});

it("keeps the scroll position when focus returns after the cursor save leaves", async () => {
  const items = Array.from({ length: 40 }, (_, index) => ({
    id: String(index),
    left: 0,
    top: index * 100,
    width: 100,
    height: 100,
    mediaHeight: 100,
  }));
  selection.setCursor("25");
  const host = document.createElement("div");
  host.style.overflowY = "auto";
  Object.defineProperties(host, {
    offsetHeight: { value: 600 },
    offsetWidth: { value: 600 },
    clientHeight: { value: 600 },
    clientWidth: { value: 600 },
  });
  host.scrollTo = () => {};
  document.body.append(host);
  const root = createRoot(host);
  const render = (rows: typeof items) =>
    root.render(
      <PackedGrid
        layout="grid"
        totalHeight={4000}
        items={rows}
        renderItem={(item) => (
          <span
            key={item.id}
            id={`save-option-${item.id}`}
            role="option"
            tabIndex={-1}
            aria-selected={false}
          >
            {item.id}
          </span>
        )}
      />,
    );
  try {
    await act(() => render(items));
    await act(() => render(items.filter((item) => item.id !== "25")));
    host.scrollTop = 2500;
    const collection = host.querySelector<HTMLElement>(
      "[data-save-collection]",
    );
    if (!collection) throw new Error("Missing collection");
    await act(() => collection.focus());
    expect(host.scrollTop).toBe(2500);
    expect(selection.getCursor()).not.toBe("0");
  } finally {
    await act(() => root.unmount());
    host.remove();
  }
});

it("moves the cursor without re-rendering mounted cards", async () => {
  const items = ["a", "b"].map((id, index) => ({
    id,
    left: index * 100,
    top: 0,
    width: 100,
    height: 100,
    mediaHeight: 100,
  }));
  selection.setCursor("a");
  const host = document.createElement("div");
  host.style.overflowY = "auto";
  Object.defineProperties(host, {
    offsetHeight: { value: 600 },
    offsetWidth: { value: 600 },
  });
  host.scrollTo = () => {};
  document.body.append(host);
  const root = createRoot(host);
  let renders = 0;
  const renderItem = (item: (typeof items)[number]) => {
    renders++;
    return (
      <span
        key={item.id}
        id={`save-option-${item.id}`}
        role="option"
        tabIndex={-1}
        aria-selected={false}
      >
        {item.id}
      </span>
    );
  };
  try {
    await act(() =>
      root.render(
        <PackedGrid
          layout="grid"
          totalHeight={100}
          items={items}
          renderItem={renderItem}
        />,
      ),
    );
    const before = renders;
    await act(() => selection.setCursor("b"));
    expect(
      host
        .querySelector("[data-save-collection]")
        ?.getAttribute("aria-activedescendant"),
    ).toBe("save-option-b");
    expect(renders).toBe(before);
  } finally {
    await act(() => root.unmount());
    host.remove();
  }
});
