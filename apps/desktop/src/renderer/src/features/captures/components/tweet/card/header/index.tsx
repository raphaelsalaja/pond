import { IconTweetVerified } from "@pond/icons";
import { useState } from "react";
import type { TweetCardAuthor } from "@/features/captures/components/tweet/card/lib/data";
import { initials } from "@/shared/lib/initials";
import styles from "./styles.module.css";

export function Header({ author }: { author: TweetCardAuthor }) {
  return (
    <div className={styles.header}>
      <Avatar author={author} />
      <div className={styles.identity}>
        <span className={styles.name}>
          {author.name}
          {author.verified ? (
            <IconTweetVerified
              className={styles.verified}
              size={19}
              title="Verified"
            />
          ) : null}
        </span>
        <span className={styles.handle}>@{author.handle}</span>
      </div>
    </div>
  );
}

export function Avatar({
  author,
  size = 40,
}: {
  author: TweetCardAuthor;
  size?: number;
}) {
  return (
    <AvatarInner key={author.avatarUrl ?? ""} author={author} size={size} />
  );
}

function AvatarInner({
  author,
  size,
}: {
  author: TweetCardAuthor;
  size: number;
}) {
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(author.avatarUrl) && !failed;
  return (
    <span
      className={styles.avatar}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {showImg ? (
        <img
          src={author.avatarUrl}
          alt=""
          className={styles.image}
          draggable={false}
          decoding="sync"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={styles.fallback}>
          {initials(author.name || author.handle || "?")}
        </span>
      )}
    </span>
  );
}
