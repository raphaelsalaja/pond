import { z } from "zod";
import {
  embedModelVersion,
  embedSearchQueries,
} from "@/features/enrichment/lib/embeddings";
import { embeddingFor } from "@/features/enrichment/state/embedding-store";
import type { Save } from "@/features/saves/types";
import { unitCosine } from "@/shared/lib/vector";
import type { Enricher } from "../types";

const SUGGESTED_TAGS_VERSION = "suggested-tags@2";
const SCORE_THRESHOLD = 0.3;
const MAX_SUGGESTIONS = 5;
/** One embedding call pads every row to the longest name, so one call for a large tag list outgrows ONNX Runtime's tensor limit. */
const VOCAB_BATCH_SIZE = 64;
/** Tags are short labels; a longer string is import debris and only pads its batch. */
const MAX_TAG_LENGTH = 100;
/** After a vocab embed fails, skip rebuilds until tags change or this cooldown elapses. */
export const SUGGESTED_TAGS_VOCAB_RETRY_MS = 5 * 60 * 1000;

function suggestedTagsModelVersion(): string {
  return `${SUGGESTED_TAGS_VERSION}:${embedModelVersion()}`;
}

interface VocabEntry {
  name: string;
  vec: Float32Array;
}

const TagRowsSchema = z.array(
  z.object({ name: z.string().optional().catch(undefined) }),
);
type TagRows = z.infer<typeof TagRowsSchema>;

export interface SuggestedTagsDependencies {
  listTags(): Promise<TagRows>;
  embedSearchQueries(texts: Array<string>): Promise<Array<Float32Array>>;
  embeddingFor(id: string): Promise<{ vec: Float32Array } | undefined>;
  now(): number;
}

function vocabNames(rows: TagRows): Array<string> {
  return rows
    .map((r) => r.name)
    .filter(
      (n): n is string =>
        !!n && n.trim().length > 0 && n.length <= MAX_TAG_LENGTH,
    );
}

function vocabKey(names: Array<string>): string {
  return `${embedModelVersion()}\0${names.join("\0")}`;
}

export function createSuggestedTagsEnricher(
  deps: SuggestedTagsDependencies,
): Enricher {
  let cached: { key: string; entries: Array<VocabEntry> } | null = null;
  let failed: { key: string; at: number; error: Error } | null = null;
  let inFlight: Promise<Array<VocabEntry>> | null = null;

  async function getVocab(): Promise<Array<VocabEntry>> {
    const names = vocabNames(await deps.listTags());
    const key = vocabKey(names);
    if (cached?.key === key) return cached.entries;
    if (
      failed?.key === key &&
      deps.now() - failed.at < SUGGESTED_TAGS_VOCAB_RETRY_MS
    ) {
      throw failed.error;
    }
    if (inFlight) {
      try {
        await inFlight;
      } catch {
        /** The failure is recorded, and the retry below re-checks cache, cooldown, and tag names. */
      }
      return getVocab();
    }

    const pending = (async () => {
      if (names.length === 0) {
        return [];
      }
      const vecs: Array<Float32Array> = [];
      for (let i = 0; i < names.length; i += VOCAB_BATCH_SIZE) {
        vecs.push(
          ...(await deps.embedSearchQueries(
            names.slice(i, i + VOCAB_BATCH_SIZE),
          )),
        );
      }
      return names.flatMap((name, i) => {
        const vec = vecs[i];
        return vec ? [{ name, vec }] : [];
      });
    })();

    inFlight = pending;
    try {
      const entries = await pending;
      cached = { key, entries };
      failed = null;
      return entries;
    } catch (error) {
      const failure =
        error instanceof Error
          ? error
          : new Error("suggested-tags vocab failed");
      cached = null;
      failed = { key, at: deps.now(), error: failure };
      throw failure;
    } finally {
      if (inFlight === pending) inFlight = null;
    }
  }

  return {
    id: "suggestedTags",
    dependsOn: ["textEmbedding"],
    enabled: (prefs) =>
      prefs?.ai?.enableSuggestedTags === true &&
      prefs?.ai?.semanticSearch === true,
    eligible(save: Save) {
      if (save.status !== "complete" || save.deletedAt !== null) {
        return false;
      }
      if (save.suggestedTagsModel === suggestedTagsModelVersion()) {
        return false;
      }
      return save.embeddingModel === embedModelVersion();
    },
    async run(save: Save) {
      const entry = await deps.embeddingFor(save.id);
      if (!entry) return null;
      const vocab = await getVocab();
      const existing = new Set((save.tags ?? []).map((t) => t.toLowerCase()));
      const scored = vocab
        .filter((v) => !existing.has(v.name.toLowerCase()))
        .map((v) => ({ name: v.name, score: unitCosine(entry.vec, v.vec) }))
        .filter((s) => s.score >= SCORE_THRESHOLD)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_SUGGESTIONS)
        .map((s) => s.name);
      const fields = {
        suggestedTags: scored,
        suggestedTagsModel: suggestedTagsModelVersion(),
      };
      return { derived: fields, optimistic: fields };
    },
  };
}

export const suggestedTagsEnricher = createSuggestedTagsEnricher({
  listTags: async () =>
    TagRowsSchema.parse(await window.pond.query("tags.list", {})),
  embedSearchQueries,
  embeddingFor,
  now: () => Date.now(),
});
