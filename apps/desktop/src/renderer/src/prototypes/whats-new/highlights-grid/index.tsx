import { IconSparkle } from "@pond/icons";
import { Button, Dialog } from "@pond/ui";
import {
  countItems,
  HIGHLIGHTS,
  LATEST,
  openReleases,
  RELEASES,
} from "../fixture";
import { Frame } from "../frame";
import styles from "./styles.module.css";

const REST =
  RELEASES.reduce((sum, entry) => sum + countItems(entry), 0) -
  HIGHLIGHTS.length;

export function HighlightsGrid() {
  return (
    <Frame.Stage>
      <Frame.Popup width={640}>
        <Frame.Close />
        <Dialog.Header className={styles.header}>
          <Dialog.Title>What's New in Pond {LATEST.version}</Dialog.Title>
          <Dialog.Description>
            Highlights from the {RELEASES.length} updates since you last opened
            Pond.
          </Dialog.Description>
        </Dialog.Header>
        <ul className={styles.grid}>
          {HIGHLIGHTS.map((highlight) => (
            <li key={highlight.text} className={styles.tile}>
              <IconSparkle size={18} className={styles.icon} aria-hidden />
              <p className={styles.text}>{highlight.text}</p>
              <span className={styles.version}>{highlight.version}</span>
            </li>
          ))}
        </ul>
        <Dialog.Footer
          leading={
            <Button variant="link" onClick={openReleases}>
              {REST} More Changes
            </Button>
          }
        >
          <Dialog.Confirm>Done</Dialog.Confirm>
        </Dialog.Footer>
      </Frame.Popup>
    </Frame.Stage>
  );
}
