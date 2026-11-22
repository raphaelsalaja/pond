import { IconChevronDown, IconExternalLink } from "@pond/icons";
import { BrandTile, Button } from "@pond/ui";
import { useLayoutEffect, useRef, useState } from "react";
import { useSaveDetail } from "@/features/saves/hooks/use-save-detail";
import { pickAuthorColor } from "@/features/saves/lib/presentation";
import { getSourceLabel } from "@/features/saves/lib/source-labels";
import type { Save } from "@/features/saves/types";
import { formatDate } from "@/shared/lib/format";
import { initials } from "@/shared/lib/initials";
import styles from "./styles.module.css";

export function SourceCard({ save }: { save: Save }) {
  const {
    avatarUrl,
    sourceLogo,
    sourceIcon: SourceIcon,
  } = useSaveDetail(save.id);
  const handle = save.rawJson?.capture?.author?.handle?.trim();
  const date = formatDate(
    save.rawJson?.capture?.publishedAt ?? save.savedAt ?? null,
  );
  const url = /^https?:\/\//.test(save.url ?? "") ? save.url : "";
  const description = save.description?.trim();
  if (!save.author && !description) return null;

  return (
    <article className={styles.root} aria-label="Source">
      {save.author ? (
        <header className={styles.author}>
          <Avatar name={save.author} url={avatarUrl} />
          <span className={styles.names}>
            <span className={styles.name}>{save.author}</span>
            {handle ? (
              <span className={styles.handle}>
                {handle.startsWith("@") ? handle : `@${handle}`}
              </span>
            ) : null}
          </span>
        </header>
      ) : null}
      {description ? <Description key={save.id} text={description} /> : null}
      <footer className={styles.footer}>
        <span className={styles.platform}>
          {sourceLogo ? (
            <img
              className={styles.logo}
              src={sourceLogo}
              alt=""
              width={14}
              height={14}
            />
          ) : SourceIcon ? (
            <BrandTile size={14}>
              <SourceIcon />
            </BrandTile>
          ) : null}
          <span>{getSourceLabel(save.source)}</span>
          {date ? (
            <>
              <span aria-hidden>·</span>
              <span>{date}</span>
            </>
          ) : null}
        </span>
        {url ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className={styles.open}
            onClick={() => void window.pond.openExternal(url)}
          >
            Open
            <IconExternalLink size={12} />
          </Button>
        ) : null}
      </footer>
    </article>
  );
}

function Description({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    void text;
    const body = ref.current;
    if (expanded || !body) {
      setOverflowing(false);
      return;
    }
    const measure = () =>
      setOverflowing(body.scrollHeight > body.clientHeight + 1);
    measure();
    if (!globalThis.ResizeObserver) return;
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, [expanded, text]);

  return (
    <>
      <p
        ref={ref}
        className={styles.body}
        data-clamped={expanded ? undefined : true}
      >
        {text}
      </p>
      {overflowing ? (
        <Button
          className={styles.more}
          size="sm"
          variant="ghost"
          onClick={() => setExpanded(true)}
        >
          Read More
          <IconChevronDown size={12} />
        </Button>
      ) : null}
    </>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span
      className={styles.avatar}
      style={{ background: pickAuthorColor(name) }}
      aria-hidden
    >
      {url && url !== failed ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(url)}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
