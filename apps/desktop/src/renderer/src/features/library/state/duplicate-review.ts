import { Store } from "@tanstack/store";

export interface DuplicateReviewRequest {
  id: string;
  saveId: string | null;
  ids: Array<string> | null;
}

export const duplicateReview = new Store<DuplicateReviewRequest | null>(null);

export function openDuplicateReview(
  opts: { saveId?: string; ids?: ReadonlyArray<string> } = {},
): void {
  duplicateReview.setState(() => ({
    id: crypto.randomUUID(),
    saveId: opts.saveId ?? null,
    ids: opts.ids ? [...opts.ids] : null,
  }));
}

export function closeDuplicateReview(): void {
  duplicateReview.setState(() => null);
}
