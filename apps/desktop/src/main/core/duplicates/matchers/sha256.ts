import {
  assetFound,
  assetRef,
  type Found,
  fanoutPairs,
  type LibraryAsset,
  type LibrarySave,
} from "../types";

const SHA256 = /^[a-f0-9]{64}$/;

export function isSha256(value: string): boolean {
  return SHA256.test(value);
}

/** Byte-identical files across Saves, plus whole-Save manifest equality. */
export function sha256Matches(saves: readonly LibrarySave[]): Found[] {
  const found: Found[] = [];
  const bySha = new Map<string, Map<string, LibraryAsset[]>>();
  const byManifest = new Map<string, string[]>();

  for (const save of saves) {
    let complete = save.assets.length > 0;
    for (const asset of save.assets) {
      if (!isSha256(asset.sha256)) {
        complete = false;
        continue;
      }
      let owners = bySha.get(asset.sha256);
      if (!owners) bySha.set(asset.sha256, (owners = new Map()));
      const list = owners.get(save.id);
      if (list) list.push(asset);
      else owners.set(save.id, [asset]);
    }
    if (!complete) continue;
    const manifest = save.assets
      .map((asset) => asset.sha256)
      .sort()
      .join(",");
    const members = byManifest.get(manifest);
    if (members) members.push(save.id);
    else byManifest.set(manifest, [save.id]);
  }

  for (const owners of bySha.values()) {
    if (owners.size < 2) continue;
    for (const [left, right] of fanoutPairs([...owners.keys()].sort())) {
      const leftAssets = owners.get(left) ?? [];
      const rightAssets = owners.get(right) ?? [];
      const count = Math.min(leftAssets.length, rightAssets.length);
      for (let index = 0; index < count; index++) {
        const match = assetFound({
          matcher: "sha256",
          left: assetRef(leftAssets[index] as LibraryAsset),
          right: assetRef(rightAssets[index] as LibraryAsset),
        });
        if (match) found.push(match);
      }
    }
  }

  for (const [manifest, members] of byManifest) {
    if (members.length < 2) continue;
    const files = manifest.split(",").length;
    for (const ids of fanoutPairs(members.sort()))
      found.push({ ids, save: { matcher: "manifest", files } });
  }

  return found;
}
