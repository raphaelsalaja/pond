import type { SplitPostSummary } from "@shared/split-posts";
import { useQuery } from "@tanstack/react-query";
import { getSourceLabel } from "@/features/saves";
import { ensureSaves } from "@/features/saves/pool";

const PREVIEW_COUNT = 4;

export function postTitle(post: SplitPostSummary): string {
  return post.title || getSourceLabel(post.source);
}

export function useSplitPosts(enabled = true) {
  return useQuery({
    queryKey: ["saves.splitPosts"],
    enabled,
    queryFn: async () => {
      const result = await window.pond.query("saves.splitPosts", {});
      await ensureSaves(
        result.flatMap((post) => post.saveIds.slice(0, PREVIEW_COUNT)),
      );
      return result;
    },
  });
}

export function useSplitPostTitle(key: string | null): string | undefined {
  const posts = useSplitPosts(key !== null);
  if (!key) return undefined;
  const post = posts.data?.find((entry) => entry.key === key);
  return post ? postTitle(post) : undefined;
}
