import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saves } from "@pond/schema/db";
import type { ImageCrop } from "@pond/schema/db";
import { eq } from "drizzle-orm";
import type { InspectQueryResults } from "../../shared/inspect-contracts";
import { getDb } from "../db";
import { resolveSaveFilePath } from "../ipc/helpers";
import { cropImage } from "../lib/crop-image";
import { createManualSave } from "./manual-import";

export async function saveCropCopy(input: {
  id: string;
  fileIndex: number;
  crop: ImageCrop;
  frameIndex?: number;
}): Promise<InspectQueryResults["saves.cropAsCopy"]> {
  const target = await resolveSaveFilePath(input.id, input.fileIndex);
  if (!target.ok) {
    return { ok: false, error: "The original image is unavailable." };
  }
  const directory = await mkdtemp(join(tmpdir(), "pond-crop-"));
  try {
    const db = await getDb();
    const [original] = await db
      .select()
      .from(saves)
      .where(eq(saves.id, input.id));
    if (!original) {
      return { ok: false, error: "The original save is unavailable." };
    }
    const bytes = await cropImage(target.path, input.crop, input.frameIndex);
    const path = join(directory, "crop.png");
    await writeFile(path, bytes);
    const result = await createManualSave({
      title: `${original.title || "Image"} Crop`,
      filePaths: [path],
      tags: original.tags ?? [],
    });
    return result.ok
      ? { ok: true, id: result.id }
      : { ok: false, error: result.error };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Couldn't save this crop.",
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
