import { z } from "zod";
import { needsTextCover } from "@/features/saves/lib/media/units";
import type { Save } from "@/features/saves/types";

type TextCoverParams = {
  id: string;
  force?: true;
};

const TextCoverReplySchema = z
  .object({
    ok: z.boolean().catch(false),
    captured: z.number().catch(0),
  })
  .catch({ ok: false, captured: 0 });

const requested = new Set<string>();

export function ensureTextCover(
  save: Save,
  opts: { force?: boolean } = {},
): void {
  if (!opts.force && !needsTextCover(save)) return;
  if (!opts.force && requested.has(save.id)) return;
  if (opts.force) requested.delete(save.id);
  requested.add(save.id);
  const params: TextCoverParams = { id: save.id };
  if (opts.force) params.force = true;
  void window.pond
    .query("saves.ensureTextCover", params)
    .then((result) => {
      const res = TextCoverReplySchema.parse(result);
      if (!res.ok || !res.captured) requested.delete(save.id);
    })
    .catch(() => {
      requested.delete(save.id);
    });
}
