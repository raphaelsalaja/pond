import log from "electron-log/main.js";
import { IPC } from "../../../shared/constants";
import {
  type QueryHandler,
  type QueryHandlerMap,
  safeHandle,
} from "../helpers";
import { developerQueries } from "./developer";
import { libraryQueries } from "./library";
import { savesQueries } from "./saves";
import { settingsQueries } from "./settings";
import { tagsQueries } from "./tags";
import { videoQueries } from "./video";

const queryRegistry: QueryHandlerMap = {
  ...savesQueries,
  ...settingsQueries,
  ...tagsQueries,
  ...libraryQueries,
  ...developerQueries,
  ...videoQueries,
};

export function registerQueryHandler(): void {
  safeHandle(IPC.query, async (event, name: string, raw: unknown) => {
    const handler: QueryHandler | undefined = queryRegistry[name];
    if (!handler) throw new Error(`unknown query: ${name}`);
    try {
      const params = (raw ?? {}) as Record<string, unknown>;
      return await handler(params, event);
    } catch (err) {
      log.error("[pond ipc] query failed", name, err);
      throw err;
    }
  });
}
