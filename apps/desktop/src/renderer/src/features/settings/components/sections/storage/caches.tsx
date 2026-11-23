import { Button, Dialog, Settings } from "@pond/ui";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { formatBytes } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";
import { refreshStorage, useStorageSnapshot } from "./lib/queries";

interface Cache {
  query: "reset.clearVideoCache" | "reset.clearThumbnails";
  bucket: "videoCache" | "thumbs";
  title: string;
  description: string;
  clears: string;
  rebuilds: string;
}

const CACHES: readonly Cache[] = [
  {
    query: "reset.clearVideoCache",
    bucket: "videoCache",
    title: "Video Cache",
    description: "Preview copies of videos, rebuilt when you play them again.",
    clears:
      "This removes the preview copies Pond made of your videos. The original files stay in your Library.",
    rebuilds: "Pond makes them again the next time you play each video.",
  },
  {
    query: "reset.clearThumbnails",
    bucket: "thumbs",
    title: "Thumbnails",
    description: "Grid previews, rebuilt as you browse the Library.",
    clears:
      "This removes the preview images Pond shows in the grid. Your Saves and their files stay as they are.",
    rebuilds: "Pond makes them again as you browse the Library.",
  },
];

function confirmClear(
  cache: Cache,
  size: number | undefined,
  client: QueryClient,
) {
  const space = size ? ` You get back about ${formatBytes(size)}.` : "";
  Dialog.confirm({
    title: `Clear ${cache.title}`,
    description: `${cache.clears}${space} ${cache.rebuilds}`,
    confirmLabel: "Clear Cache",
    onConfirm: async () => {
      const result = await window.pond.query(cache.query, {}).catch(() => null);
      if (!result?.ok) {
        throw new Error(`Couldn't clear the ${cache.title}. Try again.`);
      }
      notify({
        id: "storage-cache",
        title: `Cleared ${cache.title}`,
        description: `Freed ${formatBytes(result.freedBytes)}.`,
      });
      await refreshStorage(client);
    },
  });
}

export function StorageCaches() {
  const snapshot = useStorageSnapshot();
  const client = useQueryClient();
  return (
    <Settings.List>
      {CACHES.map((cache) => {
        const size = snapshot.data?.breakdown[cache.bucket];
        return (
          <Settings.Item key={cache.query}>
            <Settings.ItemDetails>
              <Settings.ItemTitle>{cache.title}</Settings.ItemTitle>
              <Settings.ItemDescription>
                {size === undefined
                  ? cache.description
                  : `${formatBytes(size)} · ${cache.description}`}
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Button
                size="sm"
                variant="secondary"
                disabled={size === 0}
                onClick={() => confirmClear(cache, size, client)}
              >
                Clear Cache
              </Button>
            </Settings.ItemControl>
          </Settings.Item>
        );
      })}
    </Settings.List>
  );
}
