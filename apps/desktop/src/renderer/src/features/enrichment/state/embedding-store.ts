import { Store } from "@tanstack/store";
import log from "electron-log/renderer";
import { z } from "zod";

interface EmbeddingEntry {
  vec: Float32Array;
  model: string;
}

interface EmbeddingState {
  readonly byId: Map<string, EmbeddingEntry>;
}

const store = new Store<EmbeddingState>({
  byId: new Map(),
});

const OneRowSchema = z.object({
  id: z.string(),
  embedding: z.array(z.number()).nullable().catch(null),
  embeddingModel: z.string().nullable().catch(null),
});

export async function embeddingFor(
  id: string,
): Promise<EmbeddingEntry | undefined> {
  const cached = store.state.byId.get(id);
  if (cached) {
    return cached;
  }
  const row = OneRowSchema.parse(
    await window.pond.query("saves.getEmbedding", { id }),
  );
  if (!row.embedding || !row.embeddingModel) {
    return undefined;
  }
  const entry = {
    vec: Float32Array.from(row.embedding),
    model: row.embeddingModel,
  };
  store.setState((s) => {
    const byId = new Map(s.byId);
    byId.set(id, entry);
    return { byId };
  });
  return entry;
}

export function setEmbedding(
  id: string,
  vec: Float32Array,
  model: string,
): void {
  store.setState((s) => {
    const byId = new Map(s.byId);
    byId.set(id, { vec, model });
    return { byId };
  });
  void window.pond
    .query("saves.setEmbedding", {
      id,
      embedding: Array.from(vec),
      embeddingModel: model,
    })
    .catch((cause: unknown) => {
      log.warn(`[embeddings] failed to persist vector for ${id}`, cause);
    });
}

export function clearEmbeddings(ids?: ReadonlyArray<string>): number {
  if (ids && ids.length > 0) {
    let count = 0;
    store.setState((s) => {
      const byId = new Map(s.byId);
      for (const id of ids) {
        if (byId.delete(id)) {
          count++;
        }
      }
      return count === 0 ? s : { byId };
    });
    return count;
  }
  const count = store.state.byId.size;
  if (count === 0) {
    return 0;
  }
  store.setState(() => ({ byId: new Map() }));
  return count;
}
