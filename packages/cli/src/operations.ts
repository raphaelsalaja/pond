import { createInterface } from "node:readline/promises";
import type { JsonObject, JsonValue, PondApi } from "pond-api";
import { z } from "zod";

export interface OperationOptions {
  dryRun?: boolean;
  yes?: boolean;
}

async function confirm(message: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const terminal = createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  try {
    const answer = await terminal.question(`${message} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    terminal.close();
  }
}

export async function runOperation(
  api: PondApi,
  name: string,
  args: JsonObject,
  options: OperationOptions,
): Promise<JsonValue> {
  const catalog = await api.operations();
  const operation = catalog.find((entry) => entry.name === name);
  if (!operation) throw new Error(`Pond does not expose operation ${name}.`);
  if (operation.access === "read") return api.runOperation(name, args);
  const preview = await api.previewOperation(name, args);
  if (options.dryRun) return { status: "preview", ...preview, arguments: args };
  if (!options.yes && !(await confirm(`Apply ${name}?`))) {
    throw new Error(
      "Confirmation required. Use --yes for non-interactive commands.",
    );
  }
  return api.runOperation(name, args, preview.token);
}

export function parseArguments(value: string | undefined): JsonObject {
  if (!value) return {};
  const parsed = z.record(z.string(), z.json()).safeParse(JSON.parse(value));
  if (!parsed.success) throw new Error("--args must contain a JSON object.");
  return parsed.data;
}
