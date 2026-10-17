import { existsSync } from "node:fs";
import { delimiter, extname, join } from "node:path";

const CMD_META_CHARS = /([()\][%!^"`<>&|;, *?])/g;

/**
 * Quotes one argument for cmd.exe. Batch shims re-parse `%*`, so the escaping
 * runs once per parse. Characters cmd.exe would still expand are rejected.
 * Keep in sync with apps/desktop/src/main/core/agent/cli-runtime.ts: this
 * package is published on its own, so the helper cannot be shared without a
 * new cross-package dependency.
 */
export function quoteCmdArg(arg: string, passes = 2): string {
  if (/[\r\n%!]/.test(arg) || arg.includes("\0"))
    throw new Error(
      "An argument contains characters Windows cannot pass safely.",
    );
  const escaped = arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1");
  let quoted = `"${escaped}"`;
  for (let pass = 0; pass < passes; pass++)
    quoted = quoted.replace(CMD_META_CHARS, "^$1");
  return quoted;
}

/** Finds `name` on PATH the way cmd.exe does, honouring PATHEXT. */
export function resolveWindowsCommand(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
  exists: (path: string) => boolean = existsSync,
): string | null {
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path");
  const extensions = (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .filter(Boolean);
  const names = extname(name)
    ? [name]
    : extensions.map((ext) => `${name}${ext}`);
  for (const directory of (pathKey ? (env[pathKey] ?? "") : "").split(
    delimiter,
  )) {
    if (!directory) continue;
    for (const candidate of names) {
      const path = join(directory, candidate);
      if (exists(path)) return path;
    }
  }
  return null;
}

/**
 * Node refuses to spawn .cmd/.bat files directly (CVE-2024-27980), so shims
 * run through cmd.exe with pre-quoted arguments and no shell.
 */
export function windowsInvocation(
  executable: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
) {
  if (!/\.(cmd|bat)$/i.test(executable))
    return { file: executable, args: [...args], verbatim: false };
  const commandLine = [
    quoteCmdArg(executable, 1),
    ...args.map((arg) => quoteCmdArg(arg)),
  ];
  return {
    file: env.ComSpec ?? "cmd.exe",
    args: ["/d", "/s", "/c", `"${commandLine.join(" ")}"`],
    verbatim: true,
  };
}
