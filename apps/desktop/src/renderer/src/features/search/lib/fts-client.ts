import { z } from "zod";

export type FtsMode = "all" | "any";

const FtsReplySchema = z.object({
  ids: z.array(z.string()).catch([]),
  scores: z.record(z.string(), z.number()).catch({}),
});

export async function searchFtsScores(
  q: string,
  mode: FtsMode = "all",
  opts?: { deletedOnly?: boolean; limit?: number },
): Promise<Map<string, number>> {
  const trimmed = q.trim();
  if (!trimmed) return new Map();
  const res = FtsReplySchema.parse(
    await window.pond.query("saves.searchFts", {
      q: trimmed,
      mode,
      deletedOnly: opts?.deletedOnly ?? false,
      limit: opts?.limit ?? 10_000,
    }),
  );
  const out = new Map<string, number>();
  for (const id of res.ids) {
    out.set(id, res.scores[id] ?? 0);
  }
  return out;
}
