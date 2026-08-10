import log from "electron-log/main.js";
import { IPC } from "../../../shared/constants";
import {
  type QueryHandler,
  type QueryHandlerMap,
  safeHandle,
} from "../helpers";
import { accountsQueries } from "./accounts";
import { aiQueries } from "./ai";
import { developerQueries } from "./developer";
import { libraryQueries } from "./library";
import { mediaIndexQueries } from "./media-index";
import { savedViewsQueries } from "./saved-views";
import { savesQueries } from "./saves";
import { settingsQueries } from "./settings";
import { syncHistoryQueries } from "./sync-history";
import { tagGroupsQueries } from "./tag-groups";
import { tagsQueries } from "./tags";
import { videoQueries } from "./video";
import { watchesQueries } from "./watches";

const queryRegistry: QueryHandlerMap = {
  ...savesQueries,
  ...settingsQueries,
  ...tagsQueries,
  ...tagGroupsQueries,
  ...savedViewsQueries,
  ...libraryQueries,
  ...mediaIndexQueries,
  ...developerQueries,
  ...videoQueries,
  ...syncHistoryQueries,
  ...aiQueries,
  ...accountsQueries,
  ...watchesQueries,
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
