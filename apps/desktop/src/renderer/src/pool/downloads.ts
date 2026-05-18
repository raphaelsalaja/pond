import type { Save } from "./types";

// useIsVideoDownloading — pre-pipeline this listened to a separate IPC.
// In the URL-first world the task rows live on the save itself, so we
// just inspect the save's pipeline state. A save is "downloading" while
// the fetch_video_ytdlp task is running or pending AND we have evidence
// the save actually has video to fetch. Without the video-evidence gate
// every text tweet, article, or image-only post would flash "Queued"
// until the worker runs and bails out.
export function useIsVideoDownloading(save: Save | null | undefined): boolean {
  if (!save) return false;
  if (save.status === "complete" || save.status === "failed") return false;
  if (!hasVideoEvidence(save)) return false;
  const tasks = save.tasks ?? [];
  if (tasks.length === 0) return save.status === "ingesting";
  const t = tasks.find((x) => x.op === "fetch_video_ytdlp");
  if (!t) return false;
  return t.status === "pending" || t.status === "running";
}

function hasVideoEvidence(save: Save): boolean {
  if (save.mediaType === "video" || save.mediaType === "mixed") return true;
  if ((save.files ?? []).some((f) => f.kind === "video")) return true;
  const captureMedia = (
    save.rawJson as
      | {
          capture?: { media?: Array<{ type?: string }> };
        }
      | null
      | undefined
  )?.capture?.media;
  if (Array.isArray(captureMedia)) {
    return captureMedia.some((m) => m?.type === "video");
  }
  return false;
}
