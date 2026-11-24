import { COLOR_PRESETS } from "@pond/schema/filters/color";
import { FIELD_META } from "@pond/schema/filters/meta";
import type { FieldId, Predicate } from "@pond/schema/filters/types";
import { predicateIsActive } from "@/features/search/lib/filter-helpers";
import type { AskSort, NlFacets } from "@/features/search/lib/nl-query";
import {
  ASPECT_SYNONYMS,
  COMBINED_DURATION_RE,
  COUNT_PHRASES,
  DURATION_PHRASES,
  DURATION_UNITS,
  LIST_SYNONYMS,
  MULTI_WORDS,
  NUMBER_WORDS,
  ORIENTATION_SYNONYMS,
  SORT_WORDS,
  SOURCE_SYNONYMS,
  TYPE_SYNONYMS,
  WITH_WORDS,
  WITHOUT_WORDS,
} from "@/features/search/lib/nl-vocabulary";

interface Candidate {
  phrase: string;
  field: Predicate["field"];
  value: string;
}

export function buildCandidates(facets: NlFacets): Array<Candidate> {
  const out: Array<Candidate> = [];
  const push = (phrase: string, field: Predicate["field"], value: string) => {
    const p = phrase.trim().toLowerCase();
    if (p) {
      out.push({ phrase: p, field, value });
    }
  };

  for (const [word, type] of TYPE_SYNONYMS) {
    if (FIELD_META.type.presets?.some((preset) => preset.value === type)) {
      push(word, "type", type);
    }
  }

  for (const [word, kind] of LIST_SYNONYMS) {
    push(word, "list", kind);
  }

  for (const [word, source] of SOURCE_SYNONYMS) {
    push(word, "source", source);
  }
  for (const source of facets.sources) {
    push(source, "source", source);
  }

  for (const color of COLOR_PRESETS) {
    push(color.label, "color", color.hex.toLowerCase());
  }

  for (const [word, orientation] of ORIENTATION_SYNONYMS) {
    push(word, "shape", orientation);
  }
  for (const [word, aspect] of ASPECT_SYNONYMS) {
    push(word, "aspect", aspect);
  }

  for (const tag of facets.tags) {
    push(tag, "tags", tag);
  }
  for (const creator of facets.creators) {
    push(creator, "creator", creator);
  }

  /** Longest phrase first so "are.na" beats "arena". */
  out.sort(
    (a, b) => b.phrase.split(/\s+/).length - a.phrase.split(/\s+/).length,
  );
  return out;
}

interface Accumulator {
  sources: Set<string>;
  types: Set<string>;
  lists: Set<string>;
  orientations: Set<string>;
  aspects: Set<string>;
  tags: Set<string>;
  creators: Set<string>;
  colors: Array<string>;
  negSources: Set<string>;
  negTypes: Set<string>;
  negLists: Set<string>;
  negOrientations: Set<string>;
  negAspects: Set<string>;
  negTags: Set<string>;
  negCreators: Set<string>;
}

export function newAccumulator(): Accumulator {
  return {
    sources: new Set(),
    types: new Set(),
    lists: new Set(),
    orientations: new Set(),
    aspects: new Set(),
    tags: new Set(),
    creators: new Set(),
    colors: [],
    negSources: new Set(),
    negTypes: new Set(),
    negLists: new Set(),
    negOrientations: new Set(),
    negAspects: new Set(),
    negCreators: new Set(),
    negTags: new Set(),
  };
}

export function accumulate(
  acc: Accumulator,
  c: Candidate,
  negate: boolean,
): void {
  switch (c.field) {
    case "source":
      (negate ? acc.negSources : acc.sources).add(c.value);
      return;
    case "type":
      (negate ? acc.negTypes : acc.types).add(c.value);
      return;
    case "list":
      (negate ? acc.negLists : acc.lists).add(c.value);
      return;
    case "shape":
      (negate ? acc.negOrientations : acc.orientations).add(c.value);
      return;
    case "aspect":
      (negate ? acc.negAspects : acc.aspects).add(c.value);
      return;
    case "tags":
      (negate ? acc.negTags : acc.tags).add(c.value);
      return;
    case "creator":
      (negate ? acc.negCreators : acc.creators).add(c.value);
      return;
    case "color":
      acc.colors.push(c.value);
      return;
    default:
      return;
  }
}

export function toPredicates(acc: Accumulator): Array<Predicate> {
  const out: Array<Predicate> = [];

  const enumPred = (
    field: "source" | "type" | "shape" | "aspect",
    values: Set<string>,
    negate: boolean,
  ) => {
    const [first, ...rest] = [...values];
    if (first === undefined) {
      return;
    }
    if (rest.length === 0) {
      out.push({ field, operator: negate ? "neq" : "eq", value: first });
    } else {
      out.push({
        field,
        operator: negate ? "nin" : "in",
        value: [first, ...rest],
      });
    }
  };
  enumPred("source", acc.sources, false);
  enumPred("source", acc.negSources, true);
  enumPred("type", acc.types, false);
  enumPred("type", acc.negTypes, true);
  if (acc.lists.size > 0) {
    out.push({ field: "list", operator: "some", value: [...acc.lists] });
  }
  if (acc.negLists.size > 0) {
    out.push({ field: "list", operator: "none", value: [...acc.negLists] });
  }
  enumPred("shape", acc.orientations, false);
  enumPred("shape", acc.negOrientations, true);
  enumPred("aspect", acc.aspects, false);
  enumPred("aspect", acc.negAspects, true);

  const [creator, ...moreCreators] = [...acc.creators];
  if (creator !== undefined) {
    out.push(
      moreCreators.length === 0
        ? { field: "creator", operator: "eq", value: creator }
        : {
            field: "creator",
            operator: "in",
            value: [creator, ...moreCreators],
          },
    );
  }
  const [negCreator, ...moreNegCreators] = [...acc.negCreators];
  if (negCreator !== undefined) {
    out.push(
      moreNegCreators.length === 0
        ? { field: "creator", operator: "neq", value: negCreator }
        : {
            field: "creator",
            operator: "nin",
            value: [negCreator, ...moreNegCreators],
          },
    );
  }

  if (acc.tags.size > 0) {
    out.push({ field: "tags", operator: "some", value: [...acc.tags] });
  }
  if (acc.negTags.size > 0) {
    out.push({ field: "tags", operator: "none", value: [...acc.negTags] });
  }

  for (const hex of acc.colors) {
    out.push({ field: "color", operator: "near", value: hex });
  }

  return out.filter(predicateIsActive);
}

function parseCount(word: string): number | null {
  const known = NUMBER_WORDS.get(word);
  if (known !== undefined) {
    return known;
  }
  if (/^\d+$/.test(word)) {
    const n = Number.parseInt(word, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseQuantity(word: string): number | null {
  if (word === "a" || word === "an") {
    return 1;
  }
  return parseCount(word);
}

function parseDurationAt(
  words: Array<string>,
  i: number,
): { seconds: number; len: number } | null {
  const w0 = (words[i] ?? "").toLowerCase();
  const glued = COMBINED_DURATION_RE.exec(w0);
  if (glued) {
    const n = Number.parseFloat(glued[1] ?? "");
    const unit = DURATION_UNITS.get(glued[2] ?? "");
    if (Number.isFinite(n) && unit) {
      return { seconds: Math.round(n * unit), len: 1 };
    }
  }
  const n = parseQuantity(w0);
  if (n !== null) {
    const unit = DURATION_UNITS.get((words[i + 1] ?? "").toLowerCase());
    if (unit) {
      return { seconds: Math.round(n * unit), len: 2 };
    }
  }
  return null;
}

export function matchDurationIntent(
  words: Array<string>,
  i: number,
): { pred: Predicate; len: number } | null {
  const at = (k: number) => words[i + k] ?? "";

  if (at(0) === "short" || at(0) === "brief") {
    return { pred: { field: "duration", operator: "lte", value: 60 }, len: 1 };
  }
  if (at(0) === "long" || at(0) === "lengthy") {
    return { pred: { field: "duration", operator: "gte", value: 600 }, len: 1 };
  }

  for (const [phrase, operator] of DURATION_PHRASES) {
    if (phrase.every((part, k) => at(k) === part)) {
      const dur = parseDurationAt(words, i + phrase.length);
      if (dur) {
        return {
          pred: { field: "duration", operator, value: dur.seconds },
          len: phrase.length + dur.len,
        };
      }
    }
  }
  return null;
}

export function matchCountIntent(
  words: Array<string>,
  i: number,
): { pred: Predicate; len: number } | null {
  const at = (k: number) => words[i + k] ?? "";

  if (MULTI_WORDS.has(at(0))) {
    return {
      pred: { field: "fileCount", operator: "gt", value: 1 },
      len: 1,
    };
  }

  for (const [phrase, operator] of COUNT_PHRASES) {
    if (phrase.every((part, k) => at(k) === part)) {
      const n = parseCount(at(phrase.length));
      if (n !== null) {
        return {
          pred: { field: "fileCount", operator, value: n },
          len: phrase.length + 1,
        };
      }
    }
  }
  return null;
}

export function matchSortLimit(
  words: Array<string>,
  i: number,
): { sort?: AskSort; limit?: number; len: number } | null {
  const at = (k: number) => (words[i + k] ?? "").toLowerCase();

  if (at(0) === "most" && at(1) === "recent") {
    return { sort: { key: "savedAt", dir: "desc" }, len: 2 };
  }

  const sort = SORT_WORDS.get(at(0));
  if (sort) {
    return { sort, len: 1 };
  }

  if (at(0) === "top" || at(0) === "first") {
    const n = parseCount(at(1));
    if (n !== null && n > 0) {
      return { limit: n, len: 2 };
    }
  }

  const lead = parseCount(at(0));
  if (lead !== null && lead > 0) {
    if (SORT_WORDS.has(at(1)) || (at(1) === "most" && at(2) === "recent")) {
      return { limit: lead, len: 1 };
    }
  }
  return null;
}

function optionalFieldForNoun(noun: string): FieldId | null {
  if (/^notes?$/.test(noun)) {
    return "note";
  }
  if (/^captions?$/.test(noun)) {
    return "caption";
  }
  if (/^(transcripts?|subtitles?)$/.test(noun)) {
    return "transcript";
  }
  return null;
}

/** Handles its own negation, so it must run before the generic negator step which would otherwise eat "no"/"without". */
export function matchIntent(
  words: Array<string>,
  i: number,
): { pred: Predicate; len: number } | null {
  const at = (k: number) => words[i + k] ?? "";

  switch (at(0)) {
    case "untagged":
      return {
        pred: { field: "tags", operator: "empty", value: true },
        len: 1,
      };
    case "tagged":
      return {
        pred: { field: "tags", operator: "empty", value: true, negate: true },
        len: 1,
      };
    case "captioned":
      return {
        pred: { field: "caption", operator: "exists", value: true },
        len: 1,
      };
    case "transcribed":
      return {
        pred: { field: "transcript", operator: "exists", value: true },
        len: 1,
      };
  }

  const head = at(0);
  if (!WITH_WORDS.has(head) && !WITHOUT_WORDS.has(head)) {
    return null;
  }
  const negated = WITHOUT_WORDS.has(head);

  let k = 1;
  if (at(k) === "a" || at(k) === "an" || at(k) === "any") {
    k += 1;
  }
  const noun = at(k);

  if (/^tags?$/.test(noun)) {
    const pred: Predicate = { field: "tags", operator: "empty", value: true };
    if (!negated) {
      pred.negate = true;
    }
    return { pred, len: k + 1 };
  }

  const field = optionalFieldForNoun(noun);
  if (field) {
    return {
      pred: { field, operator: "exists", value: !negated },
      len: k + 1,
    };
  }
  return null;
}

export function matchCandidate(
  words: Array<string>,
  i: number,
  candidates: Array<Candidate>,
): { candidate: Candidate; len: number } | null {
  for (const candidate of candidates) {
    const parts = candidate.phrase.split(/\s+/);
    if (parts.every((part, k) => words[i + k] === part)) {
      return { candidate, len: parts.length };
    }
  }
  return null;
}
