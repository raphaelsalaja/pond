import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import {
  PipelineStatusSchema,
  statusFeed,
} from "@/features/downloads/lib/status-feed";

type PipelineStatus = z.infer<typeof PipelineStatusSchema>;

/** Whether background downloads are paused, and the switch that flips it. */
export function usePipelinePause() {
  const qc = useQueryClient();
  const pipeline = useQuery({
    queryKey: ["pipeline.status"],
    queryFn: async () =>
      PipelineStatusSchema.parse(
        await window.pond.query("pipeline.status", {}),
      ),
  });
  const paused = pipeline.data?.paused === true;
  const toggle = useMutation({
    mutationFn: () => window.pond.pipelinePause(!paused),
    onSuccess: (result) =>
      qc.setQueryData<PipelineStatus>(["pipeline.status"], {
        paused: result.paused,
      }),
    onError: () =>
      statusFeed.error(
        "Pause downloads",
        "Couldn't change the queue. Try again.",
      ),
  });

  return {
    paused,
    ready: pipeline.data !== undefined,
    pending: toggle.isPending,
    toggle: () => toggle.mutate(),
  };
}
