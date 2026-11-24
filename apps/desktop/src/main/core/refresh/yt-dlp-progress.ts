import type { ReportDownloadActivity } from "@shared/download-activity";
import { z } from "zod";

const PREFIX = "POND_PROGRESS:";
export const YTDLP_PROGRESS_TEMPLATE = `${PREFIX}{"status":%(progress.status)j,"id":%(info.id)j,"format":%(info.format_id)j,"received":%(progress.downloaded_bytes)j,"total":%(progress.total_bytes)j,"speed":%(progress.speed)j,"eta":%(progress.eta)j,"index":%(info.playlist_index)j,"count":%(info.playlist_count)j}`;

const Metric = z.number().nonnegative().finite().optional().catch(undefined);
const Progress = z.object({
  status: z.enum(["downloading", "finished"]),
  id: z.string().optional().catch(undefined),
  format: z.string().optional().catch(undefined),
  received: z.number().int().nonnegative().optional().catch(undefined),
  total: z.number().int().positive().optional().catch(undefined),
  speed: Metric,
  eta: Metric,
  index: z.number().int().positive().optional().catch(undefined),
  count: z.number().int().positive().optional().catch(undefined),
});

export function createYtdlpProgressReporter(report: ReportDownloadActivity) {
  const streams = new Map<string, { id: string; startedAt: number }>();
  return (line: string) => {
    if (!line.startsWith(PREFIX)) {
      return;
    }
    let parsed: ReturnType<typeof Progress.safeParse>;
    try {
      parsed = Progress.safeParse(JSON.parse(line.slice(PREFIX.length)));
    } catch {
      return;
    }
    if (!parsed.success) {
      return;
    }
    const progress = parsed.data;
    const fileIndex = progress.index ?? 1;
    const at = Date.now();
    const identity = JSON.stringify([progress.id, progress.format, fileIndex]);
    let stream = streams.get(identity);
    if (!stream) {
      stream = { id: `ytdlp-${streams.size + 1}`, startedAt: at };
      streams.set(identity, stream);
    }
    const complete = progress.status === "finished";
    report({
      phase: complete ? "processing" : "receiving",
      transfer: {
        transferId: stream.id,
        fileIndex,
        fileCount:
          progress.count && progress.count >= fileIndex
            ? progress.count
            : undefined,
        state: complete ? "completed" : "receiving",
        startedAt: stream.startedAt,
        updatedAt: at,
        receivedBytes: progress.received,
        totalBytes:
          progress.total !== undefined &&
          progress.total >= (progress.received ?? 0)
            ? progress.total
            : undefined,
        bytesPerSecond: complete ? undefined : progress.speed,
        etaSeconds: complete ? undefined : progress.eta,
      },
    });
  };
}
