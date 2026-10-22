/** Scores command menu text against a query on one 0 to 1 scale. */

export type MatchRange = readonly [start: number, end: number];

export interface Searchable {
  label: string;
  keywords?: string;
}

export interface Match {
  score: number;
  ranges: readonly MatchRange[];
}

/** Anything below this is noise rather than a match. */
export const MIN_SCORE = 0.24;

const SCORE_CAP = 0.9998;
const SECONDARY_WEIGHT = 0.85;
const SUBSTRING_LABEL_SCORE = MIN_SCORE + 0.1;
const SUBSTRING_KEYWORD_SCORE = MIN_SCORE + 0.05;
const INITIALS_SCORE = MIN_SCORE + 0.08;
const TYPO_SCORE = MIN_SCORE + 0.04;

const CONTINUE_MATCH = 1;
const SPACE_WORD_JUMP = 0.9;
const NON_SPACE_WORD_JUMP = 0.8;
const CHARACTER_JUMP = 0.17;
const TRANSPOSITION = 0.1;
const PENALTY_SKIPPED = 0.999;
const PENALTY_NOT_COMPLETE = 0.99;
const POSITION_DECAY = 0.999;
const LENGTH_DECAY = 0.9997;
const WORD_ORDER_BONUS = 1.12;
const MISSING_WORD_PENALTY = 0.2;
const MEANINGLESS_PENALTY = 0.01;

const GAP = /[\\/_+.#"@[({&]/;
const GAPS = /[\\/_+.#"@[({&]/g;
const SPACES = / /g;
const BOUNDARY = new Set([" ", "-", "_", ".", "/"]);
const DIACRITICS = /[\u0300-\u036f]/g;

/** Folds case, accents, and dashes one code unit at a time so indexes still line up with the source. */
function fold(text: string): string {
  let out = "";
  for (const char of text) {
    if (char === "-" || /\s/.test(char)) {
      out += " ".repeat(char.length);
      continue;
    }
    const folded = char.normalize("NFD").replace(DIACRITICS, "").toLowerCase();
    out += folded.length === char.length ? folded : char;
  }
  return out;
}

function queryWords(query: string): string[] {
  return fold(query).split(" ").filter(Boolean);
}

function abbreviationScore(target: string, abbreviation: string): number {
  const width = abbreviation.length + 1;
  const memo = new Float64Array((target.length + 1) * width).fill(-1);

  function inner(targetIndex: number, abbreviationIndex: number): number {
    if (abbreviationIndex >= abbreviation.length) {
      return targetIndex === target.length
        ? CONTINUE_MATCH
        : PENALTY_NOT_COMPLETE;
    }
    const key = targetIndex * width + abbreviationIndex;
    const cached = memo[key];
    if (cached !== undefined && cached >= 0) return cached;

    const char = abbreviation.charAt(abbreviationIndex);
    const next = abbreviation.charAt(abbreviationIndex + 1);
    let best = 0;
    let index = target.indexOf(char, targetIndex);
    while (index >= 0) {
      let score = inner(index + 1, abbreviationIndex + 1);
      if (score > best) {
        const before = target.charAt(index - 1);
        if (index === targetIndex) {
          score *= CONTINUE_MATCH;
        } else if (GAP.test(before)) {
          score *= NON_SPACE_WORD_JUMP;
          const gaps = target.slice(targetIndex, index - 1).match(GAPS);
          if (gaps && targetIndex > 0) score *= PENALTY_SKIPPED ** gaps.length;
        } else if (before === " ") {
          score *= SPACE_WORD_JUMP;
          const spaces = target.slice(targetIndex, index - 1).match(SPACES);
          if (spaces && targetIndex > 0)
            score *= PENALTY_SKIPPED ** spaces.length;
        } else {
          score *= CHARACTER_JUMP;
          if (targetIndex > 0)
            score *= PENALTY_SKIPPED ** (index - targetIndex);
        }
        score *= POSITION_DECAY ** index;
      }
      if (
        next &&
        ((score < TRANSPOSITION && target.charAt(index - 1) === next) ||
          (next === char && target.charAt(index - 1) !== char))
      ) {
        const transposed = inner(index + 1, abbreviationIndex + 2);
        if (transposed * TRANSPOSITION > score)
          score = transposed * TRANSPOSITION;
      }
      if (score > best) best = score;
      index = target.indexOf(char, index + 1);
    }
    memo[key] = best;
    return best;
  }

  return inner(0, 0);
}

function hasWordBoundaryMatch(target: string, word: string): boolean {
  let from = 0;
  for (;;) {
    const index = target.indexOf(word, from);
    if (index === -1) return false;
    if (index === 0 || BOUNDARY.has(target.charAt(index - 1))) return true;
    from = index + 1;
  }
}

function hasSubstantialMatch(target: string, word: string): boolean {
  if (word.length <= 3) return false;
  if (target.includes(word)) return true;
  const size = Math.max(3, Math.ceil(word.length * 0.8));
  for (let start = 0; start + size <= word.length; start++) {
    if (target.includes(word.slice(start, start + size))) return true;
  }
  return false;
}

function meaningful(score: number, word: string, target: string): number {
  return hasWordBoundaryMatch(target, word) || hasSubstantialMatch(target, word)
    ? score
    : score * MEANINGLESS_PENALTY;
}

function singleWordScore(target: string, word: string): number {
  if (!target.includes(word.charAt(0))) return 0;
  const raw = abbreviationScore(target, word);
  if (target.includes(" ")) {
    const joined = singleWordScore(target.replace(SPACES, ""), word);
    if (joined > raw) return joined;
  }
  return meaningful(
    raw * LENGTH_DECAY ** (target.length - word.length),
    word,
    target,
  );
}

function wordOrderBonus(words: readonly string[], target: string): number {
  let previous = -1;
  let from = 0;
  for (const word of words) {
    const index = target.indexOf(word, from);
    if (index < 0 || index <= previous) return 1;
    previous = index;
    from = index + word.length;
  }
  return WORD_ORDER_BONUS;
}

function multiWordScore(
  target: string,
  query: string,
  words: readonly string[],
): number {
  if (!words.some((word) => target.includes(word.charAt(0)))) return 0;
  const scores = words.map((word) =>
    meaningful(abbreviationScore(target, word), word, target),
  );
  const matched = scores.filter((score) => score > 0);
  if (matched.length === 0) return 0;
  const missing = words.length - matched.length;
  if (
    matched.length < words.length * 0.5 &&
    MISSING_WORD_PENALTY ** missing < 0.01
  )
    return 0;
  const weak = scores.some((score) => score > 0 && score < 0.05) ? 0.3 : 1;
  const geometric =
    matched.reduce((product, score) => product * score, 1) **
    (1 / matched.length);
  const mean = matched.reduce((sum, score) => sum + score, 0) / matched.length;
  const combined =
    (geometric * 0.3 + mean * 0.7) *
    MISSING_WORD_PENALTY ** missing *
    wordOrderBonus(words, target) *
    weak;
  return combined > 0.2
    ? Math.max(abbreviationScore(target, query), combined)
    : combined;
}

/** Scores folded text against a folded query. */
function scoreText(target: string, query: string): number {
  if (!query) return 1;
  if (target === query) return 1;
  if (query.length > target.length + 10) return 0;
  const words = query.split(" ").filter(Boolean);
  if (words.length === 0) return 1;
  const [first] = words;
  const score =
    words.length === 1 && first
      ? singleWordScore(target, first)
      : multiWordScore(target, words.join(" "), words);
  return Math.min(score, SCORE_CAP);
}

/** Optimal string alignment distance of at most one: one insert, delete, substitute, or adjacent swap. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const diffs: number[] = [];
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) diffs.push(i);
      if (diffs.length > 2) return false;
    }
    if (diffs.length === 1) return true;
    const [i, j] = diffs;
    return i !== undefined && j === i + 1 && a[i] === b[j] && a[j] === b[i];
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  let skipped = false;
  for (let i = 0, j = 0; i < short.length; i++, j++) {
    if (short[i] === long[j]) continue;
    if (skipped) return false;
    skipped = true;
    i--;
  }
  return true;
}

function typoPrefix(word: string, candidate: string): number | null {
  for (const length of [word.length, word.length + 1, word.length - 1]) {
    if (length < 1 || length > candidate.length) continue;
    if (withinOneEdit(word, candidate.slice(0, length))) return length;
  }
  return null;
}

function typoMatches(targetWords: readonly string[], words: readonly string[]) {
  let typos = 0;
  for (const word of words) {
    if (targetWords.some((candidate) => candidate.startsWith(word))) continue;
    if (
      word.length < 4 ||
      !targetWords.some((candidate) => typoPrefix(word, candidate) != null)
    )
      return false;
    typos++;
  }
  return typos > 0;
}

function matchesInitials(targetWords: readonly string[], query: string) {
  if (query.length < 2 || query.includes(" ")) return false;
  let next = 0;
  for (const word of targetWords) {
    if (word.charAt(0) === query.charAt(next)) next++;
    if (next === query.length) return true;
  }
  return false;
}

function wordsOf(text: string): string[] {
  return text.split(/[ _./]+/).filter(Boolean);
}

/** Ranks one menu item: label first, keywords at a discount, then substring, initials, and typo floors. */
export function matchItem(item: Searchable, query: string): Match | null {
  const words = queryWords(query);
  if (words.length === 0) return { score: 1, ranges: [] };
  const folded = words.join(" ");
  const label = fold(item.label);
  const keywords = fold(item.keywords ?? "");
  const secondary = keywords ? `${label} ${keywords}` : label;

  let score = Math.max(
    scoreText(label, folded),
    scoreText(secondary, folded) * SECONDARY_WEIGHT,
  );
  if (
    label.trim() === folded ||
    (folded.length > 2 && wordsOf(keywords).includes(folded))
  ) {
    score = 1;
  } else if (score < MIN_SCORE && folded.length > 2) {
    if (label.includes(folded)) score = SUBSTRING_LABEL_SCORE;
    else if (keywords.includes(folded)) score = SUBSTRING_KEYWORD_SCORE;
  }
  if (score < MIN_SCORE && matchesInitials(wordsOf(label), folded)) {
    score = INITIALS_SCORE;
  }
  if (
    score < MIN_SCORE &&
    typoMatches([...wordsOf(label), ...wordsOf(keywords)], words)
  ) {
    score = TYPO_SCORE;
  }
  if (score < MIN_SCORE) return null;
  return { score, ranges: matchRanges(item.label, query) };
}

function mergeRanges(ranges: MatchRange[]): MatchRange[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = out.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else out.push([start, end]);
  }
  return out;
}

function wordStarts(text: string): number[] {
  const starts: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== " " && (i === 0 || BOUNDARY.has(text.charAt(i - 1))))
      starts.push(i);
  }
  return starts;
}

function subsequenceRanges(target: string, word: string): MatchRange[] {
  const starts = new Set(wordStarts(target));
  const ranges: MatchRange[] = [];
  let from = 0;
  for (const char of word) {
    let index = -1;
    for (let i = from; i < target.length; i++) {
      if (target[i] !== char) continue;
      if (starts.has(i)) {
        index = i;
        break;
      }
      if (index < 0) index = i;
    }
    if (index < 0) return [];
    ranges.push([index, index + 1]);
    from = index + 1;
  }
  return ranges;
}

/** Character ranges in `label` to highlight for `query`. */
export function matchRanges(label: string, query: string): MatchRange[] {
  const target = fold(label);
  const ranges: MatchRange[] = [];
  for (const word of queryWords(query)) {
    const boundary = wordStarts(target).find((start) =>
      target.startsWith(word, start),
    );
    const index = boundary ?? target.indexOf(word);
    if (index >= 0) {
      ranges.push([index, index + word.length]);
      continue;
    }
    const typo = wordStarts(target)
      .map((start) => {
        const end = target.indexOf(" ", start);
        const candidate = target.slice(start, end < 0 ? undefined : end);
        const length = word.length >= 4 ? typoPrefix(word, candidate) : null;
        return length == null ? null : ([start, start + length] as const);
      })
      .find((range) => range != null);
    if (typo) {
      ranges.push(typo);
      continue;
    }
    ranges.push(...subsequenceRanges(target, word));
  }
  return mergeRanges(ranges);
}
