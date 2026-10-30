import { COLOR_PRESETS } from "@pond/schema/filters/color";
import { FIELD_META } from "@pond/schema/filters/meta";
import type {
  ComparatorId,
  FieldId,
  Predicate,
  Query,
} from "@pond/schema/filters/types";
import { isPredicate } from "@pond/schema/filters/types";
import { canonicalListKind } from "@pond/schema/list-kinds";
import { z } from "zod";
import {
  displayAccountToken,
  resolveAccountToken,
} from "@/features/search/lib/account-aliases";
import { predicateIsActive } from "@/features/search/lib/filter-helpers";

interface DatePreset {
  slug: string;
  label: string;
  iso: string;
}

export const DATE_PRESETS: readonly DatePreset[] = [
  { slug: "today", label: "Today", iso: "today" },
  { slug: "past-3-days", label: "Past 3 days", iso: "-P3D" },
  { slug: "past-week", label: "Past week", iso: "-P1W" },
  { slug: "past-month", label: "Past month", iso: "-P1M" },
  { slug: "past-3-months", label: "Past 3 months", iso: "-P3M" },
  { slug: "past-year", label: "Past year", iso: "-P1Y" },
];

interface TokenFieldSpec {
  field: FieldId;
  keys: readonly string[];
}

export const TOKEN_FIELDS: readonly TokenFieldSpec[] = [
  { field: "title", keys: ["name", "title"] },
  { field: "tags", keys: ["tag", "tags"] },
  { field: "folder", keys: ["folder", "folders"] },
  { field: "list", keys: ["list"] },
  { field: "source", keys: ["source", "from"] },
  { field: "importedFrom", keys: ["imported", "importedfrom"] },
  { field: "type", keys: ["type", "kind"] },
  { field: "format", keys: ["format", "extension", "ext"] },
  { field: "fileCount", keys: ["files", "filecount"] },
  { field: "duration", keys: ["duration", "length"] },
  { field: "fontFamily", keys: ["family", "fontfamily"] },
  { field: "bpm", keys: ["bpm"] },
  { field: "shape", keys: ["shape"] },
  { field: "aspect", keys: ["aspect", "ratio"] },
  { field: "creator", keys: ["by", "creator", "author"] },
  { field: "account", keys: ["account"] },
  { field: "note", keys: ["note", "notes"] },
  { field: "caption", keys: ["caption", "captions"] },
  { field: "transcript", keys: ["transcript", "transcripts"] },
  { field: "sensitiveContent", keys: ["sensitive"] },
  { field: "color", keys: ["color", "colour"] },
  { field: "savedAt", keys: ["saved", "savedat"] },
  { field: "publishedAt", keys: ["published", "publishedat"] },
  { field: "modifiedAt", keys: ["modified", "modifiedat"] },
  { field: "takenAt", keys: ["taken", "takenat"] },
  { field: "rating", keys: ["rating", "star", "stars"] },
  { field: "fileSize", keys: ["size", "filesize"] },
  { field: "width", keys: ["width"] },
  { field: "height", keys: ["height"] },
  { field: "url", keys: ["url"] },
];

const KEY_TO_FIELD = new Map<string, FieldId>();
const FIELD_TO_KEY = new Map<FieldId, string>();
for (const spec of TOKEN_FIELDS) {
  FIELD_TO_KEY.set(spec.field, spec.keys[0] ?? spec.field);
  for (const key of spec.keys) KEY_TO_FIELD.set(key, spec.field);
}

export function canonicalKey(field: FieldId): string {
  return FIELD_TO_KEY.get(field) ?? field;
}

export function fieldForKey(key: string): FieldId | undefined {
  return KEY_TO_FIELD.get(key.toLowerCase());
}

const DATE_SLUG_TO_ISO = new Map(DATE_PRESETS.map((d) => [d.slug, d.iso]));
const COLOR_LABEL_TO_HEX = new Map(
  COLOR_PRESETS.map((c) => [c.label.toLowerCase(), c.hex.toLowerCase()]),
);

interface RawToken {
  text: string;
  start: number;
  end: number;
}

function tokenize(input: string): RawToken[] {
  const tokens: RawToken[] = [];
  const n = input.length;
  let i = 0;
  while (i < n) {
    while (i < n && /\s/.test(input[i] ?? "")) i += 1;
    if (i >= n) break;
    const start = i;
    let inQuote = false;
    while (i < n) {
      const ch = input[i] ?? "";
      if (ch === '"') inQuote = !inQuote;
      else if (!inQuote && /\s/.test(ch)) break;
      i += 1;
    }
    tokens.push({ text: input.slice(start, i), start, end: i });
  }
  return tokens;
}

const OP_SYMBOLS = [":", ">", ">=", "<", "<="] as const;

type OpSymbol = (typeof OP_SYMBOLS)[number];

interface FieldToken {
  field: FieldId;
  op: OpSymbol;
  rawValue: string;
  negate: boolean;
}

const FIELD_TOKEN_RE = /^(-?)([a-zA-Z]+)(>=|<=|:|>|<)(.*)$/s;

function matchFieldToken(token: string): FieldToken | null {
  const m = FIELD_TOKEN_RE.exec(token);
  if (!m) return null;
  const field = fieldForKey(m[2] ?? "");
  const op = OP_SYMBOLS.find((symbol) => symbol === m[3]);
  if (!field || !op) return null;
  return { field, op, rawValue: m[4] ?? "", negate: m[1] === "-" };
}

function unquote(value: string): string {
  const t = value.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1);
  }
  return t;
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map(unquote)
    .filter((part) => part.length > 0);
}

function toNumber(value: string): number | null {
  const n = Number(value.trim());
  return Number.isFinite(n) ? n : null;
}

function toDateValue(value: string): string | null {
  const t = value.trim();
  const iso = DATE_SLUG_TO_ISO.get(t.toLowerCase());
  if (iso) return iso;
  if (/^[+-]?P/i.test(t)) return t;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t;
  return null;
}

function toColorValue(value: string): string | null {
  const t = value.trim();
  const short = /^#?([0-9a-f]{3})$/i.exec(t);
  if (short) {
    const [r, g, b] = short[1] ?? "";
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (/^#?[0-9a-f]{6}$/i.test(t)) return t.startsWith("#") ? t : `#${t}`;
  return COLOR_LABEL_TO_HEX.get(t.toLowerCase()) ?? null;
}

function numericOperator(op: OpSymbol, negate: boolean): ComparatorId {
  switch (op) {
    case ">":
      return "gt";
    case ">=":
      return "gte";
    case "<":
      return "lt";
    case "<=":
      return "lte";
    default:
      return negate ? "neq" : "eq";
  }
}

function dateOperator(op: OpSymbol): ComparatorId {
  switch (op) {
    case ">":
      return "gt";
    case ">=":
      return "gte";
    case "<":
      return "lt";
    case "<=":
      return "lte";
    default:
      return "gte";
  }
}

const OPTIONAL_FALSE = new Set(["without", "false", "no", "none", "empty"]);

function buildPredicate(token: FieldToken): Predicate | null {
  const { field, op, negate } = token;
  const type = FIELD_META[field].type;
  const raw = token.rawValue.trim();

  switch (type) {
    case "enum": {
      const [first, ...rest] = splitList(raw).map((v) =>
        field === "account" ? resolveAccountToken(v) : v.toLowerCase(),
      );
      if (first === undefined) return null;
      if (rest.length === 0) {
        return { field, operator: negate ? "neq" : "eq", value: first };
      }
      return {
        field,
        operator: negate ? "nin" : "in",
        value: [first, ...rest],
      };
    }
    case "stringArray": {
      const list =
        field === "list"
          ? splitList(raw).flatMap((v) => {
              const kind = canonicalListKind(v);
              return kind ? [kind] : [];
            })
          : splitList(raw).map((v) => v.toLowerCase());
      if (list.length === 0) return null;
      return { field, operator: negate ? "none" : "some", value: list };
    }
    case "optional": {
      if (OPTIONAL_FALSE.has(raw.toLowerCase())) {
        return { field, operator: "exists", value: negate };
      }
      if (raw.toLowerCase() === "with" || raw.toLowerCase() === "true") {
        return { field, operator: "exists", value: !negate };
      }
      if (!raw) return { field, operator: "exists", value: !negate };
      return { field, operator: "contains", value: raw.toLowerCase() };
    }
    case "string": {
      if (!raw) return null;
      return {
        field,
        operator: "contains",
        value: raw.toLowerCase(),
      };
    }
    case "color": {
      const hex = toColorValue(raw);
      if (!hex) return null;
      return { field, operator: "near", value: hex };
    }
    case "number": {
      if (!raw) return null;
      if (raw.includes("..")) {
        const [a, b] = raw.split("..");
        const lo = toNumber(a ?? "");
        const hi = toNumber(b ?? "");
        if (lo === null && hi === null) return null;
        return { field, operator: "between", value: [lo ?? 0, hi ?? 0] };
      }
      const n = toNumber(raw);
      if (n === null) return null;
      return { field, operator: numericOperator(op, negate), value: n };
    }
    case "date": {
      if (!raw) return null;
      if (raw.includes("..")) {
        const [a, b] = raw.split("..");
        const lo = toDateValue(a ?? "");
        const hi = toDateValue(b ?? "");
        if (!lo && !hi) return null;
        return { field, operator: "between", value: [lo ?? "", hi ?? ""] };
      }
      const dv = toDateValue(raw);
      if (!dv) return null;
      return { field, operator: dateOperator(op), value: dv };
    }
    default:
      return null;
  }
}

interface ParsedSearch {
  predicates: Predicate[];
  text: string;
}

export function parseSearchInput(input: string): ParsedSearch {
  const predicates: Predicate[] = [];
  const free: string[] = [];

  for (const token of tokenize(input)) {
    const matched = matchFieldToken(token.text);
    if (!matched) {
      free.push(token.text);
      continue;
    }
    const predicate = buildPredicate(matched);
    if (predicate && predicateIsActive(predicate)) {
      predicates.push(predicate);
      continue;
    }
    if (matched.rawValue.trim() === "") continue;
    free.push(token.text);
  }

  return { predicates, text: free.join(" ") };
}

function quoteIfNeeded(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value;
}

function operatorSymbol(operator: ComparatorId): OpSymbol {
  switch (operator) {
    case "gt":
      return ">";
    case "gte":
      return ">=";
    case "lt":
      return "<";
    case "lte":
      return "<=";
    default:
      return ":";
  }
}

export function serializePredicate(predicate: Predicate): string | null {
  const key = canonicalKey(predicate.field);
  const type = FIELD_META[predicate.field].type;
  const { operator, value } = predicate;

  switch (type) {
    case "enum": {
      const negate = operator === "neq" || operator === "nin";
      const list = (Array.isArray(value) ? value : [value]).map((v) =>
        quoteIfNeeded(
          predicate.field === "account"
            ? displayAccountToken(String(v))
            : String(v),
        ),
      );
      if (list.length === 0) return null;
      return `${negate ? "-" : ""}${key}:${list.join(",")}`;
    }
    case "stringArray": {
      const negate = operator === "none";
      const list = (Array.isArray(value) ? value : [value]).map((v) =>
        quoteIfNeeded(String(v)),
      );
      if (list.length === 0) return null;
      return `${negate ? "-" : ""}${key}:${list.join(",")}`;
    }
    case "optional": {
      if (operator === "contains") {
        const text = String(value ?? "").trim();
        if (!text) return null;
        return `${key}:${quoteIfNeeded(text)}`;
      }
      if (operator !== "exists") return null;
      return `${key}:${value === false ? "without" : "with"}`;
    }
    case "color": {
      const parsed = z.string().safeParse(value);
      if (!parsed.success) return null;
      const hex = parsed.data;
      if (!hex) return null;
      const preset = COLOR_PRESETS.find(
        (c) => c.hex.toLowerCase() === hex.toLowerCase(),
      );
      return `${key}:${preset ? preset.label.toLowerCase() : hex}`;
    }
    case "number": {
      if (operator === "between" && Array.isArray(value)) {
        return `${key}:${value[0]}..${value[1]}`;
      }
      const negate = operator === "neq";
      return `${negate ? "-" : ""}${key}${operatorSymbol(operator)}${value}`;
    }
    case "date": {
      if (operator === "between" && Array.isArray(value)) {
        return `${key}:${value[0]}..${value[1]}`;
      }
      const text = String(value ?? "");
      const preset = DATE_PRESETS.find((d) => d.iso === text);
      if (preset && operator === "gte") return `${key}:${preset.slug}`;
      return `${key}${operatorSymbol(operator)}${text}`;
    }
    case "string": {
      const text = String(value ?? "").trim();
      if (!text) return null;
      return `${key}:${quoteIfNeeded(text)}`;
    }
    default:
      return null;
  }
}

export function serializeQuery(query: Query | null | undefined): string {
  if (!query) return "";
  const parts: string[] = [];
  for (const rule of query.rules) {
    if (!isPredicate(rule)) continue;
    const token = serializePredicate(rule);
    if (token) parts.push(token);
  }
  return parts.join(" ");
}
