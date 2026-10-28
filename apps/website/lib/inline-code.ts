export interface TextSegment {
  text: string;
  code: boolean;
}

/** Release notes only use inline code spans, so a backtick split covers the format. */
export function splitInlineCode(text: string): TextSegment[] {
  return text
    .split(/(`[^`]+`)/g)
    .filter(Boolean)
    .map((part) =>
      part.startsWith("`") && part.endsWith("`")
        ? { text: part.slice(1, -1), code: true }
        : { text: part, code: false },
    );
}
