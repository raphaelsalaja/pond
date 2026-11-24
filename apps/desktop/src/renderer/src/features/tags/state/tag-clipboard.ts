import { Store } from "@tanstack/store";

interface TagClipboardState {
  readonly tags: ReadonlyArray<string>;
}

const store = new Store<TagClipboardState>({ tags: [] });

export const tagClipboard = {
  get(): ReadonlyArray<string> {
    return store.state.tags;
  },
  set(next: ReadonlyArray<string>): void {
    const cleaned = Array.from(
      new Set(
        next.flatMap((t) => {
          const trimmed = t.trim();
          return trimmed ? [trimmed] : [];
        }),
      ),
    );
    store.setState(() => ({ tags: cleaned }));
  },
  clear(): void {
    store.setState((s) => (s.tags.length === 0 ? s : { tags: [] }));
  },
};

export function mergeUniqueTags(
  current: ReadonlyArray<string>,
  incoming: ReadonlyArray<string>,
): Array<string> {
  const seen = new Set(current.map((t) => t.toLowerCase()));
  const next = [...current];
  for (const raw of incoming) {
    const t = raw.trim();
    if (!t) {
      continue;
    }
    const key = t.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(t);
  }
  return next;
}
