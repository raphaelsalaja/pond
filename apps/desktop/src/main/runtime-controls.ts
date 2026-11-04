import type { Prefs } from "@pond/schema/db";
import { DEFAULT_INGEST_PORT } from "../shared/constants";

interface RuntimeServer {
  port: number;
  host: string;
  close(): Promise<void>;
}

interface RuntimeDependencies {
  getPrefs(): Promise<Prefs>;
  invalidatePrefs(): void;
  startHttpServer(
    port: number,
    bind: Prefs["api"]["bindAddress"],
  ): Promise<RuntimeServer>;
  setTrayVisible(visible: boolean): Promise<void>;
  isPackaged: boolean;
  setLoginItemSettings(settings: { openAtLogin: boolean }): Promise<void>;
  setCloseToTray(enabled: boolean): void;
  applyAppIcon(icon: Prefs["window"]["appIcon"]): Promise<void>;
  warn(message: string, error: Error): void;
}

export function createRuntimeControls(deps: RuntimeDependencies) {
  let httpServer: RuntimeServer | null = null;

  async function startHttpServer() {
    const prefs = await deps.getPrefs();
    httpServer = await deps.startHttpServer(
      prefs.api.port || DEFAULT_INGEST_PORT,
      prefs.api.bindAddress,
    );
    return { port: httpServer.port, host: httpServer.host };
  }

  async function replaceHttpServer(prefs: Prefs) {
    if (httpServer) {
      try {
        await httpServer.close();
      } catch (err) {
        deps.warn(
          "[pond] http close failed",
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    }
    httpServer = await deps.startHttpServer(
      prefs.api.port || DEFAULT_INGEST_PORT,
      prefs.api.bindAddress,
    );
    return { port: httpServer.port, host: httpServer.host };
  }

  return {
    startHttpServer,
    async closeHttpServer() {
      await httpServer?.close();
    },
    async restartHttpServer() {
      deps.invalidatePrefs();
      const prefs = await deps.getPrefs();
      return replaceHttpServer(prefs);
    },
    async applyPrefsAtRuntime() {
      deps.invalidatePrefs();
      const prefs = await deps.getPrefs();
      await deps.setTrayVisible(prefs.quickCapture.menuBarIcon);
      if (deps.isPackaged) {
        await deps.setLoginItemSettings({
          openAtLogin: prefs.quickCapture.launchAtLogin,
        });
      }
      deps.setCloseToTray(prefs.window.closeToTray === true);
      await deps.applyAppIcon(prefs.window.appIcon);
    },
    async applyWindowPrefsAtRuntime() {
      deps.invalidatePrefs();
      const prefs = await deps.getPrefs();
      deps.setCloseToTray(prefs.window.closeToTray === true);
    },
  };
}
