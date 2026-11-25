import { createInterface } from "node:readline";
import type { Command } from "commander";
import { PondApi } from "pond-api";
import type { ApiSave, JsonObject, JsonValue } from "pond-api";
import { z } from "zod";
import { resolvedConfig } from "../config";
import { parseArguments, runOperation } from "../operations";
import { writeOutput } from "../output";
import type { OutputFormat, OutputOptions } from "../output";
import { ensurePondAvailable } from "../runtime";

export interface GlobalOptions {
  baseUrl?: string;
  token?: string;
  timeout?: string;
  json?: boolean;
  ndjson?: boolean;
  md?: boolean;
  table?: boolean;
  compact?: boolean;
  paths?: boolean;
  noHeader?: boolean;
  null?: boolean;
  quiet?: boolean;
}

type CommandArgument = JsonValue | undefined;

export const StringSchema = z.string();
export const StringArraySchema = z.array(StringSchema);
export const JsonObjectSchema = z.record(StringSchema, z.json());
export const OperationOptionsSchema = z.object({
  args: StringSchema.optional(),
  dryRun: z.boolean().optional(),
  yes: z.boolean().optional(),
});

function outputOptions(options: GlobalOptions): OutputOptions {
  const requested: Array<OutputFormat> = [];
  if (options.json) {
    requested.push("json");
  }
  if (options.ndjson) {
    requested.push("ndjson");
  }
  if (options.md) {
    requested.push("md");
  }
  if (options.table) {
    requested.push("table");
  }
  if (requested.length > 1) {
    throw new Error("Choose one output format.");
  }
  return {
    format: requested[0] ?? (process.stdout.isTTY ? "human" : "json"),
    compact: options.compact,
    paths: options.paths,
    noHeader: options.noHeader,
    nullDelimited: options.null,
    quiet: options.quiet,
  };
}

export async function commandContext(program: Command) {
  const globals = program.opts<GlobalOptions>();
  const config = await resolvedConfig({
    baseUrl: globals.baseUrl,
    token: globals.token,
    timeout: globals.timeout ? Number(globals.timeout) : undefined,
  });
  const api = new PondApi({
    baseUrl: config.baseUrl,
    token: config.token,
    ensureAvailable: () => ensurePondAvailable(config.baseUrl, config.timeout),
  });
  return { api, config, output: outputOptions(globals) };
}

export function action<Result>(
  program: Command,
  command: Command,
  run: (...args: Array<CommandArgument>) => Promise<Result>,
): void {
  command.action(async (...args: Array<CommandArgument>) => {
    const result = await run(...args.slice(0, -1), command.opts());
    const { output } = await commandContext(program);
    writeOutput(z.json().parse(result), output);
  });
}

export function operationCommand(
  program: Command,
  parent: Command,
  name: string,
  operation: string,
  description: string,
  idKey = "id",
  fixed: JsonObject = {},
): void {
  const command = parent
    .command(name)
    .description(description)
    .argument("[id]")
    .option("--args <json>", "Operation arguments as JSON")
    .option("--dry-run", "Create a validated preview")
    .option("--yes", "Confirm a destructive operation");
  action(program, command, async (id, options) => {
    const { api } = await commandContext(program);
    const flags = OperationOptionsSchema.parse(options);
    const args = {
      ...fixed,
      ...parseArguments(flags.args),
    };
    const parsedId = StringSchema.safeParse(id);
    if (parsedId.success) {
      args[idKey] = idKey === "ids" ? [parsedId.data] : parsedId.data;
    }
    return runOperation(api, operation, args, flags);
  });
}

export async function stdinLines(): Promise<Array<string>> {
  const values: Array<string> = [];
  const input = createInterface({ input: process.stdin });
  for await (const line of input) {
    const value = line.trim();
    if (value) values.push(value);
  }
  return values;
}

export async function waitForSaves(
  api: PondApi,
  ids: Array<string>,
  timeout: number,
): Promise<Array<ApiSave>> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const rows = await api.saves({ ids, includeDeleted: true });
    if (
      rows.length === ids.length &&
      rows.every((row) => row.status !== "ingesting")
    ) {
      return rows;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
  }
  throw new Error("Downloads did not finish before the timeout.");
}
