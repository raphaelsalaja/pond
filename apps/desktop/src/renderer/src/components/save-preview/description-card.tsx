import { Fragment, type ReactNode, useMemo, useState } from "react";
import { CardSection } from "./card-section";
import styles from "./description-card.module.css";

const DESCRIPTION_URL_RE = /https?:\/\/[^\s<>()[\]{}]+/g;

export function DescriptionCard({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <CardSection label="Description" className={styles["desc-card"]}>
      <div
        className={styles["desc-body"]}
        data-expanded={expanded ? "true" : undefined}
      >
        <Linkified text={text} />
      </div>
      <button
        type="button"
        className={styles["desc-toggle"]}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span>{expanded ? "Show less" : "Read more"}</span>
        <Chevron expanded={expanded} />
      </button>
    </CardSection>
  );
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{
        transform: expanded ? "rotate(180deg)" : undefined,
        transition: "transform 120ms ease",
      }}
    >
      <path d="M2.5 4.5l3.5 3 3.5-3" />
    </svg>
  );
}

function Linkified({ text }: { text: string }): ReactNode {
  const matches = useMemo(
    () => Array.from(text.matchAll(DESCRIPTION_URL_RE)),
    [text],
  );
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
        className={styles["desc-link"]}
      >
        {url}
      </a>,
    );
    cursor = idx + url.length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <Fragment>{parts}</Fragment>;
}
