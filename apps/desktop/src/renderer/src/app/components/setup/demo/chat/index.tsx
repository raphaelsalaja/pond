import { Art } from "../art";
import { PaneHeader } from "../pane-header";
import styles from "./styles.module.css";

export function Chat({ connected = true }: { connected?: boolean }) {
  return (
    <div className={styles.chat}>
      <PaneHeader>
        <span className={styles.title}>Koi</span>
      </PaneHeader>
      {connected ? (
        <div className={styles.thread}>
          <span className={styles.ask}>Show me beach photos</span>
          <span className={styles.turn}>
            <span className={styles.typing}>
              <span />
              <span />
              <span />
            </span>
            <span className={styles.reply}>
              Here&apos;s one from your library.
            </span>
          </span>
          <span className={styles.attachment}>
            <span className={styles.thumb}>
              <Art kind="sunset" size="slot" />
            </span>
            <span className={styles.caption}>
              <span className={styles.name}>Sunset over the bay</span>
              <span className={styles.meta}>Photography</span>
            </span>
          </span>
        </div>
      ) : (
        <div className={styles.thread}>
          <span className={styles.empty}>
            Connect a provider in Settings to ask about your Library.
          </span>
        </div>
      )}
    </div>
  );
}
