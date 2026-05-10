/**
 * One-shot migration from the legacy URL filter format to the new
 * AST. Read by both the renderer (URL on first load) and main (the
 * `prefs.views.saved` migration at boot).
 *
 * Old format keys (and their new mappings):
 *
 *   color=ff0000,00ff00      -> color near each (OR'd if multiple)
 *   tag=foo,bar              -> tags every (legacy AND-of-tags)
 *   source=twitter,arena     -> source in
 *   creator=raphael          -> creator contains
 *   shape=portrait           -> shape eq
 *   type=image,video         -> type in
 *   dim=large                -> dimensions in bucket range (between)
 *   duration=1_5m            -> duration between (60, 300)
 *   size=10--MB              -> size gte 10MB (scaled to bytes)
 *   note=with                -> note exists true
 *   url=foo                  -> url contains
 *   imported=1mo             -> savedAt gte (now - 30d) (preset)
 *   imported=2024-01..       -> savedAt between (range)
 *   modified=...             -> modifiedAt ...
 *
 * `op_<id>=not` flips the predicate's `negate` flag. `folder` /
 * `rating` are dropped — neither was wired into the matcher beyond
 * a placeholder.
 */

import type { Predicate, Query } from "./types";

interface BucketRange {
  min?: number;
  max?: number;
}

const DIM_BUCKETS: Record<string, BucketRange> = {
  small: { max: 800 },
  medium: { min: 800, max: 1600 },
  large: { min: 1600, max: 3000 },
  huge: { min: 3000 },
};

const DURATION_BUCKETS: Record<string, BucketRange> = {
  under_1m: { max: 60 },
  "1_5m": { min: 60, max: 300 },
  "5_15m": { min: 300, max: 900 },
  "15_60m": { min: 900, max: 3600 },
  over_1h: { min: 3600 },
};

const DAY_PRESETS: Record<string, number> = {
  "1d": 1,
  "3d": 3,
  "1w": 7,
  "1mo": 30,
  "3mo": 90,
  "6mo": 180,
  "1y": 365,
};

const SIZE_UNITS: Record<string, number> = {
  KB: 1_000,
  MB: 1_000_000,
  GB: 1_000_000_000,
};

/**
 * Translate a legacy URL or saved-view param map into a new-shape
 * `Query`. Returns `null` if no recognisable legacy keys are
 * present so callers can avoid clobbering an already-migrated URL.
 */
export function migrateLegacyParams(
  raw: Record<string, string> | URLSearchParams,
): Query | null {
  const params: Record<string, string> =
    raw instanceof URLSearchParams ? Object.fromEntries(raw.entries()) : raw;

  const negate = (id: string) => params[`op_${id}`] === "not";
  const clauses: Predicate[] = [];
  let touched = false;

  if (params.color) {
    const hexes = splitList(params.color);
    if (hexes.length === 1) {
      clauses.push({
        kind: "p",
        field: "color",
        cmp: "near",
        value: { hex: hexes[0] },
        ...(negate("color") ? { negate: true } : {}),
      });
    } else if (hexes.length > 1) {
      // OR group requires the full base64 form. Promote here so
      // the URL writer falls back to JSON.
      const orClauses: Predicate[] = hexes.map((hex) => ({
        kind: "p",
        field: "color",
        cmp: "near",
        value: { hex },
      }));
      clauses.push(...orClauses);
      // We mark it as a single OR-group via a sentinel? Instead,
      // return early with an OR clause embedded in the AND.
      const merged: Query = {
        kind: "and",
        clauses: [
          ...clauses.slice(0, -hexes.length),
          { kind: "or", clauses: orClauses } as never,
        ],
      };
      return mergeRest(merged, params, ["color"]);
    }
    touched = true;
  }
  if (params.tag) {
    clauses.push({
      kind: "p",
      field: "tags",
      cmp: "every",
      value: splitList(params.tag),
      ...(negate("tags") ? { negate: true } : {}),
    });
    touched = true;
  }
  if (params.source) {
    clauses.push({
      kind: "p",
      field: "source",
      cmp: "in",
      value: splitList(params.source),
      ...(negate("source") ? { negate: true } : {}),
    });
    touched = true;
  }
  if (params.creator) {
    const list = splitList(params.creator);
    if (list[0]) {
      clauses.push({
        kind: "p",
        field: "creator",
        cmp: "contains",
        value: list[0],
        ...(negate("creator") ? { negate: true } : {}),
      });
    }
    touched = true;
  }
  if (params.shape) {
    clauses.push({
      kind: "p",
      field: "shape",
      cmp: "eq",
      value: params.shape,
      ...(negate("shape") ? { negate: true } : {}),
    });
    touched = true;
  }
  if (params.type) {
    clauses.push({
      kind: "p",
      field: "type",
      cmp: "in",
      value: splitList(params.type),
      ...(negate("type") ? { negate: true } : {}),
    });
    touched = true;
  }
  if (params.dim) {
    const r = DIM_BUCKETS[params.dim];
    if (r) {
      pushRange(clauses, "dimensions", r, negate("dimensions"));
      touched = true;
    }
  }
  if (params.duration) {
    const r = DURATION_BUCKETS[params.duration];
    if (r) {
      pushRange(clauses, "duration", r, negate("duration"));
      touched = true;
    }
  }
  if (params.size) {
    const m = params.size.match(/^(\d*\.?\d*)-(\d*\.?\d*)-(KB|MB|GB)$/i);
    if (m) {
      const [, minRaw = "", maxRaw = "", unitRaw = ""] = m;
      const mult = SIZE_UNITS[unitRaw.toUpperCase()] ?? 1;
      const min = minRaw === "" ? undefined : Number(minRaw) * mult;
      const max = maxRaw === "" ? undefined : Number(maxRaw) * mult;
      pushRange(clauses, "size", { min, max }, negate("size"));
      touched = true;
    }
  }
  if (params.note === "with" || params.note === "without") {
    clauses.push({
      kind: "p",
      field: "note",
      cmp: "exists",
      value: params.note === "with",
      ...(negate("note") ? { negate: true } : {}),
    });
    touched = true;
  }
  if (params.url) {
    clauses.push({
      kind: "p",
      field: "url",
      cmp: "contains",
      value: params.url,
      ...(negate("url") ? { negate: true } : {}),
    });
    touched = true;
  }
  if (params.imported) {
    pushDateClauses(
      clauses,
      "savedAt",
      params.imported,
      negate("date_imported"),
    );
    touched = true;
  }
  if (params.modified) {
    pushDateClauses(
      clauses,
      "modifiedAt",
      params.modified,
      negate("date_modified"),
    );
    touched = true;
  }

  if (!touched) return null;
  return { kind: "and", clauses };
}

function splitList(raw: string): string[] {
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function pushRange(
  clauses: Predicate[],
  field: Predicate["field"],
  r: BucketRange,
  neg: boolean,
): void {
  const negFlag = neg ? { negate: true } : {};
  if (r.min !== undefined && r.max !== undefined) {
    clauses.push({
      kind: "p",
      field,
      cmp: "between",
      value: [r.min, r.max],
      ...negFlag,
    });
    return;
  }
  if (r.min !== undefined) {
    clauses.push({
      kind: "p",
      field,
      cmp: "gte",
      value: r.min,
      ...negFlag,
    });
  }
  if (r.max !== undefined) {
    clauses.push({
      kind: "p",
      field,
      cmp: "lte",
      value: r.max,
      ...negFlag,
    });
  }
}

function pushDateClauses(
  clauses: Predicate[],
  field: Predicate["field"],
  raw: string,
  neg: boolean,
): void {
  const negFlag = neg ? { negate: true } : {};
  const days = DAY_PRESETS[raw];
  if (days !== undefined) {
    clauses.push({
      kind: "p",
      field,
      cmp: "gte",
      value: `-P${days}D`,
      ...negFlag,
    });
    return;
  }
  if (raw.includes("..")) {
    const [from = "", to = ""] = raw.split("..");
    if (from && to) {
      clauses.push({
        kind: "p",
        field,
        cmp: "between",
        value: [`${from}T00:00:00.000Z`, `${to}T23:59:59.999Z`],
        ...negFlag,
      });
      return;
    }
    if (from) {
      clauses.push({
        kind: "p",
        field,
        cmp: "gte",
        value: `${from}T00:00:00.000Z`,
        ...negFlag,
      });
      return;
    }
    if (to) {
      clauses.push({
        kind: "p",
        field,
        cmp: "lte",
        value: `${to}T23:59:59.999Z`,
        ...negFlag,
      });
    }
  }
}

function mergeRest(
  acc: Query,
  params: Record<string, string>,
  skip: string[],
): Query {
  const remainder = { ...params };
  for (const key of skip) delete remainder[key];
  const rest = migrateLegacyParams(remainder);
  if (!rest || rest.clauses.length === 0) return acc;
  return { kind: "and", clauses: [...acc.clauses, ...rest.clauses] };
}
