import type { Op, Source } from "@pond/schema/db";
import { domainFromUrl } from "@pond/schema/domain";

/**
 * The web Source spans every site, so its per-Source budgets cannot stop a
 * bulk refresh from sending one storefront many parallel requests. Network work
 * for web Saves also shares a small budget per host.
 */
export const MAX_INFLIGHT_PER_WEB_HOST = 2;

/** Ops that request the Save's page or its media from the Save's site. */
const HOST_LIMITED_OPS: readonly Op[] = [
  "harvest_metadata",
  "archive_page",
  "fetch_blobs",
  "fetch_video_ytdlp",
];

export interface WebHostTask {
  /** The Source of the Save, which owns the URL. */
  saveSource: Source;
  op: Op;
  url: string;
}

/** The host whose budget a task spends, or null when it has no per-host limit. */
export function webHostFor(task: WebHostTask): string | null {
  if (task.saveSource !== "web") return null;
  if (!HOST_LIMITED_OPS.includes(task.op)) return null;
  return domainFromUrl(task.url);
}

export interface WebHostSlots {
  /** Whether the task may start without exceeding its host's budget. */
  admits(task: WebHostTask): boolean;
  /** Counts a started task against its host's budget. */
  occupy(task: WebHostTask): void;
}

export function createWebHostSlots(
  running: Iterable<WebHostTask>,
  limit: number = MAX_INFLIGHT_PER_WEB_HOST,
): WebHostSlots {
  const inflight = new Map<string, number>();
  const occupy = (task: WebHostTask): void => {
    const host = webHostFor(task);
    if (!host) return;
    inflight.set(host, (inflight.get(host) ?? 0) + 1);
  };
  for (const task of running) occupy(task);
  return {
    admits(task) {
      const host = webHostFor(task);
      if (!host) return true;
      return (inflight.get(host) ?? 0) < limit;
    },
    occupy,
  };
}
