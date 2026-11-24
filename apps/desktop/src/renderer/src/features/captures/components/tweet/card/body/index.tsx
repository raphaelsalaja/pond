import type { ReactNode } from "react";
import styles from "./styles.module.css";

const ENTITY = /(https?:\/\/[^\s]+|www\.[^\s]+|[@#$][\w]+)/g;

function renderTokens(text: string): Array<ReactNode> {
  const out: Array<ReactNode> = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(ENTITY)) {
    const idx = match.index ?? 0;
    if (idx > last) {
      out.push(text.slice(last, idx));
    }
    const token = match[0];
    out.push(
      <span key={`e${key}`} className={styles.entity}>
        {token.startsWith("http") || token.startsWith("www.")
          ? prettifyUrl(token)
          : token}
      </span>,
    );
    key += 1;
    last = idx + token.length;
  }
  if (last < text.length) {
    out.push(text.slice(last));
  }
  return out;
}

/** Twitter shows links without protocol and trims overly long paths. */
function prettifyUrl(url: string): string {
  const bare = url.replace(/^https?:\/\//, "").replace(/^www\./, "");
  return bare.length > 30 ? `${bare.slice(0, 30)}\u2026` : bare;
}

export function Body({
  text,
  lang,
  className,
}: {
  text: string;
  lang?: string;
  className?: string;
}) {
  return (
    <p
      className={className ? `${styles.body} ${className}` : styles.body}
      lang={lang}
      dir="auto"
    >
      {renderTokens(text)}
    </p>
  );
}
