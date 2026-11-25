import { relationRank } from "../../../shared/duplicate-contracts";
import type {
  DuplicateDismissal,
  DuplicateGroup,
  DuplicatePair,
} from "../../../shared/duplicate-contracts";
import { buildPairs } from "./classify";
import { groupPairs } from "./group";
import { audioMatches } from "./matchers/audio";
import { imageMatches } from "./matchers/image";
import { semanticMatches } from "./matchers/semantic";
import type { NeighborStore } from "./matchers/semantic";
import { sha256Matches } from "./matchers/sha256";
import { sourceMatches } from "./matchers/source";
import type { ClassifyUrl } from "./matchers/source";
import { videoMatches } from "./matchers/video";
import { pairKey } from "./types";
import type { FingerprintSets, Found, LibrarySave } from "./types";

export interface MatchOptions {
  classifyUrl: ClassifyUrl;
  fingerprints?: FingerprintSets;
  semantic?: { store: NeighborStore; model: string };
  scope?: ReadonlySet<string>;
  dismissed?: ReadonlyArray<DuplicateDismissal>;
}

export interface MatchResult {
  pairs: Array<DuplicatePair>;
  groups: Array<DuplicateGroup>;
}

/** A dismissed pair comes back only once newer evidence makes the relation stronger than the one dismissed. */
function dismissedFilter(
  dismissed: ReadonlyArray<DuplicateDismissal> | undefined,
): (pair: DuplicatePair) => boolean {
  if (!dismissed?.length) return () => true;
  const weakest = new Map<string, number>();
  for (const item of dismissed) {
    const key = pairKey(item.ids[0], item.ids[1]);
    const rank = relationRank(item.relation);
    weakest.set(key, Math.min(weakest.get(key) ?? rank, rank));
  }
  return (pair) => {
    const rank = weakest.get(pairKey(pair.ids[0], pair.ids[1]));
    return rank === undefined || relationRank(pair.relation) < rank;
  };
}

function sortPairs(pairs: Array<DuplicatePair>): Array<DuplicatePair> {
  return pairs.sort(
    (left, right) =>
      relationRank(left.relation) - relationRank(right.relation) ||
      left.ids[0].localeCompare(right.ids[0]) ||
      left.ids[1].localeCompare(right.ids[1]),
  );
}

/** Groups are built over the whole Library first, so a scoped scan still sees the links between out-of-scope partners. */
export function matchLibrary(
  saves: ReadonlyArray<LibrarySave>,
  options: MatchOptions,
): MatchResult {
  const found: Array<Found> = [
    ...sha256Matches(saves),
    ...sourceMatches(saves, options.classifyUrl),
  ];
  if (options.fingerprints) {
    found.push(
      ...imageMatches(saves, options.fingerprints.image),
      ...videoMatches(saves, options.fingerprints.video),
      ...audioMatches(saves, options.fingerprints.audio),
    );
  }
  if (options.semantic) {
    found.push(
      ...semanticMatches(saves, options.semantic.store, {
        model: options.semantic.model,
        scope: options.scope,
      }),
    );
  }

  const assetCounts = new Map(
    saves.map((save) => [save.id, save.assets.length]),
  );
  const keep = dismissedFilter(options.dismissed);
  const pairs = sortPairs(buildPairs(found, assetCounts).filter(keep));
  const groups = groupPairs(pairs);
  if (!options.scope) return { pairs, groups };

  const scope = options.scope;
  const scopedGroups = groups.filter((group) =>
    group.ids.some((id) => scope.has(id)),
  );
  const remap = new Map<number, number>();
  const scopedPairs: Array<DuplicatePair> = [];
  for (const group of scopedGroups) {
    for (const position of group.pairs) {
      const pair = pairs[position];
      if (!pair || remap.has(position)) continue;
      remap.set(position, scopedPairs.length);
      scopedPairs.push(pair);
    }
  }
  return {
    pairs: scopedPairs,
    groups: scopedGroups.map((group) => ({
      ...group,
      pairs: group.pairs.flatMap((position) => remap.get(position) ?? []),
    })),
  };
}
