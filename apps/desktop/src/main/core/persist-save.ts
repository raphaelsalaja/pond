import type { NewSave, Save } from "@pond/schema/db";
import { writeSaveInfo } from "../lib/library";
import { patchTouchesInfo } from "../lib/library-format";
import {
  patchTouchesEnrichment,
  writeEnrichmentSidecar,
} from "./enrichment-sidecar";
import { withMutationScope } from "./executor";
import { applySavePatch } from "./pipeline/workers/apply";
import type { WriteFileArgs } from "./pipeline/workers/apply";

interface PersistSaveOptions {
  actorReason: string;
  newFiles?: Array<WriteFileArgs>;
  replaceFilesWithKind?: WriteFileArgs["kind"] | Array<WriteFileArgs["kind"]>;
  writeInfo?: boolean;
}

export async function persistSave(
  id: string,
  patch: Partial<NewSave>,
  opts: PersistSaveOptions,
): Promise<Save | null> {
  return withMutationScope(async () => {
    const updated = await applySavePatch(id, patch, {
      actorReason: opts.actorReason,
      newFiles: opts.newFiles,
      replaceFilesWithKind: opts.replaceFilesWithKind,
    });
    if (!updated) return null;

    const filesChanged =
      (opts.newFiles?.length ?? 0) > 0 ||
      opts.replaceFilesWithKind !== undefined;
    if (opts.writeInfo || filesChanged || patchTouchesInfo(patch)) {
      await writeSaveInfo(updated);
    }
    if (patchTouchesEnrichment(patch)) {
      await writeEnrichmentSidecar(updated);
    }

    return updated;
  });
}
