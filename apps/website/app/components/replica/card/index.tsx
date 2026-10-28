import Image from "next/image";
import { type LibrarySave, saveImage } from "@/lib/library";
import { getSource } from "@/lib/sources";
import type { WaterfallItem } from "../layout";
import styles from "./styles.module.css";

interface CardProps {
  save: LibrarySave;
  layout: WaterfallItem;
  selected?: boolean;
  eager?: boolean;
}

export function Card({ save, layout, selected, eager }: CardProps) {
  const { Icon } = getSource(save.source);
  return (
    <div
      className={styles.item}
      data-selected={selected || undefined}
      style={{
        top: layout.top,
        left: layout.left,
        width: layout.width,
      }}
    >
      <div className={styles.media} style={{ height: layout.mediaHeight }}>
        <div className={styles.thumb}>
          <Image
            className={styles.image}
            src={saveImage(save)}
            alt=""
            width={save.width}
            height={save.height}
            sizes="240px"
            loading={eager ? "eager" : "lazy"}
          />
        </div>
        <div className={styles.overlay}>
          <span className={styles.type}>
            {save.kind === "video" ? "MP4" : "JPG"}
          </span>
          <span className={styles.source}>
            <Icon aria-hidden />
          </span>
        </div>
      </div>
      <div className={styles.meta}>
        <span className={styles.title}>{save.title}</span>
        <span className={styles.time}>{save.savedAt}</span>
      </div>
    </div>
  );
}
