import type { QueueSourceGate } from "@shared/queue-contracts";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSaves } from "@/features/saves/pool";
import { downloadStatusReason } from "../components/page/status-reason";
import {
  type DownloadRow,
  PipelineStatusSchema,
  projectLiveDownloads,
} from "../lib/status-feed";
import { useLiveDownloadHydration } from "./use-live-download-hydration";
import { useSourceGates } from "./use-source-gates";

export interface DownloadHealthRow {
  row: DownloadRow;
  gate: QueueSourceGate | null;
  reason: string | null;
}

export function useDownloadHealth() {
  useLiveDownloadHydration();
  const saves = useSaves();
  const live = useMemo(() => projectLiveDownloads(saves), [saves]);
  const gates = useSourceGates(live.some((row) => row.status === "parked"));
  const pipeline = useQuery({
    queryKey: ["pipeline.status"],
    queryFn: async () =>
      PipelineStatusSchema.parse(
        await window.pond.query("pipeline.status", {}),
      ),
  });
  const paused = pipeline.data?.paused === true;
  const rows = useMemo(() => {
    const bySource = new Map(
      (gates.data ?? []).map((gate) => [gate.source, gate]),
    );
    const now = Date.now();
    return live.map((row): DownloadHealthRow => {
      const gate = bySource.get(row.source) ?? null;
      return {
        row,
        gate,
        reason: downloadStatusReason(row, { paused, gate, now }),
      };
    });
  }, [live, gates.data, paused]);
  return { rows, paused, loaded: pipeline.isSuccess };
}
