import { z } from "zod";
import { LibraryHealthSaveIdsSchema } from "../../../shared/library-health-contracts";
import { libraryHealthService } from "../../core/library-health";
import { type QueryHandlerMap, query } from "./params";

export const libraryHealthQueries = {
  "libraryHealth.overview": query(z.object({}), () =>
    libraryHealthService.overview(),
  ),
  "libraryHealth.check": query(z.object({}), () =>
    libraryHealthService.start(),
  ),
  "libraryHealth.cancel": query(z.object({}), () =>
    libraryHealthService.cancel(),
  ),
  "libraryHealth.recheck": query(LibraryHealthSaveIdsSchema, ({ saveIds }) =>
    libraryHealthService.recheck(saveIds),
  ),
  "libraryHealth.retryPosters": query(
    LibraryHealthSaveIdsSchema,
    async ({ saveIds }) => {
      const { retryMediaWarm } = await import("../../core/media-warm/service");
      return { queued: await retryMediaWarm(saveIds) };
    },
  ),
} satisfies QueryHandlerMap;
