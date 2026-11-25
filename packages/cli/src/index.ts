import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { Command, CommanderError } from "commander";
import { PondApiError } from "pond-api";
import { z } from "zod";
import { registerCommands } from "./commands";

const manifest = z
  .object({ version: z.string() })
  .parse(
    JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ),
  );

export function createProgram(): Command {
  const program = new Command()
    .name("pond")
    .description("Work with your local Pond Library")
    .version(manifest.version)
    .showHelpAfterError()
    .addHelpText(
      "after",
      "\nPond is free and open source. Support it at https://buymeacoffee.com/raphaelsalaja",
    )
    .allowExcessArguments(false)
    .option("--base-url <url>", "Local API endpoint")
    .option("--token <token>", "Scoped Local API token")
    .option("--timeout <milliseconds>", "Readiness and wait timeout")
    .option("--json", "Versioned JSON output")
    .option("--ndjson", "Versioned newline-delimited JSON output")
    .option("--md", "Markdown output")
    .option("--table", "Tabular output")
    .option("--compact", "Compact structured output")
    .option("--paths", "Print paths and URLs only")
    .option("--no-header", "Omit table headers")
    .option("--null", "Use null delimiters")
    .option("--quiet", "Suppress stdout");
  program.exitOverride();
  registerCommands(program, manifest.version);
  return program;
}

function exitCode(error: Error): number {
  if (error instanceof CommanderError) return error.exitCode;
  if (error instanceof PondApiError) {
    if (error.kind === "connection") return 2;
    if (error.kind === "authentication") return 3;
    if (error.kind === "not-found") return 4;
    if (error.kind === "conflict") return 5;
    return 7;
  }
  if (
    error instanceof Error &&
    /cancel|confirmation required/i.test(error.message)
  ) {
    return 6;
  }
  return 7;
}

export async function main(argv = process.argv): Promise<number> {
  try {
    await createProgram().parseAsync(argv);
    return 0;
  } catch (error) {
    if (
      error instanceof CommanderError &&
      ["commander.helpDisplayed", "commander.version"].includes(error.code)
    ) {
      return 0;
    }
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    return exitCode(error instanceof Error ? error : new Error(String(error)));
  }
}

if (
  process.argv[1] &&
  realpathSync(resolve(process.argv[1])) === import.meta.filename
) {
  process.exitCode = await main();
}
