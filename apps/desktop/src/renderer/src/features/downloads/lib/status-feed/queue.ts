import type { Op } from "@pond/schema/db";
import type { Save } from "@/features/saves/types";

type RowStatus = "saving" | "failed";

export interface QueueProjection {
  saving: Array<QueueRow>;
  failed: Array<QueueRow>;
}

export interface QueueRow {
  save: Save;
  name: string;
  status: RowStatus;
  progress: number;
  stage: string | null;
  error: string | null;
}

const STAGE_LABELS = {
  harvest_metadata: "Reading page",
  capture_tweet: "Capturing tweet",
  render_text_cover: "Rendering text cover",
  fetch_blobs: "Downloading media",
  archive_page: "Archiving site",
  fetch_video_ytdlp: "Downloading video",
  ensure_poster: "Making poster",
  fetch_avatar: "Fetching avatar",
  finalize: "Finalizing",
} satisfies Record<Op, string>;

export function stageLabel(op: Op, source: string): string {
  if (op === "capture_tweet" && source === "threads") {
    return "Capturing post";
  }
  return STAGE_LABELS[op];
}

export function preferIngestError(
  current: string | null,
  next: string | null | undefined,
): string | null {
  if (!next) {
    return current;
  }
  if (
    !current ||
    (current.startsWith("blocked by") && !next.startsWith("blocked by"))
  ) {
    return next;
  }
  return current;
}

function toRow(save: Save): QueueRow | null {
  let status: RowStatus;
  if (save.status === "ingesting") {
    status = "saving";
  } else if (save.status === "failed") {
    status = "failed";
  } else {
    return null;
  }

  const tasks = save.tasks ?? [];
  let done = 0;
  let stage: string | null = null;
  let error: string | null = null;
  for (const t of tasks) {
    if (t.status === "done") {
      done += 1;
    } else if (t.status === "running") {
      stage = stageLabel(t.op, save.source);
    } else if (t.status === "dead" || t.status === "blocked") {
      stage ??= stageLabel(t.op, save.source);
      error = preferIngestError(error, t.lastError);
    }
  }
  if (status === "saving" && !stage) {
    const next = tasks.find((t) => t.status !== "done");
    stage = next ? stageLabel(next.op, save.source) : null;
  }

  return {
    save,
    name: save.title?.trim() || save.url,
    status,
    progress: tasks.length > 0 ? done / tasks.length : 0,
    stage,
    error,
  };
}

export function humanizeError(error: string | null): string {
  if (!error) {
    return "Couldn't finish this save";
  }
  const tail = error
    .replace(/^[A-Za-z]*Error:\s*/, "")
    .replace(/^[a-z0-9_]+:\s*/, "")
    .trim();
  if (!tail) {
    return "Couldn't finish this save";
  }
  return tail.charAt(0).toUpperCase() + tail.slice(1);
}

export function projectQueue(saves: ReadonlyArray<Save>): QueueProjection {
  const rows: Array<QueueRow> = [];
  for (const save of saves) {
    if (save.deletedAt !== null) {
      continue;
    }
    const row = toRow(save);
    if (row) {
      rows.push(row);
    }
  }
  const saving = rows
    .filter((r) => r.status === "saving")
    .sort((a, b) => b.progress - a.progress);
  const failed = rows
    .filter((r) => r.status === "failed")
    .sort((a, b) => (a.save.id < b.save.id ? 1 : -1));
  return { saving, failed };
}
