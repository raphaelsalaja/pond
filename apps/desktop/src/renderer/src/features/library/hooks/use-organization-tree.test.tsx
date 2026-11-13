import { act, type ComponentProps, memo, useState } from "react";
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

function VirtualFixture({
  onSelection = () => {},
  expose,
  mounted = ["a", "b"],
}: {
  onSelection?: (ids: string[]) => void;
  expose?: (cursor: string | null, selected: string[]) => void;
  mounted?: string[];
}) {
  const [open, setOpen] = useState(true);
  const tree = useOrganizationTree(
    entries,
    onSelection,
    undefined,
    entries.map((entry) => entry.id),
  );
  expose?.(tree.cursor, tree.selected);
  return (
    <div ref={tree.root} role="tree" aria-label="Folders" aria-multiselectable>
      {entries
        .filter(
          (entry) => (open || entry.id !== "b") && mounted.includes(entry.id),
        )
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

it("navigates and range-selects across unmounted rows using the data list", async () => {
  let cursor: string | null = null;
  let chosen: string[] = [];
  await act(async () =>
    root.render(
      <VirtualFixture
        expose={(c, s) => {
          cursor = c;
          chosen = s;
        }}
      />,
    ),
  );
  await click("a");
  expect(cursor).toBe("a");
  await key("b", "ArrowDown", { shiftKey: true });
  expect(cursor).toBe("c");
  expect(chosen).toEqual(["a", "b", "c"]);
  await key("b", "ArrowDown", { shiftKey: true });
  expect(cursor).toBe("c");
  expect(chosen).toEqual(["a", "b", "c"]);
});

it("selects all rows and typeaheads to unmounted rows from the data list", async () => {
  let cursor: string | null = null;
  let chosen: string[] = [];
  await act(async () =>
    root.render(
      <VirtualFixture
        expose={(c, s) => {
          cursor = c;
          chosen = s;
        }}
      />,
    ),
  );
  await click("a");
  await key("a", "a", { metaKey: true });
  expect(chosen).toEqual(["a", "b", "c", "d"]);
  await key("a", "d");
  expect(cursor).toBe("d");
  expect(
    [...host.querySelectorAll('[tabindex="0"]')].map((el) =>
      el.getAttribute("data-tree-id"),
    ),
  ).toEqual([]);
});

it("keeps focus on the row the consumer mounts for the data-driven cursor", async () => {
  const trackCursor = vi.fn();
  function TrackingFixture() {
    const tree = useOrganizationTree(
      entries,
      () => {},
      undefined,
      entries.map((entry) => entry.id),
    );
    trackCursor(tree.cursor);
    const mounted =
      tree.cursor && tree.cursor !== "a" && tree.cursor !== "b"
        ? ["a", "b", tree.cursor]
        : ["a", "b"];
    return (
      <div
        ref={tree.root}
        role="tree"
        aria-label="Folders"
        aria-multiselectable
      >
        {entries
          .filter((entry) => mounted.includes(entry.id))
          .map((entry) => (
            <button
              type="button"
              key={entry.id}
              {...tree.rowProps(entry.id, entry.parentId ? 1 : 0)}
            >
              {entry.name}
            </button>
          ))}
      </div>
    );
  }
  await act(async () => root.render(<TrackingFixture />));
  await act(async () => row("a").focus());
  await key("a", "End");
  expect(trackCursor).toHaveBeenLastCalledWith("d");
  expect(document.activeElement).toBe(row("d"));
});

const FrozenRow = memo(
  function FrozenRow(props: ComponentProps<"button">) {
    return <button type="button" {...props} />;
  },
  () => true,
);

it("Cmd-click adds to the current selection from a row that never re-rendered", async () => {
  const onSelection = vi.fn();
  function FrozenFixture() {
    const tree = useOrganizationTree(entries, onSelection);
    return (
      <div
        ref={tree.root}
        role="tree"
        aria-label="Folders"
        aria-multiselectable
      >
        {entries.map((entry) => (
          <FrozenRow
            key={entry.id}
            {...tree.rowProps(entry.id, entry.parentId ? 1 : 0)}
          >
            {entry.name}
          </FrozenRow>
        ))}
      </div>
    );
  }
  await act(async () => root.render(<FrozenFixture />));
  await click("c");
  await click("a", { metaKey: true });
  expect(onSelection).toHaveBeenLastCalledWith(["c", "a"]);
});
