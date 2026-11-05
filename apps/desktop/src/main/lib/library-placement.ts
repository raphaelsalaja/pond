import { statSync } from "node:fs";
import { readLibraryId } from "./library-id";
import { isSamePath } from "./path-identity";

export interface LibraryAnchor {
  root: string;
  libraryId: string;
}

export interface LibraryObservation {
  rootExists: boolean;
  metadataId: string | null;
}

export type LibraryPlacement = "present" | "missing" | "replaced";

const MISSING_LIBRARY =
  "This library folder is missing. Pond stopped saving so it doesn't create an empty library in its place.";
const REPLACED_LIBRARY =
  "This library folder was replaced. Pond stopped saving so it doesn't write into a different folder.";

let anchor: LibraryAnchor | null = null;
let displacedRoot: string | null = null;
const listeners = new Set<(root: string) => void>();

/** The open library is the metadata.json id captured when that index was opened. */
export function classifyLibraryPlacement(
  open: LibraryAnchor,
  observed: LibraryObservation,
): LibraryPlacement {
  if (!observed.rootExists || observed.metadataId == null) return "missing";
  if (observed.metadataId !== open.libraryId) return "replaced";
  return "present";
}

export function observeLibrarySync(root: string): LibraryObservation {
  try {
    if (!statSync(root).isDirectory()) {
      return { rootExists: false, metadataId: null };
    }
  } catch {
    return { rootExists: false, metadataId: null };
  }
  let metadataId: string | null = null;
  try {
    metadataId = readLibraryId(root);
  } catch {
    metadataId = null;
  }
  return { rootExists: true, metadataId };
}

export function currentLibraryAnchor(): LibraryAnchor | null {
  return anchor;
}

export function pinOpenLibrary(root: string, libraryId: string): void {
  const observed = observeLibrarySync(root);
  if (!observed.rootExists || observed.metadataId !== libraryId) return;
  anchor = { root, libraryId };
  displacedRoot = null;
}

export function onLibraryDisplaced(
  listener: (root: string) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetLibraryPlacement(): void {
  anchor = null;
  displacedRoot = null;
  listeners.clear();
}

export function refreshLibraryPlacement(
  root: string,
): LibraryPlacement | "unpinned" {
  if (!anchor || !isSamePath(anchor.root, root)) return "unpinned";
  const placement = classifyLibraryPlacement(anchor, observeLibrarySync(root));
  if (placement === "present") {
    displacedRoot = null;
    return placement;
  }
  noteDisplaced(root);
  return placement;
}

export function libraryWriteBlock(root: string): string | null {
  const placement = refreshLibraryPlacement(root);
  if (placement === "present" || placement === "unpinned") return null;
  return placement === "replaced" ? REPLACED_LIBRARY : MISSING_LIBRARY;
}

function noteDisplaced(root: string): void {
  if (displacedRoot != null && isSamePath(displacedRoot, root)) return;
  displacedRoot = root;
  const current = [...listeners];
  /** Defer so a save already inside the mutation queue can finish before rows are retired. */
  setImmediate(() => {
    for (const listener of current) listener(root);
  });
}
