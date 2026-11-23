import type { Source } from "@pond/schema/db";
import type { SaveEvidence } from "../../../../shared/duplicate-contracts";
import { type Found, fanoutPairs, type LibrarySave } from "../types";

export interface SourceIdentity {
  source: Source;
  sourceId: string;
}

export type ClassifyUrl = (url: string) => SourceIdentity | null;

function identityKey(identity: SourceIdentity): string {
  return `${identity.source}\u0000${identity.sourceId}`;
}

function evidenceFor(identity: SourceIdentity): SaveEvidence {
  return identity.source === "web"
    ? { matcher: "url", url: identity.sourceId }
    : {
        matcher: "source",
        source: identity.source,
        sourceId: identity.sourceId,
      };
}

/** Two Saves of the same post or page, found by re-deriving each Save's source identity from its URLs. */
export function sourceMatches(
  saves: readonly LibrarySave[],
  classify: ClassifyUrl,
): Found[] {
  const owners = new Map<
    string,
    { identity: SourceIdentity; ids: Set<string> }
  >();
  const claim = (identity: SourceIdentity, id: string) => {
    if (!identity.sourceId || identity.source === "local") return;
    const key = identityKey(identity);
    const entry = owners.get(key);
    if (entry) entry.ids.add(id);
    else owners.set(key, { identity, ids: new Set([id]) });
  };

  for (const save of saves) {
    claim({ source: save.source, sourceId: save.sourceId }, save.id);
    if (save.splitSourceId) continue;
    for (const url of new Set([save.url, save.captureUrl])) {
      if (!url || !/^https?:\/\//i.test(url)) continue;
      const identity = classify(url);
      if (identity) claim(identity, save.id);
    }
  }

  const found: Found[] = [];
  for (const { identity, ids } of owners.values()) {
    if (ids.size < 2) continue;
    const save = evidenceFor(identity);
    for (const pair of fanoutPairs([...ids].sort()))
      found.push({ ids: pair, save });
  }
  return found;
}
