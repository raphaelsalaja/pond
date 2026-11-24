/** Counts component renders per React commit with bippy, the fiber walk React Scan and React DevTools share. */
import {
  type Fiber,
  getDisplayName,
  instrument,
  isCompositeFiber,
  MemoComponentTag,
  traverseRenderedFibers,
} from "bippy";

interface Tally {
  total: Map<string, number>;
  keyed: Map<string, Map<string, number>>;
}

const tallies = new Set<Tally>();

function bump<K>(counts: Map<K, number>, key: K) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/** A custom-compare `memo` holds the list key on its outer fiber, not on the component it wraps. */
function keyOf(fiber: Fiber): string | null {
  if (fiber.key !== null) return fiber.key;
  return fiber.return?.tag === MemoComponentTag ? fiber.return.key : null;
}

instrument({
  name: "pond-render-count",
  onCommitFiberRoot(_rendererId, root) {
    traverseRenderedFibers(root, (fiber, phase) => {
      /** The outer fiber of a custom-compare `memo` renders alongside its inner component; count only the inner one. */
      if (phase === "unmount" || fiber.tag === MemoComponentTag) return;
      if (!isCompositeFiber(fiber) || tallies.size === 0) return;
      const name = getDisplayName(fiber.type);
      if (!name) return;
      const key = keyOf(fiber);
      for (const tally of tallies) {
        bump(tally.total, name);
        if (key === null) continue;
        let keyed = tally.keyed.get(name);
        if (!keyed) {
          keyed = new Map();
          tally.keyed.set(name, keyed);
        }
        bump(keyed, key);
      }
    });
  },
});

export interface RenderRecorder {
  /** Renders of components with this display name, mounts included. */
  count: (name: string) => number;
  /** Renders of a keyed component per React key, for telling list rows apart. */
  byKey: (name: string) => Record<string, number>;
  summary: () => Record<string, number>;
  stop: () => void;
}

/** Records renders from now until `stop`, or until the test ends. */
export function recordRenders(): RenderRecorder {
  const tally: Tally = { total: new Map(), keyed: new Map() };
  tallies.add(tally);
  return {
    count: (name) => tally.total.get(name) ?? 0,
    byKey: (name) => Object.fromEntries(tally.keyed.get(name) ?? []),
    summary: () => Object.fromEntries(tally.total),
    stop: () => {
      tallies.delete(tally);
    },
  };
}

export function resetRenderRecorders(): void {
  tallies.clear();
}
