import type { Command } from "commander";
import { z } from "zod";
import {
  action,
  commandContext,
  operationCommand,
  StringArraySchema,
  StringSchema,
  stdinLines,
  waitForSaves,
} from "./shared";

export function registerSaveCommands(program: Command): void {
  const libraries = program.command("libraries");
  action(program, libraries.command("list"), async () => {
    const { api } = await commandContext(program);
    return api.libraries();
  });
  action(program, libraries.command("current"), async () => {
    const { api } = await commandContext(program);
    return (await api.libraries()).find((library) => library.active) ?? null;
  });
  action(
    program,
    libraries.command("switch").argument("<path>"),
    async (path) => {
      const { api } = await commandContext(program);
      return api.switchLibrary(String(path));
    },
  );

  const saves = program.command("saves");
  action(
    program,
    saves.command("list").option("--limit <number>", "Page size", "50"),
    async (options) => {
      const { api } = await commandContext(program);
      const flags = z.object({ limit: StringSchema }).parse(options);
      const page = await api.query({
        query: { combinator: "and", rules: [] },
        limit: Number(flags.limit),
        sortKey: "savedAt",
        sortDir: "desc",
        include: ["saves"],
      });
      return page.saves ?? [];
    },
  );
  action(
    program,
    saves.command("search").argument("<terms...>"),
    async (terms) => {
      const { api } = await commandContext(program);
      const keywords = StringArraySchema.parse(terms).join(" ");
      const page = await api.query({
        query: { combinator: "and", rules: [] },
        keywords,
        limit: 100,
        sortKey: "savedAt",
        sortDir: "desc",
        include: ["saves"],
      });
      return page.saves ?? [];
    },
  );
  action(program, saves.command("get").argument("<ids...>"), async (ids) => {
    const { api } = await commandContext(program);
    return api.saves({ ids: StringArraySchema.parse(ids) });
  });
  operationCommand(
    program,
    saves,
    "reveal",
    "library.openInFinder",
    "Reveal a Save",
  );
  operationCommand(
    program,
    saves,
    "copy",
    "saves.copyFiles",
    "Copy Save files",
  );
  operationCommand(
    program,
    saves,
    "update",
    "saves.bulkEdit",
    "Update Saves",
    "ids",
  );
  operationCommand(
    program,
    saves,
    "trash",
    "saves.bulkEdit",
    "Move Saves to Trash",
    "ids",
    { operation: "trash" },
  );
  operationCommand(
    program,
    saves,
    "restore",
    "saves.bulkEdit",
    "Restore Saves",
    "ids",
    { operation: "restore" },
  );
  operationCommand(
    program,
    saves,
    "purge",
    "saves.bulkEdit",
    "Permanently delete Saves",
    "ids",
    { operation: "purge" },
  );

  action(
    program,
    program
      .command("download")
      .argument("[urls...]")
      .option("--stdin", "Read URLs from standard input")
      .option("--detach", "Return after enqueueing")
      .option("--folder <id>")
      .option("--tags <tags>")
      .option("--preset <name>")
      .option("--idempotency-key <key>"),
    async (urls, options) => {
      const { api, config: settings } = await commandContext(program);
      const flags = z
        .object({
          stdin: z.boolean().optional(),
          detach: z.boolean().optional(),
          folder: StringSchema.optional(),
          tags: StringSchema.optional(),
          preset: StringSchema.optional(),
          idempotencyKey: StringSchema.optional(),
        })
        .parse(options);
      const requested = [
        ...StringArraySchema.parse(urls),
        ...(flags.stdin ? await stdinLines() : []),
      ];
      if (requested.length === 0) throw new Error("Provide at least one URL.");
      const results = [];
      for (const url of requested) {
        const result = await api.enqueue({
          url,
          trigger: "cli",
          folderId: flags.folder,
          tags: flags.tags?.split(",").filter(Boolean),
          preset: flags.preset,
          idempotencyKey: flags.idempotencyKey,
        });
        process.stderr.write(
          `${result.created ? "Enqueued" : "Reused"} ${result.id}\n`,
        );
        results.push({ url, ...result });
      }
      if (flags.detach) return results;
      const rows = await waitForSaves(
        api,
        results.map((result) => result.id),
        settings.timeout,
      );
      return results.map((result) => ({
        ...result,
        save: rows.find((row) => row.id === result.id) ?? null,
      }));
    },
  );
}
