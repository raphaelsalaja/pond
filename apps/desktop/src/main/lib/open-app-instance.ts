import { spawn } from "node:child_process";
import { posix } from "node:path";

interface OpenChild {
  unref: () => void;
  once: (event: "error", listener: (error: Error) => void) => void;
}

export type SpawnOpenProcess = (
  command: string,
  args: readonly string[],
  options: { detached: true; stdio: "ignore" },
) => OpenChild;

export interface OpenAppInstanceOptions {
  /** The executable inside a macOS app bundle, at `<bundle>/Contents/MacOS/<name>`. */
  execPath: string;
  spawnProcess?: SpawnOpenProcess;
  onError: (error: Error) => void;
}

/** Starts a new instance of the macOS app bundle that contains `execPath`. */
export function openAppInstance({
  execPath,
  spawnProcess = spawn,
  onError,
}: OpenAppInstanceOptions): void {
  const bundle = posix.resolve(execPath, "../../..");
  const child = spawnProcess("open", ["-n", bundle], {
    detached: true,
    stdio: "ignore",
  });
  child.once("error", onError);
  child.unref();
}
