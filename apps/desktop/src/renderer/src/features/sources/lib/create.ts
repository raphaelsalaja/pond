import { SOURCES, type Source } from "@pond/schema/db";
import { isWatchableSource } from "@pond/schema/watches";
import { connectFlow } from "@/features/sources/state/connect-flow";
import { mymindConnectFlow } from "@/features/sources/state/mymind-connect-flow";
import { sourceFlow } from "@/features/sources/state/source-flow";
import { watchFlow } from "@/features/sources/state/watch-flow";

export const CONNECTABLE: readonly Source[] = SOURCES.filter(
  (source) => source !== "local" && source !== "web",
);

export const WATCH_MENU_SOURCES: readonly Source[] =
  SOURCES.filter(isWatchableSource);

export async function startConnect(
  source: Source,
  whenConnected: (() => void) | null = null,
): Promise<void> {
  if (source === "mymind") {
    mymindConnectFlow.start(undefined, whenConnected);
    return;
  }
  let connected: string[] = [];
  try {
    const result = await window.pond.query("accounts.list", {});
    connected = (result.accounts ?? [])
      .filter((account) => account.connected)
      .map((account) => account.id);
  } catch {
    connected = [];
  }
  connectFlow.start(source, connected, whenConnected);
  sourceFlow.open("connect-wait");
}

export function startWatch(source: Source): void {
  watchFlow.start(source);
  sourceFlow.open("watch-target");
}
