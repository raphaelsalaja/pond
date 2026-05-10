import { Fragment, type ReactNode, useMemo, useState } from "react";
import styles from "./styles.module.css";

const DESCRIPTION_COLLAPSE_THRESHOLD = 480;
const DESCRIPTION_URL_RE = /https?:\/\/[^\s<>()[\]{}]+/g;

export function DescriptionBody({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const tooLong = text.length > DESCRIPTION_COLLAPSE_THRESHOLD;
  const visible = useMemo(() => {
    if (!tooLong || expanded) return text;
    const cut = text.slice(0, DESCRIPTION_COLLAPSE_THRESHOLD);
    const wsIdx = cut.search(/\s\S*$/);
    return `${wsIdx > 0 ? cut.slice(0, wsIdx) : cut}…`;
  }, [text, tooLong, expanded]);

  return (
    <div className={styles.description}>
      <Linkified text={visible} />
      {tooLong ? (
        <button
          type="button"
          className={styles["description-toggle"]}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

function Linkified({ text }: { text: string }): ReactNode {
  const matches = Array.from(text.matchAll(DESCRIPTION_URL_RE));
  if (matches.length === 0) return text;

  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const m of matches) {
    const idx = m.index ?? 0;
    let url = m[0];
    while (/[.,!?;:'")\]]$/.test(url)) url = url.slice(0, -1);
    if (!url) continue;
    if (idx > cursor) parts.push(text.slice(cursor, idx));
    parts.push(
      <a
        key={`url@${idx}`}
        href={url}
        target="_blank"
        rel="noreferrer"
        className={styles["description-link"]}
      >
        {url}
      </a>,
    );
    cursor = idx + url.length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <Fragment>{parts}</Fragment>;
}
