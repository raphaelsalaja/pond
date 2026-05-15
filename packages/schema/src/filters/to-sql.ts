import { and as drizzleAnd, or as drizzleOr, type SQL, sql } from "drizzle-orm";
import {
  colorNear,
  SCALAR_PROJECTIONS,
  tagsDistinctCount,
  tagsExists,
} from "./fields";
import type { Clause, ComparatorId, FieldId, Predicate, Query } from "./types";

export function buildWhere(query: Query): SQL | undefined {
  return compileClause(query) ?? undefined;
}

function compileClause(c: Clause): SQL | null {
  if (c.kind === "and") {
    const parts = c.clauses
      .map((child) => compileClause(child))
      .filter((p): p is SQL => p !== null);
    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0] ?? null;
    return drizzleAnd(...parts) ?? null;
  }
  if (c.kind === "or") {
    const parts = c.clauses
      .map((child) => compileClause(child))
      .filter((p): p is SQL => p !== null);
    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0] ?? null;
    return drizzleOr(...parts) ?? null;
  }
  return compilePredicate(c);
}

function compilePredicate(p: Predicate): SQL | null {
  const sqlExpr = compileForField(p.field, p.cmp, p.value);
  if (!sqlExpr) return null;
  return p.negate ? sql`not (${sqlExpr})` : sqlExpr;
}

function compileForField(
  field: FieldId,
  cmp: ComparatorId,
  raw: unknown,
): SQL | null {
  if (field === "tags") return tagsClause(cmp, raw);
  if (field === "color") return colorClause(cmp, raw);

  const column = SCALAR_PROJECTIONS[field];
  if (!column) return null;

  return scalarClause(column, field, cmp, raw);
}

function tagsClause(cmp: ComparatorId, raw: unknown): SQL | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const lowered = raw
    .map((v) => String(v).toLowerCase())
    .filter((v) => v.length > 0);
  if (lowered.length === 0) return null;
  const inList = sql.join(
    lowered.map((v) => sql`${v}`),
    sql`, `,
  );
  const matchExpr = sql`lower(value) in (${inList})`;
  switch (cmp) {
    case "some":
      return tagsExists(matchExpr);
    case "every":
      return sql`${tagsDistinctCount(matchExpr)} = ${lowered.length}`;
    case "none":
      return sql`not ${tagsExists(matchExpr)}`;
    default:
      return null;
  }
}

function colorClause(cmp: ComparatorId, raw: unknown): SQL | null {
  if (cmp !== "near") return null;
  if (!isObject(raw)) return null;
  const hex = String(raw.hex ?? "")
    .replace(/^#/, "")
    .toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(hex)) return null;
  const distance =
    typeof raw.distance === "number" &&
    Number.isFinite(raw.distance) &&
    raw.distance > 0
      ? raw.distance
      : 96;
  return colorNear(hex, distance);
}

function scalarClause(
  column: SQL,
  field: FieldId,
  cmp: ComparatorId,
  raw: unknown,
): SQL | null {
  switch (cmp) {
    case "eq": {
      const v = scalarValue(field, raw);
      if (v === null) return null;
      return sql`${column} = ${v}`;
    }
    case "neq": {
      const v = scalarValue(field, raw);
      if (v === null) return null;
      return sql`(${column} is null or ${column} <> ${v})`;
    }
    case "in": {
      if (!Array.isArray(raw)) return null;
      const values = raw
        .map((v) => scalarValue(field, v))
        .filter((v): v is string | number => v !== null);
      if (values.length === 0) return null;
      const inList = sql.join(
        values.map((v) => sql`${v}`),
        sql`, `,
      );
      return sql`${column} in (${inList})`;
    }
    case "nin": {
      if (!Array.isArray(raw)) return null;
      const values = raw
        .map((v) => scalarValue(field, v))
        .filter((v): v is string | number => v !== null);
      if (values.length === 0) return null;
      const inList = sql.join(
        values.map((v) => sql`${v}`),
        sql`, `,
      );
      return sql`(${column} is null or ${column} not in (${inList}))`;
    }
    case "lt":
    case "lte":
    case "gt":
    case "gte": {
      const v = numericValue(field, raw);
      if (v === null) return null;
      const op = sql.raw(
        cmp === "lt" ? "<" : cmp === "lte" ? "<=" : cmp === "gt" ? ">" : ">=",
      );
      return sql`${column} ${op} ${v}`;
    }
    case "between": {
      if (!Array.isArray(raw) || raw.length !== 2) return null;
      const lo = numericValue(field, raw[0]);
      const hi = numericValue(field, raw[1]);
      if (lo === null || hi === null) return null;
      return sql`${column} between ${lo} and ${hi}`;
    }
    case "contains": {
      const v = stringValue(raw);
      if (!v) return null;
      return sql`${column} like ${`%${v}%`}`;
    }
    case "startsWith": {
      const v = stringValue(raw);
      if (!v) return null;
      return sql`${column} like ${`${v}%`}`;
    }
    case "endsWith": {
      const v = stringValue(raw);
      if (!v) return null;
      return sql`${column} like ${`%${v}`}`;
    }
    case "exists":
      return raw === false
        ? sql`${column} is null`
        : sql`${column} is not null`;
    default:
      return null;
  }
}

function scalarValue(field: FieldId, raw: unknown): string | number | null {
  if (raw == null) return null;
  if (isDateField(field)) {
    return numericValue(field, raw);
  }
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return trimmed.toLowerCase();
  }
  return null;
}

function numericValue(field: FieldId, raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    if (isDateField(field)) {
      if (raw.startsWith("P") || raw.startsWith("-P") || raw.startsWith("+P")) {
        const ms = isoDurationToMillis(raw);
        if (ms === null) return null;
        return Date.now() + ms;
      }
      const t = Date.parse(raw);
      return Number.isFinite(t) ? t : null;
    }
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function stringValue(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

function isDateField(field: FieldId): boolean {
  return (
    field === "savedAt" || field === "publishedAt" || field === "modifiedAt"
  );
}

function isoDurationToMillis(input: string): number | null {
  const m = input.match(
    /^([+-]?)P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/,
  );
  if (!m) return null;
  const [, signRaw = "", y = "0", mo = "0", w = "0", d = "0"] = m;
  const days = Number(y) * 365 + Number(mo) * 30 + Number(w) * 7 + Number(d);
  if (!Number.isFinite(days) || days === 0) return 0;
  const sign = signRaw === "-" ? -1 : 1;
  return sign * days * 86_400_000;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
