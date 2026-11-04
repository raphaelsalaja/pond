import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { posix } from "node:path";

const { dirname, isAbsolute, join } = posix;

const AUTOSTART_FILENAME = "pond.desktop";

export function linuxAutostartPath(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  const config = env.XDG_CONFIG_HOME;
  const root = config && isAbsolute(config) ? config : join(home, ".config");
  return join(root, "autostart", AUTOSTART_FILENAME);
}

/** Quotes one Exec argument using the Desktop Entry specification's escaping rules. */
export function desktopExecArgument(value: string): string {
  /** A literal `%` must be doubled so it is not read as a field code. */
  const escaped = value.replaceAll("%", "%%");
  if (!/[\s"'\\`$]/.test(escaped)) return escaped;
  return `"${escaped.replace(/(["`$\\])/g, "\\$1")}"`;
}

export function linuxAutostartEntry(input: {
  execPath: string;
  args?: readonly string[];
}): string {
  const command = [input.execPath, ...(input.args ?? [])]
    .map(desktopExecArgument)
    .join(" ");
  return [
    "[Desktop Entry]",
    "Type=Application",
    "Name=Pond",
    "Comment=Start Pond in the background",
    `Exec=${command}`,
    "Terminal=false",
    "X-GNOME-Autostart-enabled=true",
    "",
  ].join("\n");
}

interface SetLinuxAutostartInput {
  enabled: boolean;
  execPath: string;
  args?: readonly string[];
  env?: NodeJS.ProcessEnv;
  home?: string;
  path?: string;
  exists?: (path: string) => boolean;
  makeDirectory?: (path: string) => Promise<void>;
  writeFile?: (path: string, body: string) => Promise<void>;
  removeFile?: (path: string) => Promise<void>;
}

async function makeDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

async function writeAutostartFile(path: string, body: string): Promise<void> {
  await writeFile(path, body, { encoding: "utf8", mode: 0o644 });
}

async function removeAutostartFile(path: string): Promise<void> {
  await rm(path, { force: true });
}

/** Electron does not implement login items on Linux, so Pond owns an XDG autostart entry. */
export async function setLinuxAutostart(
  input: SetLinuxAutostartInput,
): Promise<void> {
  const path =
    input.path ?? linuxAutostartPath(input.env ?? process.env, input.home);
  const isPresent = input.exists ?? existsSync;
  if (!input.enabled) {
    if (!isPresent(path)) return;
    await (input.removeFile ?? removeAutostartFile)(path);
    return;
  }
  await (input.makeDirectory ?? makeDirectory)(dirname(path));
  await (input.writeFile ?? writeAutostartFile)(
    path,
    linuxAutostartEntry({
      execPath: input.execPath,
      args: input.args,
    }),
  );
}
