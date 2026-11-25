import { z } from "zod";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | Array<JsonValue>
  | JsonObject;

export interface JsonObject {
  [key: string]: JsonValue;
}

const PRIMITIVE_TAGS = new Set([
  "[object String]",
  "[object Number]",
  "[object Boolean]",
]);

const PlainRecordSchema = z.record(z.string(), z.unknown());

/** Entries may be `undefined`, which structured clones keep and JSON serialization drops. */
export function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    PRIMITIVE_TAGS.has(Object.prototype.toString.call(value))
  ) {
    return true;
  }
  let entries: Array<unknown>;
  if (Array.isArray(value)) {
    entries = value;
  } else {
    const record = PlainRecordSchema.safeParse(value);
    if (!record.success) {
      return false;
    }
    entries = Object.values(record.data);
  }
  return entries.every((entry) => entry === undefined || isJsonValue(entry));
}
