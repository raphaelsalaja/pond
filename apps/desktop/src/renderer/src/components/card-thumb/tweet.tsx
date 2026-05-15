import { IconXTwitter } from "@pond/icons/social-media";
import type { Save } from "@/pool/types";
import { useCardContext } from "./context";
import styles from "./styles.module.css";

export function isTextOnlyTweet(save: Save): boolean {
  if (save.source !== "twitter" && save.source !== "x") return false;
  if (save.mediaUrl) return false;
  return !save.files.some(
    (f) => f.kind === "video" || f.kind === "cover" || f.kind === "media",
  );
}

export function Tweet() {
  const { state } = useCardContext();
  if (!isTextOnlyTweet(state.save)) return null;
  if (state.unit && !state.isBroken) return null;

  const { save } = state;
  const body = (save.description ?? save.title ?? "").trim();
  const authorName = save.rawJson?.twitter?.authorName?.trim();
  const handle = save.author?.replace(/^@/, "").trim();
  const byline = authorName || handle || null;

  return (
    <div className={styles.tweet}>
      <div className={styles["tweet-stripe"]} aria-hidden />
      <div className={styles["tweet-body"]}>
        <IconXTwitter className={styles["tweet-icon"]} aria-hidden />
        {body ? <p className={styles["tweet-text"]}>{body}</p> : null}
        {byline ? <p className={styles["tweet-byline"]}>by {byline}</p> : null}
      </div>
    </div>
  );
}
