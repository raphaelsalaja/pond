import { bulkMutation } from "./mutate";

export async function rateSaves(
  ids: ReadonlyArray<string>,
  rating: number,
): Promise<void> {
  if (!Number.isInteger(rating) || rating < 0 || rating > 5) {
    throw new Error("Choose a rating between 0 and 5.");
  }
  await bulkMutation(ids, { kind: "rating", rating });
}
