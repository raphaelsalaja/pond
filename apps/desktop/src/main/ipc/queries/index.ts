import log from "electron-log/main.js";
import { z } from "zod";
import { COMBINE_IMAGES_QUERY_NAMES } from "../../../shared/combine-images-contracts";
import { IPC } from "../../../shared/constants";
import { fishMcp } from "../../core/agent/fish-mcp/live";
import { mcpOperations } from "../../core/agent/fish-mcp/operations";
import {
  registerExternalOperations,
  registerPondOperations,
} from "../../core/agent/operations";
import { combineImagesWindowOwnsSender } from "../../core/combine-images-window";
import { currentLibraryId } from "../../core/prefs-scope";
import { agentControlOperations } from "../agent-controls";
import { safeHandle } from "../helpers";
import { accountsQueries } from "./accounts";
import { agentQueries } from "./agent";
import { agentOperationsForQueries } from "./agent-operations";
import { apiTokensQueries } from "./api-tokens";
import { arenaLinkQueries } from "./arena-links";
import { bulkQueries } from "./bulk";
import { canvasesQueries } from "./canvases";
import { conversionQueries } from "./conversion";
import { downloadsQueries } from "./downloads";
import { fishQueries } from "./fish";
import { fishMcpQueries } from "./fish-mcp";
import { foldersQueries } from "./folders";
import { inspectQueries } from "./inspect";
import { libraryQueries } from "./library";
import { libraryRepairQueries } from "./library-repairs";
import { mediaProcessingQueries } from "./media-processing";
import { mediaUnderstandingQueries } from "./media-understanding";
import { openWithQueries } from "./open-with";
import type { QueryHandlerMap, QueryParams } from "./params";
import { queueQueries } from "./queue";
import { safariExtensionQueries } from "./safari-extension";
import { savedViewsQueries } from "./saved-views";
import { savesQueries } from "./saves";
import { settingsQueries } from "./settings";
import { sourcesQueries } from "./sources";
import { syncHistoryQueries } from "./sync-history";
import { tagGroupsQueries } from "./tag-groups";
import { tagsQueries } from "./tags";
import { transferJobsQueries } from "./transfer-jobs";
import { updateQueries } from "./updates";
import { videoQueries } from "./video";
import { watchesQueries } from "./watches";

type ContractHandlers = Required<QueryHandlerMap>;

const queryRegistry = {
  ...transferJobsQueries,
  ...updateQueries,
  ...bulkQueries,
  ...openWithQueries,
  ...canvasesQueries,
  ...fishQueries,
  ...fishMcpQueries,
  ...conversionQueries,
  ...savesQueries,
  ...downloadsQueries,
  ...queueQueries,
  ...arenaLinkQueries,
  ...settingsQueries,
  ...apiTokensQueries,
  ...tagsQueries,
  ...tagGroupsQueries,
  ...savedViewsQueries,
  ...foldersQueries,
  ...libraryQueries,
  ...libraryRepairQueries,
  ...mediaUnderstandingQueries,
  ...mediaProcessingQueries,
  ...inspectQueries,
  ...videoQueries,
  ...syncHistoryQueries,
  ...agentQueries,
  ...accountsQueries,
  ...watchesQueries,
  ...sourcesQueries,
  ...safariExtensionQueries,
} satisfies ContractHandlers;

const QueryNameEnum = z.enum(Object.keys(queryRegistry));
const QueryNameSchema = z.custom<keyof typeof queryRegistry>(
  (value) => QueryNameEnum.safeParse(value).success,
);

const SLOW_QUERY_MS = 100;

export function pondOperations() {
  return [
    ...agentOperationsForQueries(queryRegistry),
    ...agentControlOperations,
  ];
}

export function registerQueryHandler(): void {
  registerPondOperations({
    operations: pondOperations(),
    libraryId: currentLibraryId,
  });
  registerExternalOperations(() =>
    mcpOperations(fishMcp.tools(), (serverId, tool, args) =>
      fishMcp.call(serverId, tool, args),
    ),
  );
  safeHandle(IPC.query, async (event, name: string, raw?: QueryParams) => {
    const parsedName = QueryNameSchema.safeParse(name);
    if (!parsedName.success) throw new Error(`unknown query: ${name}`);
    if (
      combineImagesWindowOwnsSender(event.sender.id) &&
      !COMBINE_IMAGES_QUERY_NAMES.has(parsedName.data)
    ) {
      throw new Error("This action is unavailable in this window.");
    }
    const handler = queryRegistry[parsedName.data];
    if (!handler) throw new Error(`unknown query: ${name}`);
    const startedAt = performance.now();
    try {
      return await handler(raw, event);
    } catch (err) {
      log.error("[pond ipc] query failed", name, err);
      throw err;
    } finally {
      const ms = Math.round(performance.now() - startedAt);
      if (ms >= SLOW_QUERY_MS) log.warn("[pond perf] slow query", { name, ms });
    }
  });
}
