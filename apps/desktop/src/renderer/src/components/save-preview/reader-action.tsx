import { Tooltip } from "@pond/ui";
import { Link } from "react-router-dom";
import type { Save } from "@/pool/types";
import styles from "./styles.module.css";

export function ReaderAction({ save }: { save: Save }) {
  const isArticleish =
    save.classification === "article" ||
    save.source === "article" ||
    Boolean(save.articleHtml);
  if (!isArticleish) return null;
  return (
    <div className={styles.actions}>
      <div className={styles["actions-row"]}>
        <Tooltip.Root content="Open this article in distraction-free reader mode">
          <Link
            to={`/read/${save.id}`}
            className={styles["reader-link"]}
            aria-label="Open in reader"
          >
            {save.articleHtml
              ? "Open in reader"
              : "Open in reader (extract on open)"}
          </Link>
        </Tooltip.Root>
        {save.articleReadingMinutes ? (
          <span className={styles["reader-meta"]}>
            {save.articleReadingMinutes} min read
          </span>
        ) : null}
      </div>
    </div>
  );
}
