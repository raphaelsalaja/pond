import {
  and as drizzleAnd,
  or as drizzleOr,
  type SQL,
  type SQLWrapper,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { saves } from "../db";
import { readColorMatch } from "./color";
import { isoDurationToMillis } from "./duration";
import { FIELD_DESCRIPTORS } from "./fields";
import { ASPECT_TOLERANCE, parseAspectRatio } from "./fields/dims";
import { splitPostClause } from "./fields/post";
import {
  folderExists,
  jsonArrayDistinctCount,
  jsonArrayEmpty,
  jsonArrayExists,
} from "./fields/sql";
import type {
  Clause,
  ComparatorId,
  FieldId,
  Predicate,
  PredicateValue,
  Query,
} from "./types";
import { isGroup } from "./types";

export function buildWhere(query: Query): SQL | undefined {
  if (query.rules.length === 0 && !query.not) return undefined;
  return compileClause(query);
}

function compileClause(c: Clause): SQL {
  if (isGroup(c)) {
    const parts = c.rules.map(compileClause);
    if (parts.length === 0) return c.not ? sql`0` : sql`1`;
    const combined =
      c.combinator === "or" ? drizzleOr(...parts) : drizzleAnd(...parts);
    return c.not ? sql`not (${combined})` : (combined ?? sql`1`);
  }
  return compilePredicate(c);
}

function compilePredicate(p: Predicate): SQL {
  if (!FIELD_DESCRIPTORS[p.field]?.comparators.includes(p.operator)) {
    throw new Error(`Unsupported filter: ${p.field} ${p.operator}`);
  }
  const sqlExpr = compileForField(p.field, p.operator, p.value);
  if (!sqlExpr) throw new Error(`Invalid filter: ${p.field} ${p.operator}`);
  const boolean =
    p.field === "post" ? sqlExpr : sql`coalesce((${sqlExpr}), 0)`;
  return p.negate ? sql`not (${boolean})` : boolean;
}

function compileForField(
  field: FieldId,
  operator: ComparatorId,
  raw: PredicateValue,
): SQL | null {
  if (field === "color") {
    const color = readColorMatch(raw);
    return color && operator === "near"
      ? sql`pond_color_near(${saves.dominantColors}, ${color.hex}, ${color.tolerance}) = 1`
      : null;
  }
  if (field === "aspect") return aspectClause(operator, raw);
  if (field === "tags") return jsonArrayClause(saves.tags, operator, raw);
  if (field === "folder") return folderClause(operator, raw);
  if (field === "list") return jsonArrayClause(saves.listKinds, operator, raw);
  if (field === "format") return fileFormatClause(operator, raw);
  if (field === "post") return splitPostClause(operator, raw);

  const column = FIELD_DESCRIPTORS[field].sqlProjection?.() ?? null;
  if (!column) return null;

  return scalarClause(column, field, operator, raw);
}

function folderClause(operator: ComparatorId, raw: PredicateValue): SQL | null {
  if (operator === "empty") return folderExists([]);
  if (!Array.isArray(raw)) return null;
  const ids = [
    ...new Set(
      raw.map((v) => String(v).toLowerCase()).filter((v) => v.length > 0),
    ),
  ];
  if (ids.length === 0)
    return operator === "exact"
      ? folderExists([])
      : operator === "some"
        ? sql`0`
        : sql`1`;
  const matches = sql`(
    select count(distinct lower(folder_id)) from save_folders
    where save_id = ${saves.id} and lower(folder_id) in (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    )})
  ) = ${ids.length}`;
  switch (operator) {
    case "some":
      return sql`exists (select 1 from save_folders where save_id = ${saves.id} and lower(folder_id) in (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )}))`;
    case "every":
      return matches;
    case "exact":
      return sql`${matches} and (select count(distinct lower(folder_id)) from save_folders where save_id = ${saves.id}) = ${ids.length}`;
    case "none":
      return sql`not (${folderClause("some", ids)})`;
    default:
      return null;
  }
}

function fileFormatClause(
  operator: ComparatorId,
  raw: PredicateValue,
): SQL | null {
  if (operator === "empty") return sql`json_array_length(${saves.files}) = 0`;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const extensions = [
    ...new Set(
      raw
        .map((value) => String(value).toLowerCase().replace(/^\./, ""))
        .filter((value) => /^[a-z0-9][a-z0-9+_-]*$/.test(value)),
    ),
  ];
  if (extensions.length === 0) return null;
  const matches = extensions.map(
    (extension) =>
      sql`exists (
        select 1 from json_each(${saves.files})
        where lower(json_extract(value, '$.path')) like ${`%.${extension}`}
      )`,
  );
  const any = drizzleOr(...matches);
  if (!any) return null;
  if (operator === "some") return any;
  if (operator === "every") return drizzleAnd(...matches) ?? null;
  if (operator === "none") return sql`not (${any})`;
  return null;
}

function jsonArrayClause(
  column: SQLWrapper,
  operator: ComparatorId,
  raw: PredicateValue,
): SQL | null {
  if (operator === "empty") return jsonArrayEmpty(column);
  if (!Array.isArray(raw)) return null;
  const lowered = [
    ...new Set(
      raw.map((v) => String(v).toLowerCase()).filter((v) => v.length > 0),
    ),
  ];
  if (lowered.length === 0) {
    return operator === "exact"
      ? jsonArrayEmpty(column)
      : operator === "some"
        ? sql`0`
        : sql`1`;
  }
  const inList = sql.join(
    lowered.map((v) => sql`${v}`),
    sql`, `,
  );
  const matchExpr = sql`lower(value) in (${inList})`;
  switch (operator) {
    case "some":
      return jsonArrayExists(column, matchExpr);
    case "every":
      return sql`${jsonArrayDistinctCount(column, matchExpr)} = ${lowered.length}`;
    case "exact":
      return sql`${jsonArrayDistinctCount(column, matchExpr)} = ${lowered.length} and ${jsonArrayDistinctCount(column, sql`1`)} = ${lowered.length}`;
    case "none":
      return sql`not ${jsonArrayExists(column, matchExpr)}`;
    default:
      return null;
  }
}

function aspectClause(operator: ComparatorId, raw: PredicateValue): SQL | null {
  const values = Array.isArray(raw) ? raw : [raw];
  const ratios = values.map((value) => {
    const parsed = z.string().safeParse(value);
    return parsed.success ? parseAspectRatio(parsed.data) : null;
  });
  if (!ratios.length || ratios.some((ratio) => ratio === null)) return null;
  const comparisons = ratios.map(
    (ratio) =>
      sql`abs((cast(${saves.width} as real) / ${saves.height}) - ${ratio}) / ${ratio} <= ${ASPECT_TOLERANCE}`,
  );
  const positive = sql`coalesce((${saves.width} > 0 and ${saves.height} > 0 and (${drizzleOr(...comparisons)})), 0)`;
  return operator === "neq" || operator === "nin"
    ? sql`not (${positive})`
    : positive;
}

function scalarClause(
  column: SQL,
  field: FieldId,
  operator: ComparatorId,
  raw: PredicateValue,
): SQL | null {
  switch (operator) {
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
        operator === "lt"
          ? "<"
          : operator === "lte"
            ? "<="
            : operator === "gt"
              ? ">"
              : ">=",
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
      return sql`${column} like ${`%${escapeLike(v)}%`} escape '\\'`;
    }
    case "startsWith": {
      const v = stringValue(raw);
      if (!v) return null;
      return sql`${column} like ${`${escapeLike(v)}%`} escape '\\'`;
    }
    case "endsWith": {
      const v = stringValue(raw);
      if (!v) return null;
      return sql`${column} like ${`%${escapeLike(v)}`} escape '\\'`;
    }
    case "exists":
      return raw === false
        ? sql`${column} is null`
        : sql`${column} is not null`;
    default:
      return null;
  }
}

const FiniteNumber = z.number().refine(Number.isFinite);
const Text = z.string();

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function scalarValue(
  field: FieldId,
  raw: PredicateValue,
): string | number | null {
  if (raw == null) return null;
  if (isDateField(field)) return numericValue(field, raw);
  const num = FiniteNumber.safeParse(raw);
  if (num.success) return num.data;
  return stringValue(raw);
}

function numericValue(field: FieldId, raw: PredicateValue): number | null {
  const num = FiniteNumber.safeParse(raw);
  if (num.success) return num.data;
  const text = Text.safeParse(raw);
  if (!text.success) return null;

  if (!isDateField(field)) {
    const parsed = Number.parseFloat(text.data);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const value = text.data;
  if (value === "today") {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    return day.getTime();
  }
  if (
    value.startsWith("P") ||
    value.startsWith("-P") ||
    value.startsWith("+P")
  ) {
    const ms = isoDurationToMillis(value);
    return ms === null ? null : Date.now() + ms;
  }
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : null;
}

function stringValue(raw: PredicateValue): string | null {
  const text = Text.safeParse(raw);
  if (!text.success) return null;
  const trimmed = text.data.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function isDateField(field: FieldId): boolean {
  return (
    field === "savedAt" || field === "publishedAt" || field === "modifiedAt"
  );
}
