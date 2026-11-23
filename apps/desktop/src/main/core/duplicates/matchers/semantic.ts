import { type Found, type LibrarySave, orderIds, pairKey } from "../types";

export interface NeighborStore {
  neighbors(
    vector: number[],
    limit: number,
  ): Array<{ id: string; distance: number }>;
}

export const SEMANTIC_DISTANCE = 0.04;

/** Saves whose embeddings sit almost on top of each other. Meaning alone never makes Saves mergeable. */
export function semanticMatches(
  saves: readonly LibrarySave[],
  store: NeighborStore,
  options: {
    model: string;
    maximumDistance?: number;
    neighborsPerSave?: number;
    scope?: ReadonlySet<string>;
  },
): Found[] {
  const maximumDistance = Math.max(
    0,
    options.maximumDistance ?? SEMANTIC_DISTANCE,
  );
  const limit = Math.max(2, Math.floor(options.neighborsPerSave ?? 9));
  const eligible = new Map<string, number[]>();
  for (const save of saves) if (save.clip) eligible.set(save.id, save.clip);

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
      )
        continue;
      const key = pairKey(id, neighbor.id);
      const current = nearest.get(key);
      if (
        current?.save?.matcher === "semantic" &&
        current.save.distance <= neighbor.distance
      )
        continue;
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
