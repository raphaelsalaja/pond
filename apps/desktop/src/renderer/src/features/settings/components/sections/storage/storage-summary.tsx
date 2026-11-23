import { Button, Settings } from "@pond/ui";
import { useQueryClient } from "@tanstack/react-query";
import { formatBytes } from "@/shared/lib/format";
import { StorageBreakdown } from "./breakdown";
import { refreshStorage, useStorageSnapshot } from "./lib/queries";

export function StorageSummary() {
  const query = useStorageSnapshot();
  const client = useQueryClient();
  const data = query.data;
  return (
    <Settings.List>
      <Settings.Item>
        <Settings.ItemDetails>
          <Settings.ItemTitle>Library Size</Settings.ItemTitle>
          <Settings.ItemDescription>
            {data
              ? `${formatBytes(data.pondBytes)} used · ${formatBytes(data.deviceFreeBytes)} available of ${formatBytes(data.deviceTotalBytes)} · Updated ${new Date(data.computedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
              : query.isError
                ? "Couldn't measure storage."
                : "Measuring storage"}
          </Settings.ItemDescription>
        </Settings.ItemDetails>
        <Settings.ItemControl>
          <Button
            size="sm"
            variant="secondary"
            loading={query.isFetching}
            onClick={() => void refreshStorage(client)}
          >
            Refresh
          </Button>
        </Settings.ItemControl>
      </Settings.Item>
      {data ? <StorageBreakdown breakdown={data.breakdown} /> : null}
    </Settings.List>
  );
}
