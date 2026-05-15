import {
  IconFolder5Outline18,
  IconGlobe2Outline18,
} from "@pond/icons/outline/18";
import { Avatar, Tooltip } from "@pond/ui";
import { useCallback } from "react";
import {
  getYouTubeAuthor,
  pickAuthorColor,
} from "@/components/save-preview/helpers";
import type { Save } from "@/pool/types";
import styles from "./styles.module.css";

export function AuthorRow({ save }: { save: Save }) {
  const author = getYouTubeAuthor(save);
  const hasLocalFile = (save.files ?? []).length > 0;

  const openOriginal = useCallback(() => {
    if (!save.url) return;
    void window.pond.openExternal(save.url);
  }, [save.url]);

  const revealLocal = useCallback(() => {
    if (!hasLocalFile) return;
    void window.pond.revealSave(save.id);
  }, [save.id, hasLocalFile]);

  const fallbackInitial = (author.name ?? "?").trim().charAt(0).toUpperCase();

  return (
    <div className={styles["author-row"]}>
      <a
        className={styles["author-card"]}
        href={author.channelUrl ?? undefined}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => {
          if (!author.channelUrl) return;
          e.preventDefault();
          void window.pond.openExternal(author.channelUrl);
        }}
        aria-label={author.name ?? "Open channel"}
      >
        <Avatar.Root className={styles["author-avatar"]}>
          {author.avatarUrl ? <Avatar.Image src={author.avatarUrl} /> : null}
          <Avatar.Fallback
            style={{
              background: pickAuthorColor(author.name ?? save.id),
            }}
          >
            {fallbackInitial}
          </Avatar.Fallback>
        </Avatar.Root>
        {author.name ? (
          <span className={styles["author-name"]}>{author.name}</span>
        ) : null}
      </a>

      <div className={styles["author-actions"]}>
        <Tooltip.Root content="Open original">
          <button
            type="button"
            className={styles["author-icon-btn"]}
            onClick={openOriginal}
            disabled={!save.url}
            aria-label="Open original"
          >
            <IconGlobe2Outline18 width={16} height={16} />
          </button>
        </Tooltip.Root>
        <Tooltip.Root content="View local save">
          <button
            type="button"
            className={styles["author-icon-btn"]}
            onClick={revealLocal}
            disabled={!hasLocalFile}
            aria-label="View local save"
          >
            <IconFolder5Outline18 width={16} height={16} />
          </button>
        </Tooltip.Root>
      </div>
    </div>
  );
}
