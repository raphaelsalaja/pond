import type { MenuItemSpec } from "@pond/ui";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";

export interface CommandContext {
  group: string;
  items: () => Array<MenuItemSpec>;
}

const store = new Store<ReadonlyMap<symbol, CommandContext>>(new Map());

/** Offers a page's own actions in the command menu while it's mounted; `null` offers nothing. */
export function useCommandContext(
  group: string,
  items: (() => Array<MenuItemSpec>) | null,
): void {
  const latest = useRef(items);
  useLayoutEffect(() => {
    latest.current = items;
  });
  const active = items !== null;
  useEffect(() => {
    if (!active) return;
    const key = Symbol(group);
    store.setState((current) =>
      new Map(current).set(key, {
        group,
        items: () => latest.current?.() ?? [],
      }),
    );
    return () =>
      store.setState((current) => {
        const next = new Map(current);
        next.delete(key);
        return next;
      });
  }, [group, active]);
}

/** One context per group; when a page mounts the same group twice, the latest wins. */
export function useCommandContexts(): ReadonlyArray<CommandContext> {
  const contexts = useSelector(store, (state) => state);
  return useMemo(
    () => [
      ...new Map(
        [...contexts.values()].map((context) => [context.group, context]),
      ).values(),
    ],
    [contexts],
  );
}
