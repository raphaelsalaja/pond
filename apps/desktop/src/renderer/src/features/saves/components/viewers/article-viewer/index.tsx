import { IconArrowUpRight } from "@pond/icons";
import type { Source } from "@pond/schema/db";
import { sourceLabel } from "@pond/schema/sources";
import { isElement } from "@pond/ui/dom";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ViewerHud } from "@/features/saves/components/viewers/hud";
import { ChromePortal } from "@/features/saves/components/viewers/media-viewer/chrome";
import { ViewerToolbarGroups } from "@/features/saves/components/viewers/viewer-toolbar-groups";
import { formatDate } from "@/shared/lib/format";
import { readArticle } from "./sanitize";
import type { Article } from "./sanitize";
import styles from "./styles.module.css";

interface ArticleViewerProps {
  url: string;
  source: Source;
  fallbackUrl?: string;
  onUnavailable: () => void;
  toolbarStart?: ReactNode;
  toolbarActions?: ReactNode;
}

const WORDS_PER_MINUTE = 230;

export function ArticleViewer({
  url,
  source: saveSource,
  fallbackUrl,
  onUnavailable,
  toolbarStart,
  toolbarActions,
}: ArticleViewerProps) {
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((text) => {
        if (alive) setSource(text);
      })
      .catch(() => {
        if (alive) onUnavailable();
      });
    return () => {
      alive = false;
    };
  }, [onUnavailable, url]);

  const article = useMemo(
    () => (source === null ? null : readArticle(source)),
    [source],
  );
  const postUrl = article?.meta.url ?? fallbackUrl;
  const site = sourceLabel(saveSource);

  return (
    <div className={styles.root}>
      <ChromePortal slot="top">
        <ViewerHud.Bar
          label="Article"
          start={toolbarStart}
          center={
            <ViewerToolbarGroups
              controls={
                postUrl ? (
                  <ViewerHud.Tool
                    label={`Open on ${site}`}
                    onClick={() => void window.pond.openExternal(postUrl)}
                  >
                    <IconArrowUpRight />
                  </ViewerHud.Tool>
                ) : null
              }
              actions={toolbarActions}
            />
          }
        />
      </ChromePortal>
      {article ? (
        <ArticleBody article={article} postUrl={postUrl} site={site} />
      ) : (
        <div className={styles.status}>Loading article</div>
      )}
    </div>
  );
}

function ArticleBody({
  article,
  postUrl,
  site,
}: {
  article: Article;
  postUrl?: string;
  site: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { meta } = article;
  const minutes = Math.max(1, Math.round(article.words / WORDS_PER_MINUTE));
  const facts = [
    meta.publication,
    formatDate(meta.published ?? null),
    `${minutes} min read`,
  ].filter(Boolean);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const onClick = (event: MouseEvent) => {
      if (!isElement(event.target)) {
        return;
      }
      const anchor = event.target.closest("a[href]");
      if (!anchor || !scroller.contains(anchor)) return;
      event.preventDefault();
      const href = anchor.getAttribute("href") ?? "";
      if (href.startsWith("#")) {
        scroller
          .querySelector(`[id="${CSS.escape(href.slice(1))}"]`)
          ?.scrollIntoView({ block: "start", behavior: "smooth" });
        return;
      }
      void window.pond.openExternal(href);
    };
    scroller.addEventListener("click", onClick);
    return () => scroller.removeEventListener("click", onClick);
  }, []);

  return (
    <div className={styles.scroll} ref={scrollRef} data-scroll-fade="vertical">
      <article className={styles.column}>
        <header className={styles.header}>
          {meta.title ? <h1 className={styles.title}>{meta.title}</h1> : null}
          {meta.subtitle ? (
            <p className={styles.subtitle}>{meta.subtitle}</p>
          ) : null}
          <div className={styles.byline}>
            {meta.authorPhoto ? (
              <img className={styles.avatar} src={meta.authorPhoto} alt="" />
            ) : null}
            <div className={styles.credit}>
              {meta.author ? (
                <span className={styles.author}>{meta.author}</span>
              ) : null}
              <span className={styles.facts}>{facts.join(" · ")}</span>
            </div>
          </div>
          {meta.cover ? (
            <img className={styles.cover} src={meta.cover} alt="" />
          ) : null}
        </header>
        <div
          className={styles.body}
          // oxlint-disable-next-line react/no-danger -- readArticle keeps only allowlisted tags and attributes
          dangerouslySetInnerHTML={{ __html: article.html }}
        />
        {meta.preview && postUrl ? (
          <p className={styles.preview}>
            This is a preview.{" "}
            <a href={postUrl}>Read the full post on {site}.</a>
          </p>
        ) : null}
      </article>
    </div>
  );
}
