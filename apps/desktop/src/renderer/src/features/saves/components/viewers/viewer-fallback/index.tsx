import { ViewerHud } from "@/features/saves/components/viewers/hud";
import { ChromePortal } from "@/features/saves/components/viewers/media-viewer/chrome";
import { OriginalFileActions } from "@/features/saves/components/viewers/original-file-actions";
import { ViewerSaveNav } from "@/features/saves/components/viewers/viewer-save-nav";
import {
  type ViewerNavigation,
  ViewerNavigationControls,
} from "@/features/saves/components/viewers/viewer-toolbar-groups";
import { useReportMediaReady } from "@/features/saves/hooks/use-media-ready";
import type { Save, SaveFile } from "@/features/saves/types";
import styles from "./styles.module.css";

export type ViewerFallbackReason = "decode" | "preview";

interface ViewerFallbackProps {
  save: Save;
  file: SaveFile;
  fileIndex: number;
  reason: ViewerFallbackReason;
  active?: boolean;
  slideNavigation?: ViewerNavigation;
}

export function ViewerFallback({
  save,
  file,
  fileIndex,
  reason,
  active = true,
  slideNavigation,
}: ViewerFallbackProps) {
  useReportMediaReady(true);
  const detail =
    reason === "preview"
      ? "Pond couldn't create a compatible preview. Open or export the original file."
      : "Pond couldn't decode this file. Open or export the original file.";

  return (
    <div className={styles.root} data-viewer-fallback>
      <div className={styles.card} role="status" aria-live="polite">
        <h2>This preview could not be rendered.</h2>
        <p>{detail}</p>
        <p className={styles.path}>{file.path}</p>
      </div>
      {active ? (
        <ChromePortal slot="top">
          <ViewerHud.Bar
            label="File fallback"
            start={<ViewerSaveNav saveId={save.id} />}
            center={<OriginalFileActions save={save} fileIndex={fileIndex} />}
            end={<ViewerNavigationControls navigation={slideNavigation} />}
          />
        </ChromePortal>
      ) : null}
    </div>
  );
}
