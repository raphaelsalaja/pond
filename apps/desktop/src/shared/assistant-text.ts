export function sourceExcerpt(
  value: string | null | undefined,
  limit = 700,
): string {
  return (value ?? "")
    .replaceAll(/\\[nrt]/g, "\n")
    .replaceAll(/<[^>]*>/g, " ")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !/^(show (?:more|less|transcript)|follow along using the transcript\.?|subscribe|transcript|\.\.\.?more)$/i.test(
          line,
        ),
    )
    .join(" ")
    .replaceAll(/\s+/g, " ")
    .slice(0, limit)
    .trim();
}

/** A fish writes this alone on a line between chat messages it sends separately. */
export const MESSAGE_BREAK = "[[next]]";

const FENCE = /^\s*(?:```|~~~)/;

/** A reply's separate chat messages, in order; a reply without breaks is one message. */
export function splitMessages(text: string): Array<string> {
  const messages: Array<string> = [];
  let current: Array<string> = [];
  let fenced = false;
  for (const line of text.split("\n")) {
    if (FENCE.test(line)) {
      fenced = !fenced;
    }
    if (!fenced && line.trim() === MESSAGE_BREAK) {
      messages.push(current.join("\n"));
      current = [];
      continue;
    }
    current.push(line);
  }
  const tail = current.at(-1)?.trim() ?? "";
  /** A break still revealing on screen shows as nothing, never as stray brackets. */
  if (!fenced && tail.startsWith("[[") && MESSAGE_BREAK.startsWith(tail)) {
    current.pop();
  }
  messages.push(current.join("\n"));
  return messages.flatMap((message) => {
    const trimmed = message.trim();
    return trimmed ? [trimmed] : [];
  });
}

/** The text a model reads back: separate messages keep their breaks. */
export function joinMessages(messages: ReadonlyArray<string>): string {
  return messages.join(`\n${MESSAGE_BREAK}\n`);
}

const PREVIEW_LENGTH = 140;

export function plainPreview(markdown: string): string {
  const text = markdown
    .split(MESSAGE_BREAK)
    .join(" ")
    .replaceAll(/```[\s\S]*?```/g, " ")
    .replaceAll(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replaceAll(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replaceAll(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replaceAll(/[*_~`]+/g, "")
    .replaceAll(/\s+/g, " ")
    .trim();
  return text.length > PREVIEW_LENGTH
    ? `${text.slice(0, PREVIEW_LENGTH - 1).trimEnd()}…`
    : text;
}
