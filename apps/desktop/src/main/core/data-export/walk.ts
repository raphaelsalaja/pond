import type { JsonObject, JsonValue } from "@pond/schema/json";
import { z } from "zod";

const JsonText = z.string().transform((text, context) => {
  try {
    return z.json().parse(JSON.parse(text));
  } catch {
    context.addIssue({ code: "custom", message: "Invalid JSON" });
    return z.NEVER;
  }
});

export function parseJsonText(text: string): JsonValue | null {
  const parsed = JsonText.safeParse(text);
  return parsed.success ? parsed.data : null;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function walkJson(
  root: JsonValue,
  visit: (value: JsonObject, keys: Array<string>) => void,
): void {
  const stack: Array<{ value: JsonValue; keys: Array<string> }> = [
    { value: root, keys: [] },
  ];
  while (stack.length > 0) {
    const next = stack.pop();
    if (!next) break;
    const { value, keys } = next;
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        const child = value[index];
        if (child !== undefined) {
          stack.push({ value: child, keys: [...keys, String(index)] });
        }
      }
      continue;
    }
    if (!isJsonObject(value)) continue;
    visit(value, keys);
    const entries = Object.entries(value);
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (entry) stack.push({ value: entry[1], keys: [...keys, entry[0]] });
    }
  }
}

const TEXT = z.string().trim().min(1);
const EPOCH = z.number().finite().positive();
const SPACED_UTC = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

export function exportText(value: JsonValue | undefined): string | null {
  const parsed = TEXT.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Seconds, milliseconds, or an ISO-ish string, whichever the exporter wrote. */
export function exportDate(value: JsonValue | undefined): Date | null {
  const epoch = EPOCH.safeParse(value);
  if (epoch.success) {
    return new Date(epoch.data < 1e11 ? epoch.data * 1000 : epoch.data);
  }
  const text = exportText(value);
  if (!text) return null;
  const iso = SPACED_UTC.test(text) ? `${text.replace(" ", "T")}Z` : text;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}
