import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { LibraryNav } from "@/shared/lib/library-nav";

interface TreeEntry {
  id: string;
  name: string;
  parentId: string | null;
}

/** A change to `navigation` that this tree's own selection didn't cause clears the selection. */
export function useOrganizationTree(
  entries: readonly TreeEntry[],
  onSelection: (ids: string[]) => void,
  navigation?: LibraryNav,
) {
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
  useLayoutEffect(() => {
    const retained = selected.filter((id) => byId.has(id));
    if (retained.length !== selected.length) commit(retained);
    const rows = visibleRows();
    if (cursor && rows.some((row) => row.dataset.treeId === cursor)) return;
    const parentId = cursor ? byId.get(cursor)?.parentId : null;
    const fallback =
      rows.find((row) => row.dataset.treeId === parentId) ?? rows[0];
    const next = fallback?.dataset.treeId ?? null;
    if (cursor !== next) {
      setCursor(next);
      if (
        hadFocus.current &&
        (document.activeElement === document.body ||
          document.activeElement?.closest("[inert]"))
      )
        fallback?.focus();
    }
  });
  const typeahead = useRef({ text: "", time: 0 });
  const visibleRows = () =>
    [
      ...(root.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ??
        []),
    ].filter((row) => !row.closest("[inert]"));
  const select = (
    id: string,
    modifiers: {
      shiftKey?: boolean;
      metaKey?: boolean;
      ctrlKey?: boolean;
    } = {},
  ) => {
    const ordered = visibleRows()
      .map((row) => row.dataset.treeId)
      .filter((id): id is string => !!id);
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
    const index = rows.findIndex((row) => row.dataset.treeId === id);
    let next: HTMLElement | undefined;
    if (event.key.toLowerCase() === "a" && (event.metaKey || event.ctrlKey)) {
      const ids = rows.flatMap((row) =>
        row.dataset.treeId ? [row.dataset.treeId] : [],
      );
      commit(ids);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        next = rows[Math.min(index + 1, rows.length - 1)];
        break;
      case "ArrowUp":
        next = rows[Math.max(index - 1, 0)];
        break;
      case "Home":
        next = rows[0];
        break;
      case "End":
        next = rows.at(-1);
        break;
      case "ArrowRight":
        if (expanded === false) toggle?.();
        else if (expanded) {
          const child = rows[index + 1];
          if (byId.get(child?.dataset.treeId ?? "")?.parentId === id)
            next = child;
        }
        break;
      case "ArrowLeft":
        if (expanded) toggle?.();
        else
          next = rows.find(
            (row) => row.dataset.treeId === byId.get(id)?.parentId,
          );
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
        const ordered = [...rows.slice(index + 1), ...rows.slice(0, index + 1)];
        next = ordered.find((row) =>
          byId
            .get(row.dataset.treeId ?? "")
            ?.name.toLocaleLowerCase()
            .startsWith(text),
        );
      }
    }
    event.preventDefault();
    event.stopPropagation();
    const nextId = next?.dataset.treeId;
    if (next && nextId) {
      setCursor(nextId);
      next.focus();
      next.scrollIntoView?.({ block: "nearest" });
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
        tabIndex: (cursor ?? entries[0]?.id) === id ? 0 : -1,
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
