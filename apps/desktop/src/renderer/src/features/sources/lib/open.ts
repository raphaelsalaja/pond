import type { Source } from "@pond/schema/db";
import { startConnect, startWatch } from "@/features/sources/lib/create";
import { sourceDetail } from "@/features/sources/state/source-detail";
import { sourceNewMenu } from "@/features/sources/state/source-new-menu";
import { getAppHistory, getAppRouter } from "@/shared/lib/app-router";

export type SourcesIntent =
  | { type: "new-source" }
  | { type: "connect"; source: Source }
  | { type: "watch"; source: Source }
  | { type: "inspect-account"; id: string }
  | { type: "inspect-watch"; id: string };

export function openSources(intent?: SourcesIntent): void {
  if (intent?.type === "inspect-account") {
    sourceDetail.openAccount(intent.id);
    return;
  }
  if (intent?.type === "inspect-watch") {
    sourceDetail.openWatch(intent.id);
    return;
  }
  const router = getAppRouter();
  if (router && router.state.location.pathname !== "/sources") {
    getAppHistory()?.push("/sources");
  }
  if (!intent) {
    return;
  }
  switch (intent.type) {
    case "new-source":
      sourceNewMenu.open();
      return;
    case "connect":
      void startConnect(intent.source);
      return;
    case "watch":
      startWatch(intent.source);
      return;
  }
}
