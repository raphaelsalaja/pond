import type { SharePageMedia, SharePageSave } from "@pond/schema/share-page";
import { bodyText, formatDate, saveLabel } from "../../lib/format";
import styles from "./styles.module.css";

export interface SaveViewProps {
  save: SharePageSave;
  /** The page's own heading when the page holds one Save; a dialog supplies its own title. */
  heading: "h1" | "h2";
  titleId?: string;
}

/** Every link leaves the page without a referrer, so the page's address never reaches the sites it links to. */
const EXTERNAL = { target: "_blank", rel: "noreferrer noopener" } as const;

export function SaveView({ save, heading: Heading, titleId }: SaveViewProps) {
  const text = bodyText(save);
  const author = save.author;
  return (
    <article className={styles.view}>
      <SaveMedia save={save} />
      <div className={styles.body}>
        <Heading id={titleId} className={styles.title}>
          {saveLabel(save)}
        </Heading>
        {author && (author.name || author.handle) ? (
          <p className={styles.author}>
            {author.url ? (
              <a href={author.url} {...EXTERNAL}>
                {author.name || `@${author.handle}`}
              </a>
            ) : (
              (author.name ?? `@${author.handle}`)
            )}
            {author.name && author.handle ? (
              <span className={styles.handle}> @{author.handle}</span>
            ) : null}
          </p>
        ) : null}
        {text ? <p className={styles.text}>{text}</p> : null}
        {save.quote ? (
          <blockquote className={styles.quote}>
            {save.quote.author?.name || save.quote.author?.handle ? (
              <p className={styles.quoteAuthor}>
                {save.quote.author.name ?? `@${save.quote.author.handle}`}
              </p>
            ) : null}
            {save.quote.text ? (
              <p className={styles.text}>{save.quote.text}</p>
            ) : null}
            {save.quote.url ? (
              <a href={save.quote.url} {...EXTERNAL}>
                Open Quoted Post
              </a>
            ) : null}
          </blockquote>
        ) : null}
        {save.card ? (
          <a className={styles.linkCard} href={save.card.url} {...EXTERNAL}>
            <span className={styles.linkTitle}>
              {save.card.title ?? save.card.url}
            </span>
            {save.card.domain ? (
              <span className={styles.linkDomain}>{save.card.domain}</span>
            ) : null}
          </a>
        ) : null}
        {save.notes ? (
          <section className={styles.notes} aria-label="Notes">
            <p className={styles.text}>{save.notes}</p>
          </section>
        ) : null}
        {save.tags && save.tags.length > 0 ? (
          <ul className={styles.tags} aria-label="Tags">
            {save.tags.map((tag) => (
              <li key={tag} className={styles.tag}>
                {tag}
              </li>
            ))}
          </ul>
        ) : null}
        <p className={styles.footer}>
          <span>
            {save.publishedAt
              ? `${save.source} · ${formatDate(save.publishedAt)}`
              : save.source}
          </span>
          {save.url ? (
            <a href={save.url} {...EXTERNAL}>
              Open Original
            </a>
          ) : null}
        </p>
      </div>
    </article>
  );
}

function SaveMedia({ save }: { save: SharePageSave }) {
  if (save.media.length === 0) {
    const thumbnail = save.thumbnail;
    if (!thumbnail) return null;
    return (
      <div className={styles.media}>
        <img
          className={styles.asset}
          src={thumbnail.src}
          width={thumbnail.width}
          height={thumbnail.height}
          alt=""
        />
      </div>
    );
  }
  return (
    <div className={styles.media}>
      {save.media.map((media, index) => (
        <MediaItem
          key={media.src}
          media={media}
          label={
            save.media.length > 1
              ? `${index + 1} of ${save.media.length}`
              : undefined
          }
        />
      ))}
    </div>
  );
}

function MediaItem({
  media,
  label,
}: {
  media: SharePageMedia;
  label?: string;
}) {
  if (media.kind === "image") {
    return (
      <img
        className={styles.asset}
        src={media.src}
        width={media.width}
        height={media.height}
        alt={label ? `Image ${label}` : ""}
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    // oxlint-disable-next-line jsx-a11y/media-has-caption -- saved videos carry no caption track to publish
    <video
      className={styles.asset}
      src={media.src}
      poster={media.poster?.src}
      width={media.width ?? media.poster?.width}
      height={media.height ?? media.poster?.height}
      aria-label={label ? `Video ${label}` : "Video"}
      controls
      playsInline
      preload="metadata"
    />
  );
}
