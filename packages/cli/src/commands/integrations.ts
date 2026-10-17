import { spawn } from "node:child_process";
import { access, copyFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { Command } from "commander";
import { z } from "zod";
import { resolveWindowsCommand, windowsInvocation } from "../windows-command";
import { findPondExecutable } from "../windows-install";
import { action, commandContext } from "./shared";

export function registerIntegrationCommands(
  program: Command,
  skillSource: URL,
): void {
  const mcp = program.command("mcp");
  action(program, mcp.command("serve"), async () => {
    const executable =
      process.platform === "darwin"
        ? "/Applications/Pond.app/Contents/MacOS/Pond"
        : process.platform === "win32"
          ? (findPondExecutable() ?? "")
          : "pond-desktop";
    await access(executable).catch(() => {
      if (process.platform !== "linux")
        throw new Error("Install Pond before starting its MCP server.");
    });
    const child = spawn(executable, ["--mcp"], { stdio: "inherit" });
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", resolve);
    });
    if (code !== 0) throw new Error(`Pond MCP exited with code ${code}.`);
    return { stopped: true };
  });
  action(
    program,
    mcp.command("install").argument("<target>", "cursor, claude, or codex"),
    async (target) => {
      const commands = {
        cursor: [
          "cursor",
          [
            "--add-mcp",
            '{"name":"pond","command":"pond","args":["mcp","serve"]}',
          ],
        ],
        claude: [
          "claude",
          [
            "mcp",
            "add",
            "--scope",
            "user",
            "pond",
            "--",
            "pond",
            "mcp",
            "serve",
          ],
        ],
        codex: ["codex", ["mcp", "add", "pond", "--", "pond", "mcp", "serve"]],
      } as const;
      const parsedTarget = z
        .enum(["cursor", "claude", "codex"])
        .safeParse(target);
      if (!parsedTarget.success)
        throw new Error("Target must be cursor, claude, or codex.");
      const selected = commands[parsedTarget.data];
      let file: string = selected[0];
      let args: string[] = [...selected[1]];
      let verbatim = false;
      if (process.platform === "win32") {
        const resolved = resolveWindowsCommand(file);
        if (!resolved)
          throw new Error(
            `Could not find "${file}" on PATH. Install it and try again.`,
          );
        ({ file, args, verbatim } = windowsInvocation(resolved, args));
      }
      const child = spawn(file, args, {
        stdio: "inherit",
        windowsVerbatimArguments: verbatim,
      });
      const code = await new Promise<number | null>((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", resolve);
      });
      if (code !== 0)
        throw new Error(`MCP installation exited with code ${code}.`);
      return { installed: target };
    },
  );

  const skill = program.command("skill");
  action(
    program,
    skill.command("install").argument("<target>", "cursor, codex, or claude"),
    async (target) => {
      const roots = {
        cursor: join(homedir(), ".cursor", "skills", "pond"),
        codex: join(homedir(), ".codex", "skills", "pond"),
        claude: join(homedir(), ".claude", "skills", "pond"),
      } as const;
      const parsedTarget = z
        .enum(["cursor", "codex", "claude"])
        .safeParse(target);
      if (!parsedTarget.success)
        throw new Error("Target must be cursor, codex, or claude.");
      const destination = roots[parsedTarget.data];
      await mkdir(destination, { recursive: true });
      await copyFile(skillSource, join(destination, "SKILL.md"));
      return { installed: target, path: destination };
    },
  );

  action(program, program.command("tui"), async () => {
    if (!process.stdin.isTTY)
      throw new Error("The TUI requires an interactive terminal.");
    const { api } = await commandContext(program);
    process.stderr.write("Enter search terms. Submit an empty line to exit.\n");
    const input = createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    const results = [];
    for await (const line of input) {
      if (!line.trim()) break;
      const page = await api.query({
        query: { combinator: "and", rules: [] },
        keywords: line.trim(),
        limit: 20,
      });
      const saves = await api.saves({ ids: page.ids });
      results.push({ query: line.trim(), saves });
      process.stderr.write(
        `${saves.map((save) => `${save.id}  ${save.title ?? save.url}`).join("\n")}\n`,
      );
    }
    input.close();
    return results.at(-1) ?? { saves: [] };
  });
}
