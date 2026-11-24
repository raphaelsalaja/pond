import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { z } from "zod";
import { useWatchedFolderRevision } from "@/features/sources/state/watched-folder-flow";

const WatchedFolderSchema = z
  .object({
    enabled: z.boolean().catch(false),
    path: z.string().catch(""),
    mode: z.enum(["copy", "move"]).catch("copy"),
    history: z
      .array(
        z.object({
          at: z.number(),
          name: z.string(),
          mode: z.enum(["copy", "move"]),
          ok: z.boolean(),
          id: z.string().optional(),
        }),
      )
      .catch([]),
  })
  .catch({
    enabled: false,
    path: "",
    mode: "copy" as const,
    history: [],
  });

export type WatchedFolderStatus = z.infer<typeof WatchedFolderSchema>;

export function watchedFolderName(path: string): string {
  const name = path
    .replace(/[/\\]+$/, "")
    .split(/[/\\]/)
    .pop();
  return name || "Folder";
}

export function useWatchedFolder() {
  const revision = useWatchedFolderRevision();
  const query = useQuery({
    queryKey: ["watched-folder"],
    queryFn: async () =>
      WatchedFolderSchema.parse(
        await window.pond.query("autoImport.status", {}),
      ),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { refetch } = query;
  useEffect(() => {
    if (revision === 0) {
      return;
    }
    void refetch();
  }, [refetch, revision]);

  return query;
}
