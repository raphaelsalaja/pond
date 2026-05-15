import { FIELD_META } from "./meta";
import {
  COMPARATORS_BY_TYPE,
  type ComparatorId,
  EMPTY_QUERY,
  type FieldId,
  isEmptyQuery,
  type Predicate,
  type Query,
} from "./types";

const COMPACT_PREFIX = "f.";
const FULL_KEY = "q";

export function writeQuery(
  base: URLSearchParams,
  query: Query | null | undefined,
): URLSearchParams {
  const next = new URLSearchParams(base);
  clearQueryParams(next);
  if (!query || isEmptyQuery(query)) return next;
  if (canEncodeCompact(query)) {
    for (const clause of query.clauses) {
      if (clause.kind !== "p") continue;
      const encoded = encodePredicate(clause);
      if (encoded === null) continue;
      next.append(`${COMPACT_PREFIX}${clause.field}`, encoded);
    }
    return next;
  }
  next.set(FULL_KEY, encodeBase64Json(query));
  return next;
}

export function clearQueryParams(params: URLSearchParams): void {
  const drop: string[] = [];
  for (const key of params.keys()) {
    if (key === FULL_KEY) drop.push(key);
    else if (key.startsWith(COMPACT_PREFIX)) drop.push(key);
  }
  for (const key of drop) params.delete(key);
}

export function readQuery(params: URLSearchParams): Query {
  const full = params.get(FULL_KEY);
  if (full) {
    const decoded = decodeBase64Json(full);
    if (decoded) return decoded;
  }

  const clauses: Predicate[] = [];
  for (const [key, raw] of params.entries()) {
    if (!key.startsWith(COMPACT_PREFIX)) continue;
    const field = key.slice(COMPACT_PREFIX.length) as FieldId;
    if (!(field in FIELD_META)) continue;
    const predicate = decodePredicate(field, raw);
    if (predicate) clauses.push(predicate);
  }

  return clauses.length ? { kind: "and", clauses } : EMPTY_QUERY;
}

const NEGATE_PREFIX = "!";

function encodePredicate(p: Predicate): string | null {
  const value = encodeValue(p.cmp, p.value);
  if (value === null) return null;
  const head = `${p.cmp}:${value}`;
  return p.negate ? `${NEGATE_PREFIX}${head}` : head;
}

function decodePredicate(field: FieldId, raw: string): Predicate | null {
  if (!raw) return null;
  const meta = FIELD_META[field];
  let body = raw;
  let negate = false;
  if (body.startsWith(NEGATE_PREFIX)) {
    negate = true;
    body = body.slice(NEGATE_PREFIX.length);
  }
  const colon = body.indexOf(":");
  let cmpRaw: string;
  let valueRaw: string;
  if (colon === -1) {
    cmpRaw = defaultComparator(field);
    valueRaw = body;
  } else {
    cmpRaw = body.slice(0, colon);
    valueRaw = body.slice(colon + 1);
  }
  const allowed = COMPARATORS_BY_TYPE[meta.type];
  if (!allowed.includes(cmpRaw as ComparatorId)) return null;
  const cmp = cmpRaw as ComparatorId;
  const value = decodeValue(cmp, valueRaw);
  if (value === null) return null;
  return { kind: "p", field, cmp, value, ...(negate ? { negate } : {}) };
}

function defaultComparator(field: FieldId): ComparatorId {
  const allowed = COMPARATORS_BY_TYPE[FIELD_META[field].type];
  return allowed[0] ?? "eq";
}

function encodeValue(cmp: ComparatorId, value: unknown): string | null {
  switch (cmp) {
    case "in":
    case "nin":
    case "some":
    case "every":
    case "none": {
      if (!Array.isArray(value)) return null;
      const parts = value
        .map((v) => (typeof v === "string" ? v : String(v)))
        .filter((v) => v.length > 0);
      if (parts.length === 0) return null;
      return parts.map(encodeURIComponent).join(",");
    }
    case "between": {
      if (!Array.isArray(value) || value.length !== 2) return null;
      const [min, max] = value;
      return `${encodeScalar(min)}..${encodeScalar(max)}`;
    }
    case "near": {
      if (!isObject(value)) return null;
      const hex = String(value.hex ?? "")
        .replace(/^#/, "")
        .toLowerCase();
      if (!/^[0-9a-f]{6}$/.test(hex)) return null;
      const distance = Number(value.distance);
      if (Number.isFinite(distance) && distance > 0) {
        return `${hex}:${distance}`;
      }
      return hex;
    }
    case "exists":
      return value === false ? "false" : "true";
    case "contains":
    case "startsWith":
    case "endsWith":
    case "eq":
    case "neq":
    case "lt":
    case "lte":
    case "gt":
    case "gte":
      return encodeScalar(value);
  }
}

function decodeValue(cmp: ComparatorId, raw: string): unknown {
  switch (cmp) {
    case "in":
    case "nin":
    case "some":
    case "every":
    case "none": {
      const parts = raw
        .split(",")
        .map((s) => decodeURIComponent(s.trim()))
        .filter(Boolean);
      return parts.length ? parts : null;
    }
    case "between": {
      const [minRaw = "", maxRaw = ""] = raw.split("..");
      const min = decodeScalar(minRaw);
      const max = decodeScalar(maxRaw);
      if (min === null || max === null) return null;
      return [min, max];
    }
    case "near": {
      const [hexRaw = "", distRaw] = raw.split(":");
      const hex = hexRaw.replace(/^#/, "").toLowerCase();
      if (!/^[0-9a-f]{6}$/.test(hex)) return null;
      const distance =
        distRaw === undefined ? undefined : Number.parseFloat(distRaw);
      if (distance !== undefined && !Number.isFinite(distance)) return null;
      return distance ? { hex, distance } : { hex };
    }
    case "exists":
      return raw !== "false";
    case "contains":
    case "startsWith":
    case "endsWith":
      return decodeURIComponent(raw);
    case "eq":
    case "neq":
    case "lt":
    case "lte":
    case "gt":
    case "gte":
      return decodeScalar(raw);
  }
}

function encodeScalar(v: unknown): string {
  if (typeof v === "number") return String(v);
  return encodeURIComponent(String(v ?? ""));
}

function decodeScalar(raw: string): string | number | null {
  if (raw === "") return null;
  const decoded = decodeURIComponent(raw);
  if (/^-?\d+(?:\.\d+)?$/.test(decoded)) {
    const n = Number(decoded);
    if (Number.isFinite(n)) return n;
  }
  return decoded;
}

function canEncodeCompact(query: Query): boolean {
  if (query.kind !== "and") return false;
  return query.clauses.every((c) => c.kind === "p");
}

function encodeBase64Json(query: Query): string {
  const json = JSON.stringify(query);
  return urlSafe(btoa(unescape(encodeURIComponent(json))));
}

function decodeBase64Json(value: string): Query | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(escape(atob(padded)));
    const parsed = JSON.parse(json) as Query;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.kind !== "and" && parsed.kind !== "or") return null;
    return parsed;
  } catch {
    return null;
  }
}

function urlSafe(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function extractFilterKeys(): readonly string[] {
  return [
    FULL_KEY,
    ...Object.keys(FIELD_META).map((id) => `${COMPACT_PREFIX}${id}`),
  ];
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
