import { PrefsSchema } from "@pond/schema";
import { Settings } from "@pond/ui";
import { useQuery } from "@tanstack/react-query";
import { systemLocale } from "@/shared/lib/system-locale";

export function BackupSummary() {
  const backup = useQuery({
    queryKey: ["storage-backup"],
    queryFn: async () =>
      PrefsSchema.parse(await window.pond.query("settings.getPrefs", {}))
        .storage.lastBackup,
  });
  const storage = useQuery({
    queryKey: ["storage-snapshot"],
    queryFn: () => window.pond.query("storage.snapshot", {}),
  });
  const lastBackup =
    backup.data?.libraryRoot === storage.data?.libraryRoot ? backup.data : null;

  return (
    <Settings.List>
      <Settings.Item>
        <Settings.ItemDetails>
          <Settings.ItemTitle>Last Backup</Settings.ItemTitle>
          <Settings.ItemDescription>
            {lastBackup
              ? `${new Date(lastBackup.completedAt).toLocaleString(systemLocale)} · ${lastBackup.path}`
              : "No backup recorded for this library yet."}
          </Settings.ItemDescription>
        </Settings.ItemDetails>
      </Settings.Item>
    </Settings.List>
  );
}
