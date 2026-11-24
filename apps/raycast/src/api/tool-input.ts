import type { ApiCursor } from "pond-api";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Dates without a time are read as UTC midnight so the same prompt gives the same range anywhere. */
export function parseSavedSince(value: string | undefined): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  const time = Date.parse(DATE_ONLY.test(trimmed) ? `${trimmed}T00:00:00Z` : trimmed);
  if (Number.isNaN(time) || time < 0) {
    throw new Error(`"${trimmed}" isn't a date. Use a format like 2026-10-01.`);
  }
  return time;
}

export function encodeCursor(cursor: ApiCursor | null): string | null {
  return cursor ? Buffer.from(JSON.stringify(cursor)).toString("base64url") : null;
}

function isOptionalNumber(field: unknown): field is number | undefined {
  return field === undefined || typeof field === "number";
}

function isOptionalString(field: unknown): field is string | undefined {
  return field === undefined || typeof field === "string";
}

function isCursor(cursor: unknown): cursor is ApiCursor {
  return (
    typeof cursor === "object" &&
    cursor !== null &&
    "value" in cursor &&
    (cursor.value === null || typeof cursor.value === "string" || typeof cursor.value === "number") &&
    "id" in cursor &&
    typeof cursor.id === "string" &&
    "libraryId" in cursor &&
    typeof cursor.libraryId === "string" &&
    isOptionalNumber("rank" in cursor ? cursor.rank : undefined) &&
    isOptionalNumber("revision" in cursor ? cursor.revision : undefined) &&
    isOptionalString("sortSignature" in cursor ? cursor.sortSignature : undefined)
  );
}

/** Pond validates the cursor's position itself; this only checks its shape. */
export function decodeCursor(value: string | undefined): ApiCursor | undefined {
  if (!value) {
    return undefined;
  }
  let cursor: unknown;
  try {
    cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    cursor = undefined;
  }
  if (!isCursor(cursor)) {
    throw new Error("That cursor isn't valid. Run the search again without a cursor.");
  }
  return cursor;
}

export function clampLimit(value: number | undefined, fallback: number, max: number): number {
  if (!value || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(1, Math.round(value)), max);
}
