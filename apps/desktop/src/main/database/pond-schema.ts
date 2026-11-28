import { sourceIdentity } from "@pond/schema/domain";
import { colorNear } from "@pond/schema/filters/color";
import { fileExtension } from "@pond/schema/filters/fields";
import type Database from "better-sqlite3";
import { z } from "zod";
import { seededOrderKey } from "../../shared/order-key";
import { ensureAssetIndex } from "../core/duplicates/asset-index";
import { ensureRuleTables } from "../core/rules/ledger";
import {
  ensureVecDeleteTrigger,
  ensureVecTables,
  loadSqliteVec,
} from "../core/vec-index";
import { manualOrderRank } from "../lib/folder-order";
import { migratePond } from "./migrations";

export function initializePondSchema(
  sqlite: Database.Database,
  loadVectorExtension = loadSqliteVec,
): boolean {
  sqlite.function(
    "pond_source_identity",
    { deterministic: true },
    (siteName, source, url) => {
      const text = z.string().nullable();
      return sourceIdentity({
        siteName: text.safeParse(siteName).data ?? null,
        source: text.safeParse(source).data ?? null,
        url: text.safeParse(url).data ?? null,
      });
    },
  );
  sqlite.function(
    "pond_color_near",
    { deterministic: true },
    (palette, hex, tolerance) => {
      const color = z.string().safeParse(hex);
      const distance = z.number().safeParse(tolerance);
      const encoded = z.string().safeParse(palette);
      if (!color.success || !distance.success || !encoded.success) return 0;
      try {
        const colors = z.array(z.string()).parse(JSON.parse(encoded.data));
        return colorNear(color.data, colors, distance.data) ? 1 : 0;
      } catch {
        return 0;
      }
    },
  );
  sqlite.function("pond_file_extension", { deterministic: true }, (path) => {
    const text = z.string().safeParse(path);
    return text.success ? fileExtension(text.data) : null;
  });
  sqlite.function("pond_order_key", { deterministic: true }, (id, seed) =>
    z.string().safeParse(id).success && z.string().safeParse(seed).success
      ? seededOrderKey(z.string().parse(id), z.string().parse(seed))
      : 0,
  );
  sqlite.function("pond_manual_rank", { deterministic: true }, (key, id) =>
    z.string().safeParse(key).success && z.string().safeParse(id).success
      ? manualOrderRank(z.string().parse(key), z.string().parse(id))
      : null,
  );
  const vectorEnabled = loadVectorExtension(sqlite);
  if (vectorEnabled) ensureVecTables(sqlite);
  migratePond(sqlite);
  ensureAssetIndex(sqlite);
  ensureRuleTables(sqlite);
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS mutation_commits (batch_id TEXT PRIMARY KEY)",
  );
  if (vectorEnabled) ensureVecDeleteTrigger(sqlite);
  return vectorEnabled;
}
