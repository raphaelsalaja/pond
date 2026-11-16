import { cssVars } from "@pond/ui";
import { CardThumb } from "@/features/saves";
import type { Save } from "@/features/saves/types";
import styles from "./styles.module.css";

interface CompareProps {
  saves: readonly [Save, Save];
  zoom: number;
  grayscale: boolean;
  onZoom: (zoom: (current: number) => number) => void;
}

export function Compare({ saves, zoom, grayscale, onZoom }: CompareProps) {
  return (
    <div
      className={styles.compare}
      style={cssVars({ "--zoom": zoom })}
      onWheel={(event) => {
        event.preventDefault();
        onZoom((current) =>
          Math.max(0.5, Math.min(4, current * (event.deltaY < 0 ? 1.1 : 0.9))),
        );
      }}
    >
      {saves.map((save) => (
        <div
          key={save.id}
          className={styles.frame}
          data-grayscale={grayscale || undefined}
        >
          <div className={styles.media}>
            <CardThumb save={save} />
          </div>
        </div>
      ))}
    </div>
  );
}
