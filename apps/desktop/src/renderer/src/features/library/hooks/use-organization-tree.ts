import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { LibraryNav } from "@/shared/lib/library-nav";

interface TreeEntry {
  id: string;
  name: string;
  parentId: string | null;
}

/**
 * A change to `navigation` that this tree's own selection didn't cause
 * clears the selection.
 *
 * `orderedIds` (optional) is the row ids in display order. When provided
 * (the virtualized folder tree) row ordering, keyboard navigation, and
 * range selection come from this list instead of the mounted DOM, so they
 * work across rows that are not currently mounted; the consumer must keep
 * the cursor's row mounted so focus can land on it. When omitted, row
 * ordering comes from the mounted `[role="treeitem"]` elements (fully
 * rendered lists).
 */
export function useOrganizationTree(
  entries: readonly TreeEntry[],
  onSelection: (ids: string[]) => void,
  navigation?: LibraryNav | null,
  orderedIds?: readonly string[],
) {
  const dataDriven = orderedIds !== undefined;
  const { byId, positions } = useMemo(() => {
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    const siblings = new Map<string | null, string[]>();
    for (const entry of entries) {
      const ids = siblings.get(entry.parentId) ?? [];
      ids.push(entry.id);
      siblings.set(entry.parentId, ids);
    }
    const positions = new Map<string, { size: number; position: number }>();
    for (const ids of siblings.values())
      ids.forEach((id, index) => {
        positions.set(id, { size: ids.length, position: index + 1 });
      });
    return { byId, positions };
  }, [entries]);
  const root = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const hadFocus = useRef(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const selecting = useRef(false);
  const anchor = useRef<string | null>(null);
  const commit = (ids: string[]) => {
    selecting.current = true;
    setSelected(ids);
    onSelection(ids);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: `navigation` is the reset trigger.
  useEffect(() => {
    if (selecting.current) {
      selecting.current = false;
      return;
    }
    anchor.current = null;
    setSelected((current) => (current.length ? [] : current));
  }, [navigation]);
  const rowElement = (id: string) =>
    root.current?.querySelector<HTMLElement>(`[data-tree-id="${id}"]`) ?? null;
  useLayoutEffect(() => {
    const retained = selected.filter((id) => byId.has(id));
    if (retained.length !== selected.length) commit(retained);
    const rows = visibleRows();
    const ids = rowIds();
    if (!cursor || !ids.includes(cursor)) {
      const parentId = cursor ? byId.get(cursor)?.parentId : null;
      const next =
        (parentId && ids.includes(parentId) ? parentId : null) ??
        ids[0] ??
        null;
      if (cursor !== next) {
        setCursor(next);
        if (
          hadFocus.current &&
          (document.activeElement === document.body ||
            document.activeElement?.closest("[inert]"))
        ) {
          if (dataDriven) {
            // The row may not be mounted yet; the consumer keeps the
            // cursor's row mounted and the focus block below lands focus
            // after render.
            pendingFocus.current = next;
          } else if (next !== null) {
            rows.find((row) => row.dataset.treeId === next)?.focus();
          }
        }
      }
    }
    if (pendingFocus.current) {
      if (pendingFocus.current === cursor) {
        const element = rowElement(pendingFocus.current);
        if (element && !element.closest("[inert]")) {
          element.focus();
          element.scrollIntoView?.({ block: "nearest" });
          pendingFocus.current = null;
        }
      } else if (!ids.includes(pendingFocus.current)) {
        // The cursor moved on; the pending row is gone. A pending id that
        // is still in the list was just scheduled for the upcoming cursor
        // commit, so it stays.
        pendingFocus.current = null;
      }
    }
  });
  const typeahead = useRef({ text: "", time: 0 });
  const visibleRows = () =>
    [
      ...(root.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ??
        []),
    ].filter((row) => !row.closest("[inert]"));
  /** Row ids in display order: the provided data list, or the mounted rows. */
  const rowIds = () =>
    orderedIds !== undefined
      ? [...orderedIds]
      : visibleRows()
          .map((row) => row.dataset.treeId)
          .filter((id): id is string => !!id);
  const select = (
    id: string,
    modifiers: {
      shiftKey?: boolean;
      metaKey?: boolean;
      ctrlKey?: boolean;
    } = {},
  ) => {
    const ordered = rowIds();
    let next: string[];
    if (
      modifiers.shiftKey &&
      anchor.current &&
      ordered.includes(anchor.current)
    ) {
      const from = ordered.indexOf(anchor.current);
      const to = ordered.indexOf(id);
      const range = ordered.slice(Math.min(from, to), Math.max(from, to) + 1);
      next =
        modifiers.metaKey || modifiers.ctrlKey
          ? [...new Set([...selected, ...range])]
          : range;
    } else if (modifiers.metaKey || modifiers.ctrlKey) {
      next = selected.includes(id)
        ? selected.filter((value) => value !== id)
        : [...selected, id];
      anchor.current = id;
    } else {
      next = [id];
      anchor.current = id;
    }
    setCursor(id);
    commit(next);
  };
  function keyDown(
    event: React.KeyboardEvent,
    id: string,
    expanded: boolean | undefined,
    toggle?: () => void,
  ) {
    if (event.nativeEvent.isComposing || event.target !== event.currentTarget)
      return;
    const rows = visibleRows();
    const ids = rowIds();
    const index = dataDriven
      ? ids.indexOf(id)
      : rows.findIndex((row) => row.dataset.treeId === id);
    let nextId: string | undefined;
    if (event.key.toLowerCase() === "a" && (event.metaKey || event.ctrlKey)) {
      commit(ids);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        nextId = ids[Math.min(index + 1, ids.length - 1)];
        break;
      case "ArrowUp":
        nextId = ids[Math.max(index - 1, 0)];
        break;
      case "Home":
        nextId = ids[0];
        break;
      case "End":
        nextId = ids.at(-1);
        break;
      case "ArrowRight":
        if (expanded === false) toggle?.();
        else if (expanded) {
          const child = ids[index + 1];
          if (byId.get(child ?? "")?.parentId === id) nextId = child;
        }
        break;
      case "ArrowLeft":
        if (expanded) toggle?.();
        else {
          const parentId = byId.get(id)?.parentId ?? undefined;
          nextId = parentId && ids.includes(parentId) ? parentId : undefined;
        }
        break;
      case " ":
        select(id, event.shiftKey ? event : { ctrlKey: true });
        break;
      case "Enter":
        select(id);
        break;
      case "Escape":
        anchor.current = null;
        commit([]);
        break;
      default: {
        if (
          event.key.length !== 1 ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey
        )
          return;
        const now = Date.now();
        const text =
          (now - typeahead.current.time < 700 ? typeahead.current.text : "") +
          event.key.toLocaleLowerCase();
        typeahead.current = { text, time: now };
        const ordered = [...ids.slice(index + 1), ...ids.slice(0, index + 1)];
        nextId = ordered.find((candidate) =>
          byId.get(candidate)?.name.toLocaleLowerCase().startsWith(text),
        );
      }
    }
    event.preventDefault();
    event.stopPropagation();
    if (nextId) {
      setCursor(nextId);
      if (dataDriven) {
        // The next row may be outside the mounted window; the consumer
        // keeps it mounted and the layout effect lands focus after render.
        pendingFocus.current = nextId;
      } else {
        const next = rows.find((row) => row.dataset.treeId === nextId);
        next?.focus();
        next?.scrollIntoView?.({ block: "nearest" });
      }
      if (event.shiftKey) {
        if (!anchor.current || !byId.has(anchor.current)) anchor.current = id;
        select(nextId, event);
      }
    }
  }
  return {
    root,
    selected,
    select,
    cursor,
    rowProps(
      id: string,
      depth: number,
      expanded?: boolean,
      toggle?: () => void,
    ) {
      const entry = byId.get(id);
      const position = positions.get(id);
      return {
        role: "treeitem" as const,
        "data-tree-id": id,
        "aria-label": entry?.name,
        "aria-level": depth + 1,
        "aria-setsize": position?.size,
        "aria-posinset": position?.position,
        "aria-expanded": expanded,
        "aria-selected": selected.includes(id),
        tabIndex:
          (cursor ??
            (dataDriven ? orderedIds?.[0] : undefined) ??
            entries[0]?.id) === id
            ? 0
            : -1,
        onFocus: () => {
          hadFocus.current = true;
          setCursor(id);
        },
        onBlur: (event: React.FocusEvent) => {
          if (
            event.relatedTarget instanceof HTMLElement &&
            !root.current?.contains(event.relatedTarget)
          )
            hadFocus.current = false;
        },
        onClick: (event: React.MouseEvent) => select(id, event),
        onContextMenu: (event: React.MouseEvent<HTMLElement>) => {
          event.currentTarget.focus();
        },
        onKeyDown: (event: React.KeyboardEvent) =>
          keyDown(event, id, expanded, toggle),
      };
    },
  };
}
