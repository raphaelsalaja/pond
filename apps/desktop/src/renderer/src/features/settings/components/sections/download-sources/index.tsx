import { EXTERNAL_SOURCE_IDS, sourceLabel } from "@pond/schema/sources";
import type { ExternalSource } from "@pond/schema/sources";
import { Button, Settings } from "@pond/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useDownloadSettings } from "@/features/settings/components/sections/downloads";
import {
  hasSourceOverrides,
  missingVideosDescription,
  queuedVideosTitle,
  sourceSectionId,
} from "@/features/settings/lib/download-sources";
import { BrandTile } from "@/features/sources";
import { openSettings } from "@/shared/lib/open-settings";
import { notify } from "@/shared/lib/toast";
import styles from "./styles.module.css";

export function DownloadSources() {
  const { data } = useDownloadSettings();
  return (
    <Settings.List>
      {EXTERNAL_SOURCE_IDS.map((source) => {
        const label = sourceLabel(source);
        return (
          <Settings.Item key={source}>
            <div className={styles.identity}>
              <BrandTile source={source} size={20} />
              <Settings.ItemDetails>
                <Settings.ItemTitle>{label}</Settings.ItemTitle>
                {data && hasSourceOverrides(data, source) ? (
                  <Settings.ItemDescription>Custom</Settings.ItemDescription>
                ) : null}
              </Settings.ItemDetails>
            </div>
            <Settings.ItemControl>
              <Button
                size="sm"
                variant="secondary"
                aria-label={`Edit ${label}`}
                onClick={() => openSettings(sourceSectionId(source))}
              >
                Edit
              </Button>
            </Settings.ItemControl>
          </Settings.Item>
        );
      })}
    </Settings.List>
  );
}

export function MissingVideos({ source }: { source?: ExternalSource }) {
  const [queued, setQueued] = useState(false);
  const [pending, setPending] = useState(false);
  const { data, refetch } = useQuery({
    queryKey: ["saves", "missingVideoCount", source ?? "all"],
    queryFn: () => window.pond.query("saves.missingVideoCount", { source }),
  });
  const count = data?.count ?? 0;

  const download = () => {
    setPending(true);
    void window.pond
      .query("saves.downloadMissingVideos", { source })
      .then((result) => {
        notify({
          id: "download-missing-videos",
          title: result.ok
            ? queuedVideosTitle(result.queued)
            : "Couldn't download videos",
        });
        if (result.ok && result.queued > 0) setQueued(true);
      })
      .catch(() =>
        notify({
          id: "download-missing-videos",
          title: "Couldn't download videos",
        }),
      )
      .finally(() => {
        setPending(false);
        void refetch();
      });
  };

  return (
    <Settings.List>
      <Settings.Item>
        <Settings.ItemDetails>
          <Settings.ItemTitle>Download Missing Videos</Settings.ItemTitle>
          <Settings.ItemDescription>
            {data ? missingVideosDescription(count) : null}
          </Settings.ItemDescription>
        </Settings.ItemDetails>
        <Settings.ItemControl>
          <Button
            size="sm"
            variant="secondary"
            disabled={!data || count === 0 || queued || pending}
            onClick={download}
          >
            {queued ? "Queued" : "Download"}
          </Button>
        </Settings.ItemControl>
      </Settings.Item>
    </Settings.List>
  );
}
