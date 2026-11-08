import { Dialog } from "@pond/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { downloadDialog } from "@/features/downloads/state/download-dialog";
import { formatBytes } from "@/shared/lib/format";
import { DownloadOptions } from "../export-options";
import {
  COMPRESSION_FACTOR,
  requestOf,
  useExportSettings,
} from "../export-options/settings";
import type { Clip } from "../lib/clip";
import { runExport } from "./run";
import styles from "./styles.module.css";

const FOLDER_KEY = ["downloader.exportFolder"];

interface ExportDialogProps {
  clip: Clip;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function useExportFolder() {
  const queryClient = useQueryClient();
  const folder = useQuery({
    queryKey: FOLDER_KEY,
    queryFn: () => window.pond.query("downloader.exportFolder", {}),
  });
  const choose = async () => {
    const picked = await window.pond.query("downloader.pickExportFolder", {});
    if (picked) queryClient.setQueryData(FOLDER_KEY, picked);
    return picked;
  };
  return { name: folder.data?.name ?? null, choose };
}

/** Every export option at once, nested over the editor. */
export function ExportDialog({ clip, open, onOpenChange }: ExportDialogProps) {
  const settings = useExportSettings();
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
    onOpenChange(false);
    downloadDialog.close();
    void runExport(
      clip.probe.url,
      clip.probe.title,
      request,
      settings.value.destination,
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className={styles.popup} data-own-keys="">
          <Dialog.Header>
            <Dialog.Title>Export</Dialog.Title>
            <Dialog.Close />
          </Dialog.Header>
          <Dialog.Content className={styles.body}>
            <div className={styles.fields}>
              <DownloadOptions.Mode clip={clip} />
              <DownloadOptions.Format clip={clip} settings={settings} />
              {mode === "video" ? (
                <>
                  <DownloadOptions.Quality clip={clip} />
                  <DownloadOptions.FrameRate clip={clip} settings={settings} />
                  <div className={styles.wide}>
                    <DownloadOptions.Compression settings={settings} />
                  </div>
                </>
              ) : null}
              {mode === "transcript" ? (
                <DownloadOptions.Language clip={clip} />
              ) : null}
              <div className={styles.wide}>
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
              </div>
            </div>
          </Dialog.Content>
          <Dialog.Footer
            leading={
              size ? (
                <span className={styles.estimate}>
                  About {formatBytes(size)}
                </span>
              ) : null
            }
          >
            <Dialog.Cancel />
            <Dialog.Confirm onClick={submit}>Export</Dialog.Confirm>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
