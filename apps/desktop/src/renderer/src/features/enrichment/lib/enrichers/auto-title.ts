import { mutateSave, pool } from "@/features/saves/pool";
import type { Save } from "@/features/saves/types";
import type { Enricher } from "../types";

const AUTO_TITLE_VERSION = "auto-title@1";

function hasTitle(save: Save): boolean {
  return !!save.title && save.title.trim().length > 0;
}

function deriveTitle(save: Save): string | null {
  const source =
    save.caption ?? firstLine(save.ocrText) ?? firstLine(save.description);
  if (!source) return null;
  const sentence = source.split(/(?<=[.!?])\s/)[0] ?? source;
  const title = sentence.trim().replaceAll(/\s+/g, " ").slice(0, 80);
  return title.length > 0 ? title : null;
}

function firstLine(text: string | null | undefined): string | null {
  if (!text) return null;
  const line = text.split(/\r?\n/).find((l) => l.trim().length > 0);
  return line ? line.trim() : null;
}

export const autoTitleEnricher: Enricher = {
  id: "autoTitle",
  dependsOn: ["caption", "ocr"],
  enabled: (prefs) => prefs?.ai?.enableAutoTitle === true,
  eligible(save: Save) {
    if (save.status !== "complete" || save.deletedAt !== null) {
      return false;
    }
    if (hasTitle(save)) {
      return false;
    }
    if (save.autoTitleModel === AUTO_TITLE_VERSION) {
      return false;
    }
    return !!deriveTitle(save);
  },
  async run(save: Save) {
    const title = deriveTitle(save);
    if (!title) return null;
    const current = pool.get(save.id) ?? save;
    if (!hasTitle(current)) {
      await mutateSave(save.id, { title }, { actorReason: "ai:auto-title" });
    }
    return { derived: { autoTitleModel: AUTO_TITLE_VERSION } };
  },
};
