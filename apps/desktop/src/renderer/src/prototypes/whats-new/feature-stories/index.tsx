import { IconXmark } from "@pond/icons";
import { Button, Dialog } from "@pond/ui";
import { useState } from "react";
import { Clip } from "../clip";
import { HIGHLIGHTS } from "../fixture";
import { Frame } from "../frame";
import styles from "./styles.module.css";

export function FeatureStories() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const highlight = HIGHLIGHTS[index] ?? HIGHLIGHTS[0];
  if (!highlight) return null;
  const last = index === HIGHLIGHTS.length - 1;
  const go = (next: number) =>
    setIndex(Math.max(0, Math.min(HIGHLIGHTS.length - 1, next)));

  return (
    <Frame.Stage>
      <Frame.Popup
        width={520}
        className={styles.popup}
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
      >
        <div className={styles.header}>
          <div className={styles.segments}>
            {HIGHLIGHTS.map((item, i) => (
              <span key={item.text} className={styles.segment}>
                <span
                  key={i === index ? `run:${index}` : "idle"}
                  className={styles.fill}
                  data-state={
                    i < index ? "done" : i === index ? "run" : undefined
                  }
                  data-paused={paused || undefined}
                  onAnimationEnd={() => {
                    if (!last) go(index + 1);
                  }}
                />
              </span>
            ))}
          </div>
          <Button icon size="xs" variant="ghost" aria-label="Close">
            <IconXmark size={12} />
          </Button>
        </div>
        <div className={styles.media}>
          <Clip />
          <button
            type="button"
            className={styles.zone}
            data-side="back"
            aria-label="Previous"
            onClick={() => go(index - 1)}
          />
          <button
            type="button"
            className={styles.zone}
            data-side="next"
            aria-label="Next"
            onClick={() => go(index + 1)}
          />
        </div>
        <div key={highlight.text} className={styles.copy}>
          <p className={styles.eyebrow}>
            New in Pond {highlight.version} · {index + 1} of {HIGHLIGHTS.length}
          </p>
          <Dialog.Title className={styles.title}>{highlight.text}</Dialog.Title>
        </div>
        <Dialog.Footer>
          <Button variant="secondary">Skip</Button>
          <Dialog.Confirm onClick={() => (last ? go(0) : go(index + 1))}>
            {last ? "Done" : "Next"}
          </Dialog.Confirm>
        </Dialog.Footer>
      </Frame.Popup>
    </Frame.Stage>
  );
}
