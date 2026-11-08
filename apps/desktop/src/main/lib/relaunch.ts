import { spawn } from "node:child_process";

export const RELAUNCH_ARG = "--pond-relaunch";

export interface RelaunchOptions {
  execPath: string;
  args: string[];
}

/** The AppImage runtime exports these for the mount it runs from, so a replacement must not inherit the old ones. */
const APPIMAGE_MOUNT_ENV = ["APPIMAGE", "APPDIR", "ARGV0", "OWD"] as const;

export function appRelaunchOptions(
  platform: NodeJS.Platform = process.platform,
  appImage = process.env.APPIMAGE,
  argv: readonly string[] = process.argv,
): RelaunchOptions | undefined {
  if (platform !== "linux" || !appImage) return undefined;
  return {
    execPath: appImage,
    args: [...argv]
      .slice(1)
      .filter((arg) => arg !== RELAUNCH_ARG)
      .concat(RELAUNCH_ARG),
  };
}

export function appRelaunchEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next = { ...env };
  for (const key of APPIMAGE_MOUNT_ENV) delete next[key];
  return next;
}

export interface RelaunchSpawn {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

export type RelaunchPlan =
  | ({ kind: "spawn" } & RelaunchSpawn)
  | { kind: "electron" };

/**
 * AppImage mounts its files through a setuid `fusermount` helper, which cannot run under `no_new_privs`. Electron's `app.relaunch` sets that flag on its child, so installed Linux builds must spawn the AppImage directly.
 */
export function planRelaunch(
  platform: NodeJS.Platform = process.platform,
  appImage = process.env.APPIMAGE,
  argv: readonly string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): RelaunchPlan {
  const options = appRelaunchOptions(platform, appImage, argv);
  if (!options) return { kind: "electron" };
  return {
    kind: "spawn",
    command: options.execPath,
    args: options.args,
    env: appRelaunchEnv(env),
  };
}

interface RelaunchChild {
  unref: () => void;
  once: (event: "error", listener: (error: Error) => void) => void;
}

export type SpawnRelaunchProcess = (
  command: string,
  args: readonly string[],
  options: {
    detached: true;
    stdio: "ignore";
    env: NodeJS.ProcessEnv;
  },
) => RelaunchChild;

/**
 * Closes inherited descriptors before `exec` so the replacement does not pin the predecessor's AppImage mount. Chromium's launcher does this for `app.relaunch`; `child_process.spawn` does not.
 */
const CLOSE_INHERITED_FDS = `for f in /proc/self/fd/*; do n=\${f##*/}; if [ "$n" -gt 2 ] 2>/dev/null; then eval "exec $n>&-" 2>/dev/null; fi; done; exec "$0" "$@"`;

export interface SpawnRelaunchOptions {
  spawnProcess?: SpawnRelaunchProcess;
  onError: (error: Error) => void;
}

export function spawnRelaunch(
  plan: RelaunchSpawn,
  { spawnProcess = spawn, onError }: SpawnRelaunchOptions,
): void {
  const child = spawnProcess(
    "/bin/sh",
    ["-c", CLOSE_INHERITED_FDS, plan.command, ...plan.args],
    {
      detached: true,
      stdio: "ignore",
      env: plan.env,
    },
  );
  child.once("error", onError);
  child.unref();
}
