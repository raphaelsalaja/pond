import { Chip } from "@pond/ui";
import type { TokenCodec, TokenInputValue } from "@pond/ui/token-input";
import { SourceThumbnail, useSourceCovers } from "../../pane/save-preview";
import styles from "./styles.module.css";

const SAVE_HREF = "pond-save:";
const SAVE_LINK = /\[((?:\\.|[^\\\]])*)\]\(pond-save:([^)\s]+)\)/g;

function saveMentionHref(id: string): string {
  return `${SAVE_HREF}${encodeURIComponent(id)}`;
}

export function parseSaveMentionHref(href: string): string | null {
  if (!href.startsWith(SAVE_HREF)) return null;
  try {
    return decodeURIComponent(href.slice(SAVE_HREF.length)) || null;
  } catch {
    return null;
  }
}

/** Save mentions travel as Markdown links to `pond-save:`, which replies render back as chips. */
export const saveMentionCodec: TokenCodec = {
  format: (token) =>
    `[${token.label.replaceAll(/[\\[\]]/g, String.raw`\$&`)}](${saveMentionHref(token.value)})`,
  parse: (text) => {
    const value: TokenInputValue = [];
    let last = 0;
    for (const match of text.matchAll(SAVE_LINK)) {
      const id = parseSaveMentionHref(`${SAVE_HREF}${match[2]}`);
      if (!id) continue;
      if (match.index > last) value.push(text.slice(last, match.index));
      value.push({
        type: "save",
        value: id,
        label: (match[1] ?? "").replaceAll(/\\(.)/g, "$1") || "Untitled",
      });
      last = match.index + match[0].length;
    }
    if (last < text.length) value.push(text.slice(last));
    return value;
  },
};

/** The Save ids mentioned in draft Markdown. */
export function saveMentionIds(markdown: string): Set<string> {
  const ids = new Set<string>();
  for (const match of markdown.matchAll(SAVE_LINK)) {
    const id = parseSaveMentionHref(`${SAVE_HREF}${match[2]}`);
    if (id) ids.add(id);
  }
  return ids;
}

export function SaveMentionChip({
  id,
  title,
  onOpen,
}: {
  id: string;
  title: string;
  onOpen?: (id: string) => void;
}) {
  useSourceCovers([id]);
  const content = (
    <>
      <Chip.Icon>
        <span className={styles.cover}>
          <SourceThumbnail id={id} />
        </span>
      </Chip.Icon>
      <Chip.Label>{title}</Chip.Label>
    </>
  );
  if (onOpen) {
    return (
      <Chip.Action
        tone="mention"
        className={styles.mention}
        aria-label={`Open ${title}`}
        onClick={() => onOpen(id)}
      >
        {content}
      </Chip.Action>
    );
  }
  return (
    <span className={styles.mention}>
      <Chip.Item tone="mention">{content}</Chip.Item>
    </span>
  );
}
