import type {
  DuplicateImportCandidate,
  DuplicateImportDecision,
} from "@shared/saves-import-contracts";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

interface DuplicateImportReviewRequest {
  id: string;
  candidates: DuplicateImportCandidate[];
  resolve: (decisions: Record<string, DuplicateImportDecision> | null) => void;
}

const store = new Store<DuplicateImportReviewRequest | null>(null);

export function useDuplicateImportReview(): DuplicateImportReviewRequest | null {
  return useSelector(store, (request) => request);
}

export function closeDuplicateImportReview(): void {
  const request = store.state;
  store.setState(() => null);
  request?.resolve(null);
}

export function completeDuplicateImportReview(
  decisions: Record<string, DuplicateImportDecision>,
): void {
  const request = store.state;
  store.setState(() => null);
  request?.resolve(decisions);
}

function promptForDuplicateImport(
  candidates: DuplicateImportCandidate[],
): Promise<Record<string, DuplicateImportDecision> | null> {
  return new Promise((resolve) => {
    store.setState(() => ({
      id: crypto.randomUUID(),
      candidates,
      resolve,
    }));
  });
}

export async function importFilesWithDuplicateReview(input: {
  paths: string[];
  tags?: string[];
  folderIds?: string[];
  origin?: "files" | "clipboard";
}) {
  const review = await window.pond.query("saves.reviewImportDuplicates", {
    paths: input.paths,
  });
  if (review.candidates.length === 0)
    return window.pond.query("saves.importFiles", input);
  const decisions = await promptForDuplicateImport(review.candidates);
  if (!decisions) return { ok: false as const, reason: "cancelled" as const };
  return window.pond.query("saves.importFiles", {
    ...input,
    duplicatePolicy: "keep-both",
    duplicateDecisions: decisions,
  });
}
