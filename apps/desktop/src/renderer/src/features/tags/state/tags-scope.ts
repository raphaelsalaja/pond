import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

/** A built-in collection, or a tag group ID. */
export type TagsScope = "all" | "ungrouped" | "starred" | (string & {});

const store = new Store<{ scope: TagsScope }>({ scope: "all" });

export const tagsScope = {
  set(scope: TagsScope): void {
    store.setState((s) => (s.scope === scope ? s : { scope }));
  },
};

export function useTagsScope(): TagsScope {
  return useSelector(store, (s) => s.scope);
}
