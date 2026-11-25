import type { JsonObject, JsonValue } from "pond-api";
import { z } from "zod";

export type OutputFormat = "human" | "json" | "ndjson" | "md" | "table";

export interface OutputOptions {
  format: OutputFormat;
  compact?: boolean;
  noHeader?: boolean;
  nullDelimited?: boolean;
  paths?: boolean;
  quiet?: boolean;
}

const JsonObjectSchema = z.record(z.string(), z.json());
const JsonContainerSchema = z.union([
  z.null(),
  z.array(z.json()),
  JsonObjectSchema,
]);

function records(value: JsonValue): Array<JsonValue> {
  return Array.isArray(value) ? value : [value];
}

function pathValues(value: JsonValue): Array<string> {
  const text = z.string().safeParse(value);
  if (text.success) return [text.data];
  if (Array.isArray(value)) return value.flatMap(pathValues);
  const object = JsonObjectSchema.safeParse(value);
  if (object.success) {
    return ["path", "filePath", "url"].flatMap((key) => {
      const candidate = object.data[key];
      return candidate === undefined ? [] : pathValues(candidate);
    });
  }
  return [];
}

function tabularRows(value: JsonValue): Array<JsonObject> {
  return records(value).flatMap((entry) => {
    const parsed = JsonObjectSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

function formatCell(cell: JsonValue | undefined): string {
  const container = JsonContainerSchema.safeParse(cell);
  return container.success
    ? JSON.stringify(container.data)
    : String(cell ?? "");
}

function table(value: JsonValue, header: boolean): string {
  const rows = tabularRows(value);
  if (rows.length === 0) return String(value ?? "");
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const lines = rows.map((row) =>
    columns.map((column) => formatCell(row[column])).join("\t"),
  );
  return header ? [columns.join("\t"), ...lines].join("\n") : lines.join("\n");
}

function markdownCell(cell: JsonValue | undefined): string {
  return formatCell(cell)
    .replaceAll("|", String.raw`\|`)
    .replaceAll("\n", " ");
}

function markdown(value: JsonValue): string {
  const rows = tabularRows(value);
  if (rows.length === 0) {
    const text = z.string().safeParse(value);
    return text.success
      ? text.data
      : `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
  }
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [
    `| ${columns.join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...rows.map(
      (row) =>
        `| ${columns.map((column) => markdownCell(row[column])).join(" | ")} |`,
    ),
  ].join("\n");
}

export function formatOutput(value: JsonValue, options: OutputOptions): string {
  const separator = options.nullDelimited ? "\0" : "\n";
  if (options.paths) {
    return `${pathValues(value).join(separator)}${separator}`;
  }
  if (options.format === "ndjson") {
    return `${records(value)
      .map((data) => JSON.stringify({ schemaVersion: "1", data }))
      .join(separator)}${separator}`;
  }
  if (options.format === "json") {
    return `${JSON.stringify(
      { schemaVersion: "1", data: value },
      null,
      options.compact ? undefined : 2,
    )}${separator}`;
  }
  if (options.format === "md") {
    return `${markdown(value)}${separator}`;
  }
  if (options.format === "table") {
    return `${table(value, !options.noHeader)}${separator}`;
  }
  const text = z.string().safeParse(value);
  if (text.success) return `${text.data}${separator}`;
  return `${JSON.stringify(value, null, options.compact ? undefined : 2)}${separator}`;
}

export function writeOutput(
  value: JsonValue,
  options: OutputOptions,
  stream: Pick<NodeJS.WriteStream, "write"> = process.stdout,
): void {
  if (!options.quiet) stream.write(formatOutput(value, options));
}
