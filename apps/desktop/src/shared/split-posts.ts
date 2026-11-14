export interface SplitPostSummary {
  /** `source:sourceId`, the value of a `post` filter. */
  key: string;
  source: string;
  title: string | null;
  /** Live Saves in the post, in post order. */
  saveIds: string[];
  savedAt: number;
}
