import { access } from "node:fs/promises";
import { join } from "node:path";
import { type NewSave, type Save, saves as savesTable } from "@pond/schema/db";
import { eq, isNotNull, or, sql } from "drizzle-orm";
import log from "electron-log/main.js";
import { z } from "zod";
import { getDb } from "../db";
import {
  readBundleJsonAsync,
  writeBundleJsonAsync,
} from "../lib/library-config";
import { saveFile } from "../paths";

const SIDECAR_FILE = "enrichment.json";

const ENRICHMENT_KEYS = [
  "phash",
  "blurhash",
  "caption",
  "captionModel",
  "ocrText",
  "ocrModel",
  "transcript",
  "transcriptModel",
  "aesthetic",
  "aestheticModel",
  "sensitiveScore",
  "sensitiveModel",
  "autoTitleModel",
  "suggestedTags",
  "suggestedTagsModel",
  "dominantColors",
] as const satisfies readonly (keyof Save)[];

type EnrichmentKey = (typeof ENRICHMENT_KEYS)[number];
export type EnrichmentFields = Partial<Pick<Save, EnrichmentKey>>;

export function patchTouchesEnrichment(patch: Partial<NewSave>): boolean {
  return ENRICHMENT_KEYS.some((key) => patch[key] !== undefined);
}

function sidecarPath(id: string): string {
  return saveFile(id, SIDECAR_FILE);
}

export async function writeEnrichmentSidecar(save: Save): Promise<void> {
  const data: EnrichmentFields = {};
  if (save.phash) data.phash = save.phash;
  if (save.blurhash) data.blurhash = save.blurhash;
  if (save.caption) data.caption = save.caption;
  if (save.captionModel) data.captionModel = save.captionModel;
  if (save.ocrText) data.ocrText = save.ocrText;
  if (save.ocrModel) data.ocrModel = save.ocrModel;
  if (save.transcript) data.transcript = save.transcript;
  if (save.transcriptModel) data.transcriptModel = save.transcriptModel;
  if (save.aesthetic?.length) data.aesthetic = save.aesthetic;
  if (save.aestheticModel) data.aestheticModel = save.aestheticModel;
  if (save.sensitiveScore != null) data.sensitiveScore = save.sensitiveScore;
  if (save.sensitiveModel) data.sensitiveModel = save.sensitiveModel;
  if (save.autoTitleModel) data.autoTitleModel = save.autoTitleModel;
  if (save.suggestedTags?.length) data.suggestedTags = save.suggestedTags;
  if (save.suggestedTagsModel) {
    data.suggestedTagsModel = save.suggestedTagsModel;
  }
  if (save.dominantColors?.length) data.dominantColors = save.dominantColors;

  const file = sidecarPath(save.id);
  try {
    if (Object.keys(data).length === 0 && !(await sidecarExists(file))) return;
    await writeBundleJsonAsync(file, data);
  } catch (err) {
    log.warn("[pond enrichment] sidecar write failed", save.id, err);
  }
}

const text = z.string().min(1).optional().catch(undefined);

const textList = z
  .array(z.unknown())
  .transform((items) =>
    items.flatMap((item) => z.string().safeParse(item).data ?? []),
  )
  .optional()
  .catch(undefined);

const EnrichmentSidecarSchema = z.object({
  phash: text,
  blurhash: text,
  caption: text,
  captionModel: text,
  ocrText: text,
  ocrModel: text,
  transcript: text,
  transcriptModel: text,
  aesthetic: textList,
  aestheticModel: text,
  sensitiveScore: z.number().min(0).max(1).optional().catch(undefined),
  sensitiveModel: text,
  autoTitleModel: text,
  suggestedTags: textList,
  suggestedTagsModel: text,
  dominantColors: textList,
});

export async function readEnrichmentSidecar(
  id: string,
  root?: string,
): Promise<EnrichmentFields | null> {
  const file = root
    ? join(root, "items", `${id}.info`, SIDECAR_FILE)
    : sidecarPath(id);
  const read = await readBundleJsonAsync<EnrichmentFields>(file);
  const parsed = EnrichmentSidecarSchema.safeParse(read?.data);
  if (!parsed.success) return null;

  const stored = parsed.data;
  const out: EnrichmentFields = {};
  if (stored.phash) out.phash = stored.phash;
  if (stored.blurhash) out.blurhash = stored.blurhash;
  if (stored.caption) out.caption = stored.caption;
  if (stored.captionModel) out.captionModel = stored.captionModel;
  if (stored.ocrText) out.ocrText = stored.ocrText;
  if (stored.ocrModel) out.ocrModel = stored.ocrModel;
  if (stored.transcript) out.transcript = stored.transcript;
  if (stored.transcriptModel) out.transcriptModel = stored.transcriptModel;
  if (stored.aesthetic?.length) out.aesthetic = stored.aesthetic;
  if (stored.aestheticModel) out.aestheticModel = stored.aestheticModel;
  if (stored.sensitiveScore != null) {
    out.sensitiveScore = stored.sensitiveScore;
  }
  if (stored.sensitiveModel) out.sensitiveModel = stored.sensitiveModel;
  if (stored.autoTitleModel) out.autoTitleModel = stored.autoTitleModel;
  if (stored.suggestedTags?.length) out.suggestedTags = stored.suggestedTags;
  if (stored.suggestedTagsModel) {
    out.suggestedTagsModel = stored.suggestedTagsModel;
  }
  if (stored.dominantColors?.length) {
    out.dominantColors = stored.dominantColors;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export async function backfillEnrichmentSidecars(): Promise<void> {
  const db = await getDb();
  const enriched = await db
    .select({ id: savesTable.id })
    .from(savesTable)
    .where(
      or(
        isNotNull(savesTable.phash),
        isNotNull(savesTable.blurhash),
        isNotNull(savesTable.caption),
        isNotNull(savesTable.ocrText),
        isNotNull(savesTable.transcript),
        isNotNull(savesTable.aesthetic),
        isNotNull(savesTable.sensitiveScore),
        isNotNull(savesTable.autoTitleModel),
        isNotNull(savesTable.suggestedTags),
        sql`json_array_length(${savesTable.dominantColors}) > 0`,
      ),
    );

  let written = 0;
  for (const { id } of enriched) {
    if (await sidecarExists(sidecarPath(id))) continue;
    const rows = await db
      .select()
      .from(savesTable)
      .where(eq(savesTable.id, id));
    const save = rows[0];
    if (!save) continue;
    await writeEnrichmentSidecar(save);
    written += 1;
  }
  log.info(`[pond enrichment] backfilled ${written} sidecars`);
}

async function sidecarExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch (error) {
    if (z.object({ code: z.literal("ENOENT") }).safeParse(error).success) {
      return false;
    }
    throw error;
  }
}
