import { IconMediaPlay } from "@pond/icons";
import styles from "./styles.module.css";

const WAVE = [4, 8, 12, 7, 14, 10, 16, 9, 6, 13, 8, 15, 6, 11, 5, 9];

const CUES = [
  ["0:02", "Start with the room."],
  ["0:06", "Then find the voice."],
  ["0:11", "Keep what breathes."],
  ["0:15", "Cut the rest."],
] as const;

export function TranscriptPlayer() {
  return (
    <span className={styles.player}>
      <span className={styles.controls}>
        <span className={styles.play}>
          <IconMediaPlay size={10} />
        </span>
        <span className={styles.wave}>
          {WAVE.map((height, index) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: static decorative bars
              key={index}
              style={{ height }}
              data-played={index < 7 || undefined}
            />
          ))}
        </span>
      </span>
      <span className={styles.cues}>
        {CUES.map(([time, line], index) => (
          <span
            key={time}
            className={styles.cue}
            data-current={index === 1 || undefined}
          >
            <span className={styles.time}>{time}</span>
            {line}
          </span>
        ))}
      </span>
    </span>
  );
}
