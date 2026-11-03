import { Button } from "@pond/ui";
import { useState } from "react";
import { ViewerHud } from "@/features/saves/components/viewers/hud";
import { ChromePortal } from "@/features/saves/components/viewers/media-viewer/chrome";
import { isHttpUrl } from "@/features/saves/lib/url-list";
import type { Save } from "@/features/saves/types";
import { notify } from "@/shared/lib/toast";
import styles from "./styles.module.css";

export function VideoDownload({ save }: { save: Save }) {
  const [downloading, setDownloading] = useState(false);
  const url = isHttpUrl(save.url) ? save.url : null;

  const fail = (title: string) => {
    setDownloading(false);
    notify({ id: "download-video", title });
  };

  const download = () => {
    setDownloading(true);
    window.pond
      .query("saves.downloadVideo", { ids: [save.id] })
      .then((result) => {
        if (!result.ok) fail("Couldn't download video");
        else if (result.queued === 0) fail("No videos to download");
      })
      .catch(() => fail("Couldn't download video"));
  };

  return (
    <ChromePortal slot="bottom">
      <div className={styles.notice} data-placement="above-chrome">
        <ViewerHud.Pill className={styles.root} aria-label="Video download">
          <span className={styles.label}>Video not downloaded</span>
          <Button
            size="sm"
            variant="primary"
            rounding="full"
            disabled={downloading}
            onClick={download}
          >
            {downloading ? "Downloading" : "Download Video"}
          </Button>
          {url ? (
            <Button
              size="sm"
              variant="ghost"
              rounding="full"
              onClick={() => void window.pond.openExternal(url)}
            >
              Open Original
            </Button>
          ) : null}
        </ViewerHud.Pill>
      </div>
    </ChromePortal>
  );
}
