import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { registerCommands } from "./commands";
import { completionScript } from "./commands/core";

function commandPaths(command: Command, parent = ""): string[] {
  return command.commands.flatMap((child) => {
    const path = parent ? `${parent} ${child.name()}` : child.name();
    return [path, ...commandPaths(child, path)];
  });
}

function commandAt(program: Command, path: string): Command {
  return path.split(" ").reduce((parent, name) => {
    const command = parent.commands.find((child) => child.name() === name);
    if (!command) throw new Error(`Missing command ${path}.`);
    return command;
  }, program);
}

describe("registerCommands", () => {
  it("registers the public command hierarchy in order", () => {
    const program = new Command();
    registerCommands(program, "1.2.3");

    expect(commandPaths(program)).toEqual([
      "status",
      "doctor",
      "version",
      "completion",
      "config",
      "config path",
      "config get",
      "config set",
      "auth",
      "auth status",
      "auth authorize",
      "auth revoke",
      "libraries",
      "libraries list",
      "libraries current",
      "libraries switch",
      "saves",
      "saves list",
      "saves search",
      "saves get",
      "saves reveal",
      "saves copy",
      "saves update",
      "saves trash",
      "saves restore",
      "saves purge",
      "download",
      "folders",
      "folders list",
      "folders create",
      "folders rename",
      "folders move",
      "folders delete",
      "tags",
      "tags list",
      "tags create",
      "tags rename",
      "tags merge",
      "tags delete",
      "sources",
      "sources list",
      "sources accounts",
      "sources connect",
      "sources disconnect",
      "sync",
      "sync start",
      "sync status",
      "sync cancel",
      "sync history",
      "downloads",
      "downloads list",
      "downloads status",
      "downloads cancel",
      "conversions",
      "conversions start",
      "conversions status",
      "conversions cancel",
      "duplicates",
      "duplicates list",
      "duplicates merge",
      "duplicates status",
      "duplicates rebuild",
      "duplicates dismiss",
      "views",
      "views list",
      "views run",
      "stats",
      "import",
      "export",
      "batch",
      "jobs",
      "jobs watch",
      "agent",
      "agent ask",
      "agent chats",
      "agent chats list",
      "agent chats export",
      "library",
      "library verify",
      "library reindex",
      "library backup",
      "library restore",
      "library migrate",
      "trash",
      "trash empty",
      "schema",
      "operations",
      "operations list",
      "operations get",
      "operations run",
      "mcp",
      "mcp serve",
      "mcp install",
      "skill",
      "skill install",
      "tui",
    ]);
  });

  it("preserves command arguments and options", () => {
    const program = new Command();
    registerCommands(program, "1.2.3");

    expect(commandAt(program, "saves list").options).toMatchObject([
      { flags: "--limit <number>", defaultValue: "50" },
    ]);
    expect(
      commandAt(program, "download").options.map((option) => option.flags),
    ).toEqual([
      "--stdin",
      "--detach",
      "--folder <id>",
      "--tags <tags>",
      "--preset <name>",
      "--idempotency-key <key>",
    ]);
    expect(
      commandAt(program, "saves trash").options.map((option) => option.flags),
    ).toEqual(["--args <json>", "--dry-run", "--yes"]);
    expect(
      commandAt(program, "operations run").options.map(
        (option) => option.flags,
      ),
    ).toEqual(["--args <json>", "--dry-run", "--yes"]);
  });
});

describe("completionScript", () => {
  const commands =
    "status doctor version completion config auth libraries saves folders tags sources sync downloads conversions agent mcp skill library trash schema";

  it("returns fish completions", () => {
    expect(completionScript("fish")).toBe(
      `complete -c pond -f -a '${commands}'`,
    );
  });

  it("returns bash completions", () => {
    expect(completionScript("bash")).toBe(`complete -W '${commands}' pond`);
  });

  it("returns zsh completions for other shells", () => {
    expect(completionScript("zsh")).toBe(
      `#compdef pond\n_arguments '1:command:(${commands})'`,
    );
  });
});
