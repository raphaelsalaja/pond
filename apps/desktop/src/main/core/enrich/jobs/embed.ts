import type { Save } from "@pond/schema/db";
import log from "electron-log/main.js";
import { getDb } from "../../../db";
import { embed, type ProviderClient } from "../provider";

export async function enrichEmbedding(
  client: ProviderClient,
  save: Save,
): Promise<{ ok: boolean; dim?: number }> {
  const text = composeText(save);
  if (!text.trim()) return { ok: false };
  let vector: number[];
  try {
    vector = await embed(client, text);
  } catch (err) {
    log.warn("[pond enrich/embed] call failed", save.id, err);
    return { ok: false };
  }
  if (vector.length !== client.embeddingDim) {
    log.warn(
      `[pond enrich/embed] dim mismatch (got ${vector.length}, expected ${client.embeddingDim})`,
    );
    return { ok: false };
  }
  const db = await getDb();
  const raw = db.$raw;
  const json = JSON.stringify(vector);
  try {
    raw
      .prepare(
        `INSERT INTO saves_vec(save_id, embedding) VALUES(?, ?)
         ON CONFLICT(save_id) DO UPDATE SET embedding = excluded.embedding`,
      )
      .run(save.id, json);
    return { ok: true, dim: vector.length };
  } catch (err) {
    log.warn("[pond enrich/embed] insert failed", save.id, err);
    return { ok: false };
  }
}

function composeText(save: Save): string {
  const parts = [
    save.title,
    save.description,
    save.aiCaption,
    save.aiSummary,
    save.ocrText,
    save.articleText,
    (save.tags ?? []).join(" "),
    (save.aiTags ?? []).join(" "),
  ];
  return parts
    .filter((v): v is string => Boolean(v))
    .join("\n\n")
    .slice(0, 6000);
}
