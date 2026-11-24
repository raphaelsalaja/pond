import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

const store = new Store<{ ids: ReadonlySet<string> }>({
  ids: new Set<string>(),
});

const TUMBLE_MS = 340;
const CLEAR_GRACE_MS = 500;

function reduceMotion(): boolean {
  return document.documentElement.getAttribute("data-reduce-motion") === "true";
}

export async function tumbleToTrash(ids: ReadonlyArray<string>): Promise<void> {
  if (ids.length === 0 || reduceMotion()) {
    return;
  }
  store.setState((s) => {
    const next = new Set(s.ids);
    for (const id of ids) {
      next.add(id);
    }
    return { ids: next };
  });
  await new Promise((resolve) => {
    setTimeout(resolve, TUMBLE_MS);
  });
  setTimeout(() => {
    store.setState((s) => {
      const next = new Set(s.ids);
      for (const id of ids) {
        next.delete(id);
      }
      return { ids: next };
    });
  }, CLEAR_GRACE_MS);
}

export function useIsTumbling(id: string): boolean {
  return useSelector(store, (s) => s.ids.has(id));
}
