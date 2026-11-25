import { downloadDialog } from "@/features/downloads/state/download-dialog";
import { formatBytes } from "@/shared/lib/format";
import { DownloadOptions } from "../export-options";
import {
  COMPRESSION_FACTOR,
  requestOf,
  useExportSettings,
} from "../export-options/settings";
import type { ExportSettings } from "../export-options/settings";
import type { Clip } from "../lib/clip";
import { useExportFolder } from "../lib/export-folder";
import { Summary } from "../summary";
import { runExport } from "./run";
import styles from "./styles.module.css";

interface PanelProps {
  clip: Clip;
  initialSettings?: Partial<ExportSettings>;
}

/** Every download option beside the editor, with Download at the foot. */
export function Panel({ clip, initialSettings }: PanelProps) {
  const settings = useExportSettings(initialSettings);
  const folder = useExportFolder();
  const mode = clip.request.mode;
  const request = requestOf(clip, settings.value);
  /** GIF size depends on the picture, so there's no honest estimate. */
  const size =
    !clip.size || request.container === "gif"
      ? null
      : mode === "video"
        ? clip.size * COMPRESSION_FACTOR[request.compression]
        : clip.size;

  const submit = () => {
    downloadDialog.close();
    void runExport(
      clip.probe.url,
      clip.probe.title,
      request,
      settings.value.destination,
    );
  };

  return (
    <Summary.Root data-own-keys="">
      <Summary.Fields>
        <DownloadOptions.Mode clip={clip} />
        <DownloadOptions.Format clip={clip} settings={settings} />
        {mode === "video" ? (
          <>
            <DownloadOptions.Quality clip={clip} />
            <DownloadOptions.FrameRate clip={clip} settings={settings} />
            <DownloadOptions.Compression settings={settings} />
          </>
        ) : null}
        {mode === "transcript" ? (
          <DownloadOptions.Language clip={clip} />
        ) : null}
        <DownloadOptions.Destination
          clip={clip}
          settings={settings}
          folder={folder.name}
          onChooseFolder={() =>
            void folder.choose().then((picked) => {
              if (picked) settings.patch({ destination: "file" });
            })
          }
        />
      </Summary.Fields>
      <Summary.Foot>
        <Summary.Download onClick={submit} />
        {size ? (
          <span className={styles.estimate}>About {formatBytes(size)}</span>
        ) : null}
      </Summary.Foot>
    </Summary.Root>
  );
}
