import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { LibraryNav } from "@/shared/lib/library-nav";
import { useOrganizationTree } from "./use-organization-tree";

const entries = [
  { id: "a", name: "Alpha", parentId: null },
  { id: "b", name: "Beta", parentId: "a" },
  { id: "c", name: "Charlie", parentId: null },
  { id: "d", name: "Delta", parentId: null },
];
function Fixture({
  removed = [],
  navigation,
  onSelection = () => {},
}: {
  removed?: string[];
  navigation?: LibraryNav;
  onSelection?: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(true);
  const tree = useOrganizationTree(
    entries.filter((entry) => !removed.includes(entry.id)),
    onSelection,
    navigation,
  );
  return (
    <div ref={tree.root} role="tree" aria-label="Folders" aria-multiselectable>
      {entries
        .filter((entry) => open || entry.id !== "b")
        .map((entry) => (
          <button
            type="button"
            key={entry.id}
            {...tree.rowProps(
              entry.id,
              entry.parentId ? 1 : 0,
              entry.id === "a" ? open : undefined,
              () => setOpen((value) => !value),
            )}
          >
            {entry.name}
          </button>
        ))}
    </div>
  );
}
const host = document.createElement("div");
document.body.append(host);
const root = createRoot(host);
afterEach(async () => {
  await act(async () => root.render(null));
});
function row(id: string) {
  const element = host.querySelector<HTMLElement>(`[data-tree-id="${id}"]`);
  if (!element) throw new Error(`Missing row ${id}`);
  return element;
}
async function click(id: string, modifiers: MouseEventInit = {}) {
  await act(async () =>
    row(id).dispatchEvent(
      new MouseEvent("click", { bubbles: true, ...modifiers }),
    ),
  );
}
async function key(id: string, key: string, modifiers: KeyboardEventInit = {}) {
  await act(async () =>
    row(id).dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key,
        ...modifiers,
      }),
    ),
  );
}
const selected = () =>
  [...host.querySelectorAll('[aria-selected="true"]')].map((element) =>
    element.getAttribute("data-tree-id"),
  );
it("keeps the range anchor when reversing while moving a distinct focused cursor", async () => {
  await act(async () => root.render(<Fixture />));
  await click("c");
  await key("c", "ArrowUp", { shiftKey: true });
  expect(selected()).toEqual(["b", "c"]);
  expect(document.activeElement).toBe(row("b"));
  await key("b", "ArrowUp", { shiftKey: true });
  expect(selected()).toEqual(["a", "b", "c"]);
  await key("a", "ArrowDown", { shiftKey: true });
  expect(selected()).toEqual(["b", "c"]);
  expect(host.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
});
it("toggles disconnected rows and preserves their context selection", async () => {
  await act(async () => root.render(<Fixture />));
  await click("a");
  await click("d", { metaKey: true });
  await act(async () =>
    row("a").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true })),
  );
  expect(selected()).toEqual(["a", "d"]);
  await key("d", " ");
  expect(selected()).toEqual(["a"]);
});
it("opens a context menu on an unselected row without selecting it", async () => {
  const onSelection = vi.fn();
  await act(async () => root.render(<Fixture onSelection={onSelection} />));
  await click("a");
  onSelection.mockClear();
  await act(async () =>
    row("c").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true })),
  );
  expect(selected()).toEqual(["a"]);
  expect(onSelection).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(row("c"));
});
it("clears the selection when navigation moves elsewhere", async () => {
  let navigation: LibraryNav = { kind: "all" };
  const onSelection = (ids: string[]) => {
    navigation = { kind: "folder", id: ids.join(",") };
  };
  const render = () =>
    act(async () =>
      root.render(
        <Fixture navigation={navigation} onSelection={onSelection} />,
      ),
    );
  await render();
  await click("a");
  await render();
  expect(selected()).toEqual(["a"]);
  navigation = { kind: "trash" };
  await render();
  expect(selected()).toEqual([]);
});
it("collapses and expands branches, finds a parent, and supports end and typeahead", async () => {
  await act(async () => root.render(<Fixture />));
  await key("b", "ArrowLeft");
  expect(document.activeElement).toBe(row("a"));
  await key("a", "ArrowLeft");
  expect(host.querySelector('[data-tree-id="b"]')).toBeNull();
  await key("a", "ArrowRight");
  expect(row("b")).toBeDefined();
  await key("a", "End");
  expect(document.activeElement).toBe(row("d"));
  await key("d", "b");
  expect(document.activeElement).toBe(row("b"));
});

it("prunes deleted selected entries before a later toggle", async () => {
  await act(async () => root.render(<Fixture />));
  await click("a");
  await click("c", { metaKey: true });
  await act(async () => root.render(<Fixture removed={["a"]} />));
  await click("d", { metaKey: true });
  expect(selected()).toEqual(["c", "d"]);
});
