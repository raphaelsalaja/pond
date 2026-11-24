import { Button } from "@pond/ui";
import {
  playUpdatePreview,
  showUpdateButtonPreview,
  type UpdateButtonPreview,
} from "@/features/settings";
import styles from "./styles.module.css";

const ROW_STATES: { state: UpdateButtonPreview; label: string }[] = [
  { state: "available", label: "Available" },
  { state: "downloading", label: "Downloading" },
  { state: "downloaded", label: "Ready" },
  { state: "none", label: "Hidden" },
];

export function UpdateFlowPrototype() {
  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <h2 className={styles.title}>Overlay</h2>
        <p className={styles.description}>
          Plays checking, prompt, download and restart with fake updater data.
          Press Escape during the download to watch the rail button take over.
        </p>
        <div className={styles.actions}>
          <Button size="sm" onClick={() => void playUpdatePreview()}>
            Play Update Flow
          </Button>
        </div>
      </section>
      <section className={styles.section}>
        <h2 className={styles.title}>Rail Button</h2>
        <p className={styles.description}>
          Sets the button above What's New in the sidebar rail. Click it to
          open the overlay at that step.
        </p>
        <div className={styles.actions}>
          {ROW_STATES.map(({ state, label }) => (
            <Button
              key={state}
              variant="secondary"
              size="sm"
              onClick={() => showUpdateButtonPreview(state)}
            >
              {label}
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
}
