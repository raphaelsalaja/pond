import { orderIds, pairKey } from "../types";
import type { Found, LibrarySave } from "../types";

export interface NeighborStore {
  neighbors(
    vector: Array<number>,
    limit: number,
  ): Array<{ id: string; distance: number }>;
}

const SEMANTIC_DISTANCE = 0.04;

/** Saves whose embeddings sit almost on top of each other. Meaning alone never makes Saves mergeable. */
export function semanticMatches(
  saves: ReadonlyArray<LibrarySave>,
  store: NeighborStore,
  options: {
    model: string;
    maximumDistance?: number;
    neighborsPerSave?: number;
    scope?: ReadonlySet<string>;
  },
): Array<Found> {
  const maximumDistance = Math.max(
    0,
    options.maximumDistance ?? SEMANTIC_DISTANCE,
  );
  const limit = Math.max(2, Math.floor(options.neighborsPerSave ?? 9));
  const eligible = new Map<string, Array<number>>();
  for (const save of saves) {
    if (save.clip) {
      eligible.set(save.id, save.clip);
    }
  }

  const nearest = new Map<string, Found>();
  const sources = [...eligible]
    .filter(([id]) => !options.scope || options.scope.has(id))
    .sort(([left], [right]) => left.localeCompare(right));
  for (const [id, vector] of sources) {
    for (const neighbor of store.neighbors(vector, limit)) {
      if (
        neighbor.id === id ||
        !eligible.has(neighbor.id) ||
        !Number.isFinite(neighbor.distance) ||
        neighbor.distance < 0 ||
        neighbor.distance > maximumDistance
      ) {
        continue;
      }
      const key = pairKey(id, neighbor.id);
      const current = nearest.get(key);
      if (
        current?.save?.matcher === "semantic" &&
        current.save.distance <= neighbor.distance
      ) {
        continue;
      }
      nearest.set(key, {
        ids: orderIds(id, neighbor.id),
        save: {
          matcher: "semantic",
          model: options.model,
          distance: neighbor.distance,
        },
      });
    }
  }
  return [...nearest.values()];
}
