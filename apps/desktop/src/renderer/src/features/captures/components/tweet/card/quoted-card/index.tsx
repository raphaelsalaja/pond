import { IconTweetVerified } from "@pond/icons";
import type { IconComponent } from "@pond/icons/types";
import { Avatar } from "@/features/captures/components/tweet/card/header";
import type { TweetCardData } from "@/features/captures/components/tweet/card/lib/data";
import { MediaGrid } from "@/features/captures/components/tweet/card/media-grid";
import styles from "./styles.module.css";

export function QuotedCard({
  data,
  Verified = IconTweetVerified,
}: {
  data: TweetCardData;
  Verified?: IconComponent;
}) {
  const { author, text, media } = data;
  return (
    <div className={styles.quoted}>
      <div className={styles.header}>
        <Avatar author={author} size={20} />
        <span className={styles.name}>
          {author.name}
          {author.verified ? (
            <Verified className={styles.verified} size={15} title="Verified" />
          ) : null}
        </span>
        <span className={styles.handle}>@{author.handle}</span>
      </div>
      {text ? <p className={styles.body}>{text}</p> : null}
      {media && media.length > 0 ? <MediaGrid media={media} compact /> : null}
    </div>
  );
}
