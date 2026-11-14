import { z } from "zod";
import { colorNear, readColorMatch } from "./color";
import { isoDurationToMillis } from "./duration";
import { FIELD_DESCRIPTORS } from "./fields";
import type { FieldValue } from "./fields/descriptor";
import { ASPECT_TOLERANCE, parseAspectRatio } from "./fields/dims";
import { matchesSplitPost } from "./fields/post";
import type { SaveLike } from "./fields/save-like";
import type {
  Clause,
  ComparatorId,
  Predicate,
  PredicateValue,
  Query,
} from "./types";
import { isGroup } from "./types";

export type { SaveLike } from "./fields/save-like";

const Text = z.string();
const TextList = z.array(z.union([z.string(), z.number()]));
const Pair = z.tuple([
  z.union([z.string(), z.number()]),
  z.union([z.string(), z.number()]),
]);
const Numeric = z.number().refine(Number.isFinite);
const Timestamp = z.string();

export function matches(query: Query, save: SaveLike): boolean {
  return evalClause(query, save);
}

function evalClause(c: Clause, s: SaveLike): boolean {
  if (isGroup(c)) {
    if (c.rules.length === 0) return !c.not;
    const ok =
      c.combinator === "or"
        ? c.rules.some((child) => evalClause(child, s))
        : c.rules.every((child) => evalClause(child, s));
    return c.not ? !ok : ok;
  }
  const ok = evalPredicate(c, s);
  return c.negate ? !ok : ok;
}

function evalPredicate(p: Predicate, s: SaveLike): boolean {
  if (p.field === "aspect") return matchesAspect(p, s);
  if (p.field === "post") return matchesSplitPost(p.operator, p.value, s);
  const projected = FIELD_DESCRIPTORS[p.field].project(s);
  return runComparator(p.operator, projected, p.value);
}

function runComparator(
  operator: ComparatorId,
  projected: FieldValue,
  value: PredicateValue,
): boolean {
  switch (operator) {
    case "eq":
      return scalarEqual(projected, value);
    case "neq":
      return !scalarEqual(projected, value);
    case "in": {
      const list = TextList.safeParse(value);
      return list.success
        ? list.data.some((v) => scalarEqual(projected, v))
        : false;
    }
    case "nin": {
      const list = TextList.safeParse(value);
      return list.success
        ? list.data.every((v) => !scalarEqual(projected, v))
        : true;
    }
    case "lt":
      return numLike(projected) < resolveNumeric(value);
    case "lte":
      return numLike(projected) <= resolveNumeric(value);
    case "gt":
      return numLike(projected) > resolveNumeric(value);
    case "gte":
      return numLike(projected) >= resolveNumeric(value);
    case "between": {
      const pair = Pair.safeParse(value);
      if (!pair.success) return false;
      const lo = resolveNumeric(pair.data[0]);
      const hi = resolveNumeric(pair.data[1]);
      const x = numLike(projected);
      return x >= lo && x <= hi;
    }
    case "contains":
      return withText(projected, value, (text, needle) =>
        text.includes(needle.toLowerCase()),
      );
    case "startsWith":
      return withText(projected, value, (text, needle) =>
        text.startsWith(needle.toLowerCase()),
      );
    case "endsWith":
      return withText(projected, value, (text, needle) =>
        text.endsWith(needle.toLowerCase()),
      );
    case "some":
      return withLists(projected, value, (have, want) =>
        want.some((v) => have.includes(String(v).toLowerCase())),
      );
    case "every":
      return withLists(projected, value, (have, want) =>
        want.every((v) => have.includes(String(v).toLowerCase())),
      );
    case "exact":
      return withLists(projected, value, (have, want) => {
        const actual = new Set(have.map((entry) => entry.toLowerCase()));
        const expected = new Set(
          want.map((entry) => String(entry).toLowerCase()),
        );
        return (
          actual.size === expected.size &&
          [...expected].every((entry) => actual.has(entry))
        );
      });
    case "none":
      return withLists(
        projected,
        value,
        (have, want) =>
          want.every((v) => !have.includes(String(v).toLowerCase())),
        true,
      );
    case "exists":
      return value ? projected != null : projected == null;
    case "empty":
      return Array.isArray(projected)
        ? projected.length === 0
        : projected == null;
    case "near": {
      const color = readColorMatch(value);
      return Array.isArray(projected) && color !== null
        ? colorNear(color.hex, projected, color.tolerance)
        : false;
    }
  }
}

function matchesAspect(predicate: Predicate, save: SaveLike): boolean {
  const values = Array.isArray(predicate.value)
    ? predicate.value
    : [predicate.value];
  const targets = values.map((value) => {
    const text = Text.safeParse(value);
    return text.success ? parseAspectRatio(text.data) : null;
  });
  const ratio = (save.width ?? 0) / (save.height ?? 0);
  const positive =
    (save.width ?? 0) > 0 &&
    (save.height ?? 0) > 0 &&
    targets.some(
      (target) =>
        target !== null &&
        Math.abs(ratio - target) / target <= ASPECT_TOLERANCE,
    );
  return predicate.operator === "neq" || predicate.operator === "nin"
    ? !positive
    : positive;
}

function withText(
  projected: FieldValue,
  value: PredicateValue,
  run: (text: string, needle: string) => boolean,
): boolean {
  const text = Text.safeParse(projected);
  const needle = Text.safeParse(value);
  return text.success && needle.success ? run(text.data, needle.data) : false;
}

function withLists(
  projected: FieldValue,
  value: PredicateValue,
  run: (have: string[], want: ReadonlyArray<string | number>) => boolean,
  fallback = false,
): boolean {
  const want = TextList.safeParse(value);
  if (!Array.isArray(projected) || !want.success) return fallback;
  return run(projected, want.data);
}

function scalarEqual(a: FieldValue, b: PredicateValue): boolean {
  if (a == null || b == null) return false;
  const left = Text.safeParse(a);
  const right = Text.safeParse(b);
  if (left.success && right.success) {
    return left.data.toLowerCase() === right.data.toLowerCase();
  }
  return a === b;
}

function numLike(v: FieldValue): number {
  const num = Numeric.safeParse(v);
  if (num.success) return num.data;
  const text = Timestamp.safeParse(v);
  if (!text.success) return Number.NaN;
  const parsed = Date.parse(text.data);
  if (Number.isFinite(parsed)) return parsed;
  const float = Number.parseFloat(text.data);
  return Number.isFinite(float) ? float : Number.NaN;
}

function resolveNumeric(v: PredicateValue): number {
  const num = Numeric.safeParse(v);
  if (num.success) return num.data;
  const text = Timestamp.safeParse(v);
  if (!text.success) return Number.NaN;
  const raw = text.data;
  if (raw === "today") {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    return day.getTime();
  }
  if (raw.startsWith("P") || raw.startsWith("-P") || raw.startsWith("+P")) {
    const ms = isoDurationToMillis(raw);
    if (ms !== null) return Date.now() + ms;
  }
  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) return parsed;
  const float = Number.parseFloat(raw);
  return Number.isFinite(float) ? float : Number.NaN;
}
