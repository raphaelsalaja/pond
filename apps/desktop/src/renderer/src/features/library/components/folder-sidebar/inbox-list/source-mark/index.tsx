import { pickSourceIconUrl } from "@/features/saves/media";
import type { Save } from "@/features/saves/types";
import { BrandTile } from "@/features/sources";
import styles from "./styles.module.css";

export function SourceMark({ save, size }: { save: Save; size: number }) {
  const favicon = save.source === "web" ? pickSourceIconUrl(save) : null;
  if (favicon) {
    return (
      <img
        className={styles.favicon}
        src={favicon}
        alt=""
        width={size}
        height={size}
        draggable={false}
      />
    );
  }
  return <BrandTile source={save.source} size={size} />;
}
