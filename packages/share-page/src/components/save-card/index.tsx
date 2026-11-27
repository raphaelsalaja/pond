import type { SharePageSave } from "@pond/schema/share-page";
import { authorLabel, bodyText, saveLabel } from "../../lib/format";
import styles from "./styles.module.css";

export interface SaveCardProps {
  save: SharePageSave;
  onOpen: (id: string) => void;
}

export function SaveCard({ save, onOpen }: SaveCardProps) {
  const author = authorLabel(save);
  const thumbnail = save.thumbnail;
  const excerpt = bodyText(save);
  return (
    <button
      type="button"
      className={styles.card}
      onClick={() => onOpen(save.id)}
      data-save={save.id}
    >
      {thumbnail ? (
        <img
          className={styles.image}
          src={thumbnail.src}
          width={thumbnail.width}
          height={thumbnail.height}
          alt=""
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className={styles.textCover}>{excerpt ?? saveLabel(save)}</span>
      )}
      <span className={styles.caption}>
        <span className={styles.title}>{saveLabel(save)}</span>
        <span className={styles.meta}>
          {author ? `${save.source} · ${author}` : save.source}
        </span>
      </span>
    </button>
  );
}
