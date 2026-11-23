import type { Command } from "commander";
import type { JsonObject } from "pond-api";
import { z } from "zod";
import { runOperation } from "../operations";
import {
  action,
  commandContext,
  JsonObjectSchema,
  OperationOptionsSchema,
  operationCommand,
  StringSchema,
  stdinLines,
} from "./shared";

export function registerAutomationCommands(program: Command): void {
  const duplicates = program.command("duplicates");
  operationCommand(
    program,
    duplicates,
    "list",
    "saves.findDuplicates",
    "List duplicate Saves",
  );
  operationCommand(
    program,
    duplicates,
    "merge",
    "saves.mergeDuplicates",
    "Merge duplicate Saves",
  );
  operationCommand(
    program,
    duplicates,
    "status",
    "saves.duplicateIndexStatus",
    "Show how many files are fingerprinted",
  );
  operationCommand(
    program,
    duplicates,
    "rebuild",
    "saves.rebuildDuplicateIndex",
    "Rebuild the file index and fingerprint every file again",
  );
  operationCommand(
    program,
    duplicates,
    "dismiss",
    "saves.dismissDuplicates",
    "Keep pairs of Saves separate in future scans",
  );

  const views = program.command("views");
  operationCommand(
    program,
    views,
    "list",
    "savedViews.list",
    "List Saved Views",
  );
  operationCommand(program, views, "run", "saves.query", "Run a Saved View");
  operationCommand(program, program, "stats", "sync.stats", "Read statistics");
  operationCommand(
    program,
    program,
    "import",
    "saves.importFiles",
    "Import files or URLs",
  );
  operationCommand(
    program,
    program,
    "export",
    "saves.exportPackage",
    "Export Saves",
  );

  action(
    program,
    program
      .command("batch")
      .requiredOption("--stdin", "Read NDJSON operations from standard input")
      .option("--dry-run")
      .option("--yes"),
    async (options) => {
      const { api } = await commandContext(program);
      const flags = OperationOptionsSchema.parse(options);
      const results = [];
      for (const line of await stdinLines()) {
        const request = z
          .object({
            operation: StringSchema,
            arguments: JsonObjectSchema.optional(),
          })
          .parse(JSON.parse(line));
        results.push(
          await runOperation(api, request.operation, request.arguments ?? {}, {
            dryRun: flags.dryRun,
            yes: flags.yes,
          }),
        );
      }
      return results;
    },
  );

  const jobs = program.command("jobs");
  action(program, jobs.command("watch").argument("<id>"), async (id) => {
    const { api, config: settings } = await commandContext(program);
    const jobId = StringSchema.parse(id);
    const deadline = Date.now() + settings.timeout;
    while (Date.now() < deadline) {
      const jobs = await api.runOperation("transferJobs.list", {});
      const entries: JsonObject[] = [];
      if (Array.isArray(jobs)) {
        for (const entry of jobs) {
          const parsed = JsonObjectSchema.safeParse(entry);
          if (parsed.success) entries.push(parsed.data);
        }
      }
      const current = entries.find((entry) => entry.id === jobId);
      if (!current) return { id: jobId, status: "complete" };
      if (
        "status" in current &&
        !["pending", "running"].includes(String(current.status))
      )
        return current;
      process.stderr.write(`Waiting for ${jobId}\n`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("The job did not finish before the timeout.");
  });
}
