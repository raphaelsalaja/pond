import { IconDotsOutline18 } from "@pond/icons/outline/18";
import { Tooltip } from "@pond/ui";
import { useParams } from "react-router-dom";
import { useTrackVisit } from "@/components/recents";
import { SavePreview } from "@/components/save-preview";
import { useSave } from "@/pool/hooks";
import styles from "./styles.module.css";

export function SaveDetail() {
  const { id } = useParams<{ id: string }>();
  const save = useSave(id);

  useTrackVisit(id);

  return (
    <aside aria-label="Inspector" className={styles.pane}>
      <div className={styles.toolbar}>
        <Tooltip.Root content="More" side="bottom">
          <button
            type="button"
            aria-label="More options"
            className={styles["toolbar-btn"]}
          >
            <IconDotsOutline18 width={14} height={14} />
          </button>
        </Tooltip.Root>
      </div>
      <div className={styles.body}>
        {save ? (
          <SavePreview.Pane save={save} />
        ) : id ? (
          <p className={styles.empty}>Save not found.</p>
        ) : (
          <p className={styles.empty}>Select a save to inspect.</p>
        )}
      </div>
    </aside>
  );
}
