import type {
  DuplicateImportCandidate,
  DuplicateImportDecision,
} from "@shared/saves-import-contracts";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

interface DuplicateImportReviewRequest {
  id: string;
  candidates: Array<DuplicateImportCandidate>;
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
  candidates: Array<DuplicateImportCandidate>,
): Promise<Record<string, DuplicateImportDecision> | null> {
  return new Promise((resolve) => {
    store.setState(() => ({
      id: crypto.randomUUID(),
      candidates,
      resolve,
    }));
  });
}

interface FilesImportInput {
  paths: Array<string>;
  tags?: Array<string>;
  folderIds?: Array<string>;
  origin?: "files" | "clipboard";
}

async function importReviewed(input: FilesImportInput) {
  const review = await window.pond.query("saves.reviewImportDuplicates", {
    paths: input.paths,
  });
  if (review.candidates.length === 0) {
    return {
      result: await window.pond.query("saves.importFiles", input),
      notImported: [],
    };
  }
  const decisions = await promptForDuplicateImport(review.candidates);
  if (!decisions) {
    return {
      result: { ok: false as const, reason: "cancelled" as const },
      notImported: input.paths,
    };
  }
  return {
    result: await window.pond.query("saves.importFiles", {
      ...input,
      duplicatePolicy: "keep-both",
      duplicateDecisions: decisions,
    }),
    notImported: Object.keys(decisions).filter(
      (path) => decisions[path] !== "keep-both",
    ),
  };
}

export async function importFilesWithDuplicateReview(input: FilesImportInput) {
  return (await importReviewed(input)).result;
}

export async function importClipboardWithDuplicateReview(input: {
  folderIds?: Array<string>;
}) {
  const staged = await window.pond.query("saves.stageClipboard", {});
  if (!staged.ok) {
    return { ok: false as const, error: staged.error };
  }
  const { result, notImported } = await importReviewed({
    ...input,
    paths: staged.paths,
    origin: "clipboard",
  });
  if (notImported.length > 0) {
    await window.pond.query("saves.discardStagedClipboard", {
      paths: notImported,
    });
  }
  return result;
}
