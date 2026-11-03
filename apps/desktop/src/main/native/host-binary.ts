import { chmod, copyFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";
import log from "electron-log/main.js";

function linuxDataHome(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  const data = env.XDG_DATA_HOME;
  return data && isAbsolute(data) ? data : join(home, ".local", "share");
}

async function makeDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

/** Native messaging needs an absolute path that survives a restart; AppImage mounts do not. */
export function stableLinuxNativeHostPath(
  filename: string,
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  return join(linuxDataHome(env, home), "Pond", "bin", filename);
}

interface PrepareNativeHostInput {
  source: string;
  platform?: NodeJS.Platform;
  packaged?: boolean;
  /** `APPIMAGE` is only set when the running build is an AppImage. */
  appImage?: string;
  env?: NodeJS.ProcessEnv;
  home?: string;
  copy?: (source: string, target: string) => Promise<void>;
  makeDirectory?: (path: string) => Promise<void>;
  setMode?: (path: string, mode: number) => Promise<void>;
}

/**
 * An AppImage mounts its resources under a new random directory each launch, so
 * the browser manifest cannot point into it. Copy the host to a stable per-user
 * path and point there instead. Every other Linux package has a fixed path.
 */
export async function prepareNativeHostBinary(
  input: PrepareNativeHostInput,
): Promise<string> {
  const platform = input.platform ?? process.platform;
  const packaged = input.packaged ?? false;
  if (platform !== "linux" || !packaged || !input.appImage) return input.source;

  const target = stableLinuxNativeHostPath(
    basename(input.source),
    input.env,
    input.home,
  );
  try {
    await (input.makeDirectory ?? makeDirectory)(dirname(target));
    await (input.copy ?? copyFile)(input.source, target);
    await (input.setMode ?? chmod)(target, 0o755);
    return target;
  } catch (err) {
    log.warn("[pond native] failed to copy the host out of the AppImage", err);
    return input.source;
  }
}
