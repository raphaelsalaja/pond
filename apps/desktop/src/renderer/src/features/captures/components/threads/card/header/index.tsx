import { IconThreadsLogo } from "@pond/icons";
import { MetaVerifiedIcon } from "@/features/captures/components/threads/card/icons";
import { Avatar } from "@/features/captures/components/tweet/card/header";
import type { TweetCardAuthor } from "@/features/captures/components/tweet/card/lib/data";
import styles from "./styles.module.css";

export function Header({ author }: { author: TweetCardAuthor }) {
  const username = author.handle || author.name;
  return (
    <div className={styles.header}>
      <Avatar author={author} size={36} />
      <div className={styles.identity}>
        <span className={styles.name}>
          {username}
          {author.verified ? (
            <MetaVerifiedIcon
              className={styles.verified}
              width={16}
              height={16}
            />
          ) : null}
        </span>
      </div>
      <IconThreadsLogo
        className={styles.wordmark}
        size={18}
        title="Threads"
      />
    </div>
  );
}
