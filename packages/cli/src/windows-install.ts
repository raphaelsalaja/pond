import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** The installer registers Pond as the per-user `pond://` handler, which records the exact executable. */
const PROTOCOL_COMMAND_KEY =
  "HKCU\\Software\\Classes\\pond\\shell\\open\\command";

/** Reads a registry key's default value, or null when it is absent. */
export type RegistryReader = (key: string) => string | null;

const queryRegistryDefault: RegistryReader = (key) => {
  const reg = join(
    process.env.SystemRoot ?? "C:\\Windows",
    "System32",
    "reg.exe",
  );
  const result = spawnSync(reg, ["query", key, "/ve"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) return null;
  return result.stdout.match(/REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/m)?.[1] ?? null;
};

/** Extracts the executable from a shell command such as `"C:\Pond\Pond.exe" "%1"`. */
export function executableFromCommand(command: string): string | null {
  const quoted = command.match(/^\s*"([^"]+)"/)?.[1];
  if (quoted) return quoted;
  return command.match(/^\s*(.+?\.exe)\b/i)?.[1] ?? null;
}

/**
 * Finds Pond.exe for a per-user install, wherever it was installed: the
 * registered `pond://` handler first, then the default install directory.
 */
export function findPondExecutable(
  env: NodeJS.ProcessEnv = process.env,
  readRegistry: RegistryReader = queryRegistryDefault,
  exists: (path: string) => boolean = existsSync,
): string | null {
  const registered = readRegistry(PROTOCOL_COMMAND_KEY);
  const fromRegistry = registered ? executableFromCommand(registered) : null;
  if (fromRegistry && exists(fromRegistry)) return fromRegistry;
  if (!env.LOCALAPPDATA) return null;
  const fallback = join(env.LOCALAPPDATA, "Programs", "Pond", "Pond.exe");
  return exists(fallback) ? fallback : null;
}
