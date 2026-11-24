import { Body } from "@/features/captures/components/tweet/card/body";
import { Header } from "@/features/captures/components/tweet/card/header";
import { LinkCard } from "@/features/captures/components/tweet/card/link-card";
import { MediaGrid } from "@/features/captures/components/tweet/card/media-grid";
import { Metrics } from "@/features/captures/components/tweet/card/metrics";
import { ParentPost } from "@/features/captures/components/tweet/card/parent";
import { QuotedCard } from "@/features/captures/components/tweet/card/quoted-card";
import { systemLocale } from "@/shared/lib/system-locale";
import type { TweetCardData } from "./lib/data";
import styles from "./styles.module.css";

type Scheme = "light" | "dark";

function formatTimestamp(iso: string): string | null {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) {
    return null;
  }
  const time = d.toLocaleTimeString(systemLocale, {
    hour: "numeric",
    minute: "2-digit",
  });
  const date = d.toLocaleDateString(systemLocale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${time} \u00b7 ${date}`;
}

export function TweetCard({
  data,
  scheme = "light",
}: {
  data: TweetCardData;
  scheme?: Scheme;
}) {
  const { author, text, media, metrics, quoted, card, publishedAt, isReply } =
    data;
  const timestamp = publishedAt ? formatTimestamp(publishedAt) : null;

  return (
    <article className={styles.card} data-scheme={scheme}>
      {data.replyTo ? <ParentPost data={data.replyTo} /> : null}

      <Header author={author} />

      {isReply && data.replyingTo && !data.replyTo ? (
        <p className={styles["reply-context"]}>
          Replying to <span className={styles.entity}>@{data.replyingTo}</span>
        </p>
      ) : null}

      {text ? <Body text={text} lang={data.lang} /> : null}

      {media && media.length > 0 ? <MediaGrid media={media} /> : null}

      {quoted ? <QuotedCard data={quoted} /> : null}

      {card ? <LinkCard data={card} /> : null}

      {timestamp ? <p className={styles.timestamp}>{timestamp}</p> : null}

      {metrics ? <Metrics metrics={metrics} /> : null}
    </article>
  );
}
