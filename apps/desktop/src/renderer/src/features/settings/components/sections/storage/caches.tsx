import { Button, Settings } from "@pond/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { formatBytes } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";
import { STORAGE_SNAPSHOT_KEY, useStorageSnapshot } from "./storage-summary";

type Cache = "videoCache" | "thumbnails";

const CACHES: ReadonlyArray<{
  cache: Cache;
  bucket: "videoCache" | "thumbs";
  title: string;
  description: string;
}> = [
  {
    cache: "videoCache",
    bucket: "videoCache",
    title: "Video Cache",
    description: "Preview copies of videos. Rebuilt when you play them again.",
  },
  {
    cache: "thumbnails",
    bucket: "thumbs",
    title: "Thumbnails",
    description: "Grid previews. Rebuilt as you browse the Library.",
  },
];

/** A second click within this window confirms, so one stray click never clears anything. */
const CONFIRM_MS = 4000;

export function StorageCaches() {
  const snapshot = useStorageSnapshot();
  const client = useQueryClient();
  const [armed, setArmed] = useState<Cache | null>(null);
  const [clearing, setClearing] = useState<Cache | null>(null);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(null), CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [armed]);

  async function clear(cache: Cache, title: string) {
    setArmed(null);
    setClearing(cache);
    try {
      const { freedBytes } = await window.pond.query("storage.clearCache", {
        cache,
      });
      notify({
        id: "storage-cache",
        title: `Cleared ${title}`,
        description: `Freed ${formatBytes(freedBytes)}.`,
      });
      await client.invalidateQueries({ queryKey: STORAGE_SNAPSHOT_KEY });
    } catch {
      notify({ id: "storage-cache", title: `Couldn't clear ${title}` });
    } finally {
      setClearing(null);
    }
  }

  return (
    <Settings.List>
      {CACHES.map(({ cache, bucket, title, description }) => {
        const size = snapshot.data?.breakdown[bucket];
        return (
          <Settings.Item key={cache}>
            <Settings.ItemDetails>
              <Settings.ItemTitle>{title}</Settings.ItemTitle>
              <Settings.ItemDescription>
                {size === undefined
                  ? description
                  : `${formatBytes(size)} · ${description}`}
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Button
                size="sm"
                variant="secondary"
                loading={clearing === cache}
                disabled={clearing !== null || size === 0}
                onClick={() =>
                  armed === cache ? void clear(cache, title) : setArmed(cache)
                }
              >
                {armed === cache ? "Confirm Clear" : "Clear Cache"}
              </Button>
            </Settings.ItemControl>
          </Settings.Item>
        );
      })}
    </Settings.List>
  );
}
