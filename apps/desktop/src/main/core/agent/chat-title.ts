function concise(text: string): string | undefined {
  const normalized = text.trim().replaceAll(/\s+/g, " ");
  if (!normalized) {
    return undefined;
  }
  const title = normalized.charAt(0).toLocaleUpperCase() + normalized.slice(1);
  if (title.length <= 48) return title;
  const prefix = title.slice(0, 47);
  const boundary = prefix.lastIndexOf(" ");
  const truncated = boundary > 24 ? prefix.slice(0, boundary) : prefix;
  return `${truncated.replace(/\s+(?:and|or|the|a|an|of|for|in|with)$/i, "")}…`;
}

export function chatTitle(content: string): string | undefined {
  const firstSentence = content.trim().split(/[.!?]\s+/, 1)[0] ?? "";
  return concise(
    firstSentence
      .replace(/^(?:please\s+)?(?:can|could|would) you\s+/i, "")
      .replace(/[.!?]+$/, ""),
  );
}
