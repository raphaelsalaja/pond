import { Button, Settings } from "@pond/ui";
import { useQuery } from "@tanstack/react-query";
import { systemLocale } from "@/shared/lib/system-locale";

const bytes = (value: number) =>
  `${(value / 1024 ** 3).toLocaleString(systemLocale, { maximumFractionDigits: 2 })} GB`;

export function StorageSummary() {
  const query = useQuery({
    queryKey: ["storage-snapshot"],
    queryFn: () => window.pond.query("storage.snapshot", {}),
    refetchInterval: 60_000,
  });
  return (
    <Settings.List>
      <Settings.Item>
        <Settings.ItemDetails>
          <Settings.ItemTitle>Library Size</Settings.ItemTitle>
          <Settings.ItemDescription>
            {query.data
              ? `${bytes(query.data.pondBytes)} used · ${bytes(query.data.deviceFreeBytes)} available on disk`
              : query.isError
                ? "Couldn't measure storage."
                : "Measuring storage"}
          </Settings.ItemDescription>
        </Settings.ItemDetails>
        <Settings.ItemControl>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void query.refetch()}
          >
            Refresh
          </Button>
        </Settings.ItemControl>
      </Settings.Item>
    </Settings.List>
  );
}
