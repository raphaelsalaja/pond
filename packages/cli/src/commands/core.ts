import { stat } from "node:fs/promises";
import type { Command } from "commander";
import { z } from "zod";
import { configPath, readConfig, writeConfig } from "../config";
import { action, commandContext, StringSchema } from "./shared";

const topLevelCommands =
  "status doctor version completion config auth libraries saves folders tags sources sync downloads conversions agent mcp skill library trash schema";

export function completionScript(shell: string): string {
  if (shell === "fish") return `complete -c pond -f -a '${topLevelCommands}'`;
  if (shell === "bash") return `complete -W '${topLevelCommands}' pond`;
  return `#compdef pond\n_arguments '1:command:(${topLevelCommands})'`;
}

export function registerCoreCommands(program: Command, version: string): void {
  action(program, program.command("status"), async () => {
    const { api, config } = await commandContext(program);
    const info = await api.appInfo();
    let authenticated = false;
    if (config.token) {
      authenticated = await api
        .operations()
        .then(() => true)
        .catch(() => false);
    }
    return { ...info, endpoint: config.baseUrl, authenticated };
  });

  action(program, program.command("doctor"), async () => {
    const { api, config } = await commandContext(program);
    const info = await api.appInfo();
    const file = configPath();
    const mode = await stat(file)
      .then((value) => value.mode & 0o777)
      .catch(() => null);
    return {
      ok: Boolean(config.token),
      app: info,
      endpoint: config.baseUrl,
      configuredToken: Boolean(config.token),
      configPath: file,
      configMode: mode === null ? null : mode.toString(8),
    };
  });

  action(program, program.command("version"), async () => ({ version }));
  program
    .command("completion")
    .argument("<shell>")
    .action((shell: string) => {
      process.stdout.write(`${completionScript(shell)}\n`);
    });

  const config = program.command("config");
  action(program, config.command("path"), async () => configPath());
  action(program, config.command("get").argument("[key]"), async (key) => {
    const value = await readConfig();
    if (key === undefined) return value;
    const parsedKey = z.enum(["baseUrl", "token", "timeout"]).parse(key);
    return value[parsedKey] ?? null;
  });
  action(
    program,
    config.command("set").argument("<key>").argument("<value>"),
    async (key, value) => {
      const parsedKey = z.enum(["baseUrl", "token", "timeout"]).safeParse(key);
      if (!parsedKey.success) {
        throw new Error("Config key must be baseUrl, token, or timeout.");
      }
      const parsedValue = StringSchema.parse(value);
      const current = await readConfig();
      if (parsedKey.data === "timeout") {
        await writeConfig({ ...current, timeout: Number(parsedValue) });
      } else {
        await writeConfig({ ...current, [parsedKey.data]: parsedValue });
      }
      return { updated: parsedKey.data, path: configPath() };
    },
  );

  const auth = program.command("auth");
  action(program, auth.command("status"), async () => {
    const { api, config: settings } = await commandContext(program);
    if (!settings.token) return { authorized: false };
    return api
      .operations()
      .then(() => ({ authorized: true }))
      .catch(() => ({ authorized: false }));
  });
  action(
    program,
    auth.command("authorize").requiredOption("--token <token>"),
    async (options) => {
      const flags = z.object({ token: StringSchema }).parse(options);
      const current = await readConfig();
      await writeConfig({
        ...current,
        token: flags.token,
      });
      return { authorized: true, path: configPath() };
    },
  );
  action(program, auth.command("revoke"), async () => {
    const current = await readConfig();
    await writeConfig({ ...current, token: undefined });
    return { authorized: false };
  });
}
