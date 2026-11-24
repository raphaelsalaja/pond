import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { app } from "electron";
import log from "electron-log/main.js";
import { watchMcpHost } from "../mcp-host";
import { createPondServer, loadPondSkills } from "./server";

export async function startPondMcp(): Promise<void> {
  log.transports.console.level = false;
  const version = app.getVersion();
  const skills = await loadPondSkills().catch((cause: unknown) => {
    log.error("[pond mcp] skill catalog failed; serving without it", cause);
    return undefined;
  });
  let quitting = false;
  const quit = (reason: string) => {
    if (quitting) {
      return;
    }
    quitting = true;
    stopWatching();
    log.info("[pond mcp] host disconnected; quitting", reason);
    void handle.close().finally(() => app.quit());
  };
  const handle = serveStdio(() => createPondServer(version, skills), {
    legacy: "serve",
    onerror: (error) => log.warn("[pond mcp] transport error", error),
  });
  const stopWatching = watchMcpHost({
    stdin: process.stdin,
    parentPid: () => process.ppid,
    onLost: quit,
    every: (run, ms) => {
      const timer = setInterval(run, ms);
      timer.unref();
      return () => clearInterval(timer);
    },
  });
}
