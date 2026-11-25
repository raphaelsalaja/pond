import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { app } from "electron";
import log from "electron-log/main.js";
import { z } from "zod";
import type { AppNavigation } from "../../../../shared/app-navigation";
import { DEFAULT_INGEST_PORT } from "../../../../shared/constants";
import { getIngestToken } from "../../../keychain";
import { openAppInstance } from "../../../lib/open-app-instance";
import { getPrefs } from "../../prefs";

const LAUNCH_TIMEOUT_MS = 20_000;
const RETRY_MS = 500;

const ErrorBodySchema = z.object({ error: z.object({ message: z.string() }) });

type NavigateResult = { ok: true } | { error: string };

class PondClosed extends Error {
  constructor() {
    super();
    this.name = "PondClosed";
  }
}

function isPondClosed(value: unknown): value is PondClosed {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    value.name === "PondClosed"
  );
}

async function post(target: AppNavigation): Promise<NavigateResult> {
  const token = await getIngestToken();
  if (!token) {
    return {
      error: "Pond has no Local API Token yet. Open Pond, then try again.",
    };
  }
  const port = (await getPrefs()).api.port || DEFAULT_INGEST_PORT;
  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${port}/api/v2/app/navigate`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(target),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new PondClosed();
  }
  if (response.ok) return { ok: true };
  const body = ErrorBodySchema.safeParse(
    await response.json().catch(() => null),
  );
  return {
    error: body.success
      ? body.data.error.message
      : `Pond answered ${response.status}. Update Pond, then try again.`,
  };
}

function launchPond(): boolean {
  if (!app.isPackaged) return false;
  if (process.platform === "darwin") {
    openAppInstance({
      execPath: process.execPath,
      onError: (error) => log.error("[pond mcp] could not open Pond", error),
    });
    return true;
  }
  const child = spawn(process.execPath, [], {
    detached: true,
    stdio: "ignore",
  });
  child.once("error", (error) =>
    log.error("[pond mcp] could not open Pond", error),
  );
  child.unref();
  return true;
}

/** The `--mcp` process has no window, so it asks the running app to move its own. */
export async function navigatePond(
  target: AppNavigation,
): Promise<NavigateResult> {
  try {
    return await post(target);
  } catch (error) {
    if (!isPondClosed(error)) {
      throw error;
    }
  }
  if (!launchPond()) {
    return { error: "Pond isn't open. Open Pond, then try again." };
  }
  const deadline = Date.now() + LAUNCH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(RETRY_MS);
    try {
      return await post(target);
    } catch (error) {
      if (!isPondClosed(error)) {
        throw error;
      }
    }
  }
  return { error: "Pond didn't open in time. Open Pond, then try again." };
}
