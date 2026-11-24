import { z } from "zod";
import { IPC } from "../../../shared/constants";
import {
  cancelAllIngest,
  cancelSavesIngest,
  setReconcilerPaused,
} from "../../core/pipeline/reconciler-client";
import { safeHandle } from "../helpers";

const SaveIdsSchema = z.array(z.coerce.string()).catch([]);

export function registerPipelineHandlers(): void {
  safeHandle(IPC.pipelinePause, async (_, paused: boolean) => {
    return { ok: true as const, paused: await setReconcilerPaused(paused) };
  });

  safeHandle(IPC.pipelineCancelSaves, async (_, ids: Array<string>) => {
    const saveIds = SaveIdsSchema.parse(ids).filter(Boolean);
    const cancelled = await cancelSavesIngest(saveIds);
    return { ok: true as const, cancelled };
  });

  safeHandle(IPC.pipelineCancelAll, async () => {
    const cancelled = await cancelAllIngest();
    return { ok: true as const, cancelled };
  });
}
