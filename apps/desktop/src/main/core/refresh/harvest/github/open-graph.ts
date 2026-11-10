const GENERATED_HOST = "opengraph.githubassets.com";

/**
 * GitHub draws this card from the repository's stats.
 * The host rate-limits, so a missed download must not hold the save.
 */
export function isGithubGeneratedOpenGraph(url: string): boolean {
  try {
    return new URL(url).hostname === GENERATED_HOST;
  } catch {
    return false;
  }
}

/** A custom og:image when the repository set one, otherwise GitHub's generated card. */
export function selectRepositoryPreview<T extends { url: string }>(
  media: readonly T[],
): T[] {
  const custom = media.find((entry) => !isGithubGeneratedOpenGraph(entry.url));
  const chosen = custom ?? media[0];
  return chosen ? [chosen] : [];
}
