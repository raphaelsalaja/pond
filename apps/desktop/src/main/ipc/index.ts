import { registerAppHandlers } from "./handlers/app";
import { registerContextMenuHandler } from "./handlers/context-menu";
import { registerRefreshHandlers } from "./handlers/refresh";
import { registerSuggestionHandlers } from "./handlers/suggestion";
import { registerSyncHandlers } from "./handlers/sync";
import { registerVideoHandlers } from "./handlers/video";
import { registerQueryHandler } from "./queries";

export function registerIpc(): void {
  registerAppHandlers();
  registerRefreshHandlers();
  registerSyncHandlers();
  registerVideoHandlers();
  registerContextMenuHandler();
  registerSuggestionHandlers();
  registerQueryHandler();
}
