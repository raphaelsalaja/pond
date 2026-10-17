import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";

const ConfigSchema = z.object({
  baseUrl: z.string().optional(),
  token: z.string().optional(),
  timeout: z.number().int().positive().optional(),
});

export type PondCliConfig = z.infer<typeof ConfigSchema>;

/** Earlier versions kept the Windows file at the XDG location. */
function xdgConfigPath(env: NodeJS.ProcessEnv): string {
  return join(
    env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
    "pond",
    "cli.json",
  );
}

export function configPath(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (env.POND_CONFIG) return env.POND_CONFIG;
  if (platform === "win32")
    return join(
      env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
      "Pond",
      "cli.json",
    );
  if (platform === "darwin")
    return join(
      homedir(),
      "Library",
      "Application Support",
      "Pond",
      "cli.json",
    );
  return xdgConfigPath(env);
}

/** Files to read, newest location first. Windows still reads the pre-%APPDATA% file. */
export function configReadPaths(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const current = configPath(env, platform);
  return platform === "win32" && !env.POND_CONFIG
    ? [current, xdgConfigPath(env)]
    : [current];
}

export async function readConfig(
  path?: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<PondCliConfig> {
  for (const candidate of path ? [path] : configReadPaths(env, platform)) {
    try {
      return ConfigSchema.parse(JSON.parse(await readFile(candidate, "utf8")));
    } catch (error) {
      if (
        !(error instanceof Error && "code" in error && error.code === "ENOENT")
      )
        throw error;
    }
  }
  return {};
}

export async function writeConfig(
  config: PondCliConfig,
  path = configPath(),
): Promise<void> {
  const parsed = ConfigSchema.parse(config);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`, {
    mode: 0o600,
  });
  await chmod(path, 0o600);
}

export async function resolvedConfig(overrides: {
  baseUrl?: string;
  token?: string;
  timeout?: number;
}): Promise<Required<PondCliConfig>> {
  const stored = await readConfig();
  return {
    baseUrl:
      overrides.baseUrl ??
      process.env.POND_BASE_URL ??
      stored.baseUrl ??
      "http://127.0.0.1:41610/api/v2",
    token: overrides.token ?? process.env.POND_TOKEN ?? stored.token ?? "",
    timeout: overrides.timeout ?? stored.timeout ?? 15_000,
  };
}
