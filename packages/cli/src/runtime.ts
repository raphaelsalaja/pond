import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { findPondExecutable } from "./windows-install";

async function ready(baseUrl: string, timeout: number): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/app/info`, {
      signal: AbortSignal.timeout(timeout),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function pondLaunchCommand(
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  findExecutable: (
    env: NodeJS.ProcessEnv,
  ) => string | null = findPondExecutable,
  exists: (path: string) => boolean = existsSync,
) {
  if (platform === "darwin")
    return { file: "open", args: ["-gj", "-a", "Pond"] };
  if (platform === "win32") {
    // The installer registers the pond:// handler; its executable is the
    // install wherever it lives. Without one, ask Windows to open the link.
    const executable = findExecutable(env);
    return executable
      ? { file: executable, args: [] }
      : { file: "explorer.exe", args: ["pond://library"] };
  }
  // The deb keeps its executable at a fixed path; an AppImage is launched
  // through the desktop entry its integration installs.
  if (exists("/opt/Pond/pond")) return { file: "/opt/Pond/pond", args: [] };
  return { file: "xdg-open", args: ["pond://library"] };
}

function launchPond() {
  const command = pondLaunchCommand();
  const child = spawn(command.file, command.args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  let failure: Error | undefined;
  child.on("error", (error) => {
    failure = error;
  });
  child.unref();
  return { failure: () => failure };
}

export async function ensurePondAvailable(
  baseUrl: string,
  timeout: number,
): Promise<void> {
  if (await ready(baseUrl, Math.min(timeout, 750))) return;
  const launched = launchPond();
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await delay(250);
    const failure = launched.failure();
    if (failure) throw new Error(`Could not start Pond: ${failure.message}`);
    if (await ready(baseUrl, Math.min(750, deadline - Date.now()))) return;
  }
  throw new Error(
    "Pond did not start before the timeout. Open the app and try again.",
  );
}
