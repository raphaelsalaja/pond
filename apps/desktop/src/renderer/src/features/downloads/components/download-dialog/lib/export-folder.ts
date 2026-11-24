import { useQuery, useQueryClient } from "@tanstack/react-query";

const FOLDER_KEY = ["downloader.exportFolder"];

/** The folder File exports land in, shared by every page in the dialog. */
export function useExportFolder() {
  const queryClient = useQueryClient();
  const folder = useQuery({
    queryKey: FOLDER_KEY,
    queryFn: () => window.pond.query("downloader.exportFolder", {}),
  });
  const choose = async () => {
    const picked = await window.pond.query("downloader.pickExportFolder", {});
    if (picked) {
      queryClient.setQueryData(FOLDER_KEY, picked);
    }
    return picked;
  };
  return { name: folder.data?.name ?? null, choose };
}
