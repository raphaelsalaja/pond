import { z } from "zod";
import { IPC } from "../../../shared/constants";
import { type QueryHandlerMap, query } from "./params";

const PROGRESS_INTERVAL_MS = 250;

const load = () => import("../../core/refresh/arena-links");

export const arenaLinkQueries = {
  "arenaLinks.status": query(z.object({}), async () => {
    const job = await load();
    return {
      pending: await job.countUnconvertedArenaLinks(),
      running: job.isConvertingArenaLinks(),
    };
  }),

  "arenaLinks.convert": query(
    z.object({ progressId: z.string().optional() }),
    async (params, event) => {
      const progressId = params.progressId?.trim();
      let lastProgressAt = 0;
      const { convertArenaLinks } = await load();
      return convertArenaLinks(
        progressId && event
          ? (progress) => {
              const now = Date.now();
              const done = progress.processed === progress.total;
              if (!done && now - lastProgressAt < PROGRESS_INTERVAL_MS) return;
              lastProgressAt = now;
              if (!event.sender.isDestroyed()) {
                event.sender.send(IPC.arenaLinkProgress, {
                  id: progressId,
                  ...progress,
                });
              }
            }
          : undefined,
      );
    },
  ),
} satisfies QueryHandlerMap;
