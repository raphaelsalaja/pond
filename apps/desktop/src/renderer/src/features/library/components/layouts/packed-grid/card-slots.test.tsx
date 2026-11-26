import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { useCardSlots } from ".";
import type { PackedItem } from ".";

function item(id: string, top: number): PackedItem {
  return { id, top, left: 0, width: 100, height: 80, mediaHeight: 60 };
}

it("keeps a card's slot across re-packs until its geometry changes", async () => {
  const seen: Array<ReadonlyMap<string, unknown>> = [];
  function Reader({ items }: { items: ReadonlyArray<PackedItem> }) {
    seen.push(useCardSlots(items));
    return null;
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(<Reader items={[item("a", 0), item("b", 80)]} />);
    });
    const first = seen.at(-1);
    /** A re-pack after one Save's data changed: new item objects, same geometry. */
    await act(async () => {
      root.render(<Reader items={[item("a", 0), item("b", 80)]} />);
    });
    const repacked = seen.at(-1);
    expect(repacked?.get("a")).toBe(first?.get("a"));
    expect(repacked?.get("b")).toBe(first?.get("b"));
    await act(async () => {
      root.render(<Reader items={[item("a", 0), item("b", 160)]} />);
    });
    const moved = seen.at(-1);
    expect(moved?.get("a")).toBe(first?.get("a"));
    expect(moved?.get("b")).not.toBe(first?.get("b"));
    expect(moved?.get("b")).toMatchObject({ top: 160, previewHeight: 60 });
  } finally {
    await act(async () => {
      root.unmount();
    });
  }
});
