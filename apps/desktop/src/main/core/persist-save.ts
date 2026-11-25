import type { NewSave, Save } from "@pond/schema/db";
import { writeSaveInfo } from "../lib/library";
import { patchTouchesInfo } from "../lib/library-format";
import {
  patchTouchesEnrichment,
  writeEnrichmentSidecar,
} from "./enrichment-sidecar";
import { withMutationScope } from "./executor";
import { applySavePatch, stageSaveFiles } from "./pipeline/workers/apply";
import type { StagedSaveFiles, WriteFileArgs } from "./pipeline/workers/apply";

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
  const staged =
    opts.newFiles && opts.newFiles.length > 0
      ? await stageSaveFiles(id, opts.newFiles)
      : undefined;
  try {
    return await persistStaged(id, patch, opts, staged);
  } finally {
    await staged?.discard();
  }
}

function persistStaged(
  id: string,
  patch: Partial<NewSave>,
  opts: PersistSaveOptions,
  staged: StagedSaveFiles | undefined,
): Promise<Save | null> {
  return withMutationScope(async () => {
    const updated = await applySavePatch(id, patch, {
      actorReason: opts.actorReason,
      staged,
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
