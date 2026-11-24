/** `subscription` marks a post Pond picked up from a publication you follow rather than one you saved. */
export const LIST_KINDS = ["liked", "saved", "subscription"] as const;
export type ListKind = (typeof LIST_KINDS)[number];

const ALIASES = new Map<string, ListKind>([
  ["liked", "liked"],
  ["like", "liked"],
  ["likes", "liked"],
  ["upvote", "liked"],
  ["upvoted", "liked"],
  ["saved", "saved"],
  ["save", "saved"],
  ["bookmark", "saved"],
  ["bookmarks", "saved"],
  ["bookmarked", "saved"],
  ["favorite", "saved"],
  ["favorites", "saved"],
  ["favourite", "saved"],
  ["favourites", "saved"],
  ["star", "saved"],
  ["starred", "saved"],
  ["stars", "saved"],
  ["subscription", "subscription"],
  ["subscriptions", "subscription"],
]);

export const LIST_KIND_LABELS = {
  liked: "Liked",
  saved: "Saved",
  subscription: "Subscription",
} satisfies Record<ListKind, string>;

export type ListKindInput =
  | string
  | null
  | undefined
  | ReadonlyArray<ListKindInput>;

export function canonicalListKind(raw: string): ListKind | null {
  return ALIASES.get(raw.trim().toLowerCase()) ?? null;
}

function isKindList(
  value: ListKindInput,
): value is ReadonlyArray<ListKindInput> {
  return Array.isArray(value);
}

export function normalizeListKinds(raw: ListKindInput): Array<ListKind> {
  const found = new Set<ListKind>();
  const visit = (value: ListKindInput): void => {
    if (isKindList(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }
    if (!value) {
      return;
    }
    const kind = canonicalListKind(value);
    if (kind) {
      found.add(kind);
    }
  };
  visit(raw);
  return LIST_KINDS.filter((kind) => found.has(kind));
}

export function mergeListKinds(
  ...parts: Array<ListKindInput>
): Array<ListKind> {
  return normalizeListKinds(parts);
}

export function listKindsEqual(a: ListKindInput, b: ListKindInput): boolean {
  const left = normalizeListKinds(a);
  const right = normalizeListKinds(b);
  return (
    left.length === right.length && left.every((kind, i) => kind === right[i])
  );
}

export function formatListKinds(raw: ListKindInput): string | null {
  const kinds = normalizeListKinds(raw);
  if (kinds.length === 0) {
    return null;
  }
  return kinds.map((kind) => LIST_KIND_LABELS[kind]).join(", ");
}
