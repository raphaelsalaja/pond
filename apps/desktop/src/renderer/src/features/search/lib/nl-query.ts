import type { Group, Predicate } from "@pond/schema/filters/types";
import { extractDates } from "@/features/search/lib/nl-chrono";
import {
  accumulate,
  buildCandidates,
  matchCandidate,
  matchCountIntent,
  matchDurationIntent,
  matchIntent,
  matchSortLimit,
  newAccumulator,
  toPredicates,
} from "@/features/search/lib/nl-matchers";
import { FILLER, NEGATORS } from "@/features/search/lib/nl-vocabulary";

export type NlFacets = {
  sources: Array<string>;
  tags: Array<string>;
  types: Array<string>;
  creators: Array<string>;
};

export interface AskSort {
  key: "savedAt" | "duration" | "fileCount";
  dir: "asc" | "desc";
}

export interface FlatQuery extends Group {
  combinator: "and";
  rules: Array<Predicate>;
}

interface NlResult {
  query: FlatQuery;
  residual: string;
  sort: AskSort | null;
  limit: number | null;
}

export const EMPTY_FACETS: NlFacets = {
  sources: [],
  tags: [],
  types: [],
  creators: [],
};

export function dedupePredicates(
  predicates: Array<Predicate>,
): Array<Predicate> {
  const seen = new Set<string>();
  const out: Array<Predicate> = [];
  for (const p of predicates) {
    const key = JSON.stringify([
      p.field,
      p.operator,
      p.value,
      p.negate ?? false,
    ]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

export function compileStageA(input: string, facets: NlFacets): NlResult {
  const { predicates: datePreds, rest } = extractDates(input);

  const words = rest
    .toLowerCase()
    .replaceAll(/[?!.,]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const candidates = buildCandidates(facets);
  const acc = newAccumulator();
  const intentPreds: Array<Predicate> = [];
  const residual: Array<string> = [];

  let i = 0;
  let negateNext = false;
  let sort: AskSort | null = null;
  let limit: number | null = null;
  while (i < words.length) {
    const word = words[i] ?? "";

    const order = matchSortLimit(words, i);
    if (order) {
      if (order.sort) {
        sort = order.sort;
      }
      if (order.limit !== undefined) {
        limit = order.limit;
      }
      i += order.len;
      negateNext = false;
      continue;
    }

    const dur = matchDurationIntent(words, i);
    if (dur) {
      intentPreds.push(dur.pred);
      i += dur.len;
      negateNext = false;
      continue;
    }

    /** Count intents run before the negator so "no more than 3" isn't eaten. */
    const count = matchCountIntent(words, i);
    if (count) {
      intentPreds.push(count.pred);
      i += count.len;
      negateNext = false;
      continue;
    }

    const intent = matchIntent(words, i);
    if (intent) {
      intentPreds.push(intent.pred);
      i += intent.len;
      negateNext = false;
      continue;
    }

    if (NEGATORS.has(word)) {
      negateNext = true;
      i += 1;
      continue;
    }

    const matched = matchCandidate(words, i, candidates);
    if (matched) {
      accumulate(acc, matched.candidate, negateNext);
      i += matched.len;
      negateNext = false;
      continue;
    }

    if (!FILLER.has(word)) residual.push(word);
    negateNext = false;
    i += 1;
  }

  const rules = dedupePredicates([
    ...toPredicates(acc),
    ...intentPreds,
    ...datePreds,
  ]);
  const query: FlatQuery = { combinator: "and", rules };
  return { query, residual: residual.join(" "), sort, limit };
}
