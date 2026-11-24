export interface ComposerTrigger {
  kind: "@" | "/";
  query: string;
  start: number;
  end: number;
}

export function findComposerTrigger(
  value: string,
  start: number,
  end = start,
): ComposerTrigger | null {
  if (start !== end || (value[start] && !/\s/.test(value[start]))) {
    return null;
  }
  const match = /(?:^|\s)([@/])([^@/\n]*)$/.exec(value.slice(0, start));
  if (!match) {
    return null;
  }
  const kind = match[1];
  const query = match[2] ?? "";
  if (kind !== "@" && kind !== "/") {
    return null;
  }
  return {
    kind,
    query,
    start: start - query.length - 1,
    end: start,
  };
}

export function replaceComposerTrigger(
  value: string,
  trigger: ComposerTrigger,
  replacement: string,
) {
  const before = value.slice(0, trigger.start);
  const after = value.slice(trigger.end);
  const inserted = replacement
    ? replacement + (after.startsWith(" ") ? "" : " ")
    : "";
  return {
    value: before + inserted + after,
    cursor: before.length + inserted.length,
  };
}
