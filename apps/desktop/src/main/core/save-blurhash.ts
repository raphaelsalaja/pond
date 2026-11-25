import type { Save } from "@pond/schema/db";
import { encodeBlurhash, pickBlurhashStill } from "../lib/blurhash";
import { saveFile } from "../paths";
import { persistSave } from "./persist-save";

export async function writeSaveBlurhash(
  save: Pick<Save, "id" | "blurhash" | "files" | "coverIndex">,
): Promise<string | null> {
  if (save.blurhash) return save.blurhash;
  const still = pickBlurhashStill(save);
  if (!still) return null;
  const hash = await encodeBlurhash(saveFile(save.id, still.path));
  if (!hash) return null;
  await persistSave(
    save.id,
    { blurhash: hash },
    { actorReason: "blurhash:encode" },
  );
  return hash;
}
