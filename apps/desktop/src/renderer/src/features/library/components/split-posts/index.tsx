import { IconImages } from "@pond/icons";
import { Empty } from "@pond/ui";
import type { SplitPostSummary } from "@shared/split-posts";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { LibraryLoading } from "@/features/library/components/empty";
import { selectLibraryNav } from "@/features/library/components/folder-sidebar/navigation";
import { useLibrarySaveGap } from "@/features/library/components/layouts/save-gap";
import { folderCoverUrl } from "@/features/library/lib/folder-cover";
import { Card, getSourceLabel } from "@/features/saves";
import { ensureSaves, useSave } from "@/features/saves/pool";
import { MatchesEmpty } from "@/shared/components/matches-empty";
import { SearchChrome } from "@/shared/components/search-chrome";
import { useResolvedTheme } from "@/shared/hooks/use-resolved-theme";
import { formatPlural } from "@/shared/lib/format";
import { usePrefs } from "@/shared/state/prefs";
import styles from "./styles.module.css";

const ITEMS = { one: "item", other: "items" };
const PREVIEW_COUNT = 4;

function postTitle(post: SplitPostSummary): string {
  return post.title || getSourceLabel(post.source);
}

function PostCard({
  post,
  galleryFit,
}: {
  post: SplitPostSummary;
  galleryFit: "fit" | "fill";
}) {
  const theme = useResolvedTheme();
  const first = useSave(post.saveIds[0]);
  const second = useSave(post.saveIds[1]);
  const third = useSave(post.saveIds[2]);
  const fourth = useSave(post.saveIds[3]);
  const previews = [first, second, third, fourth].flatMap((save) => {
    const src = save ? folderCoverUrl(save, 360, theme) : null;
    return save && src ? [{ id: save.id, src }] : [];
  });
  const title = postTitle(post);
  const meta = `${formatPlural(post.saveIds.length, ITEMS)} · ${getSourceLabel(post.source)}`;

  return (
    <li>
      <Card.Select
        className={styles.trigger}
        aria-label={`Open ${title}, ${meta}`}
        onClick={() => selectLibraryNav({ kind: "post", key: post.key, title })}
      >
        <Card.Media>
          <span className={styles.cover}>
            {previews.length > 0 ? (
              previews.map((preview) => (
                <span className={styles.preview} key={preview.id}>
                  <img src={preview.src} alt="" data-fit={galleryFit} />
                </span>
              ))
            ) : (
              <span className={styles.fallback}>
                <IconImages />
              </span>
            )}
          </span>
        </Card.Media>
        <Card.Meta title={title} time={meta} />
      </Card.Select>
    </li>
  );
}

export function SplitPostsPage() {
  const [q, setQ] = useState("");
  const [viewer] = usePrefs("viewer");
  const gap = useLibrarySaveGap();
  const posts = useQuery({
    queryKey: ["saves.splitPosts"],
    queryFn: async () => {
      const result = await window.pond.query("saves.splitPosts", {});
      await ensureSaves(
        result.flatMap((post) => post.saveIds.slice(0, PREVIEW_COUNT)),
      );
      return result;
    },
  });
  const { refetch } = posts;

  useEffect(
    () =>
      window.pond.onSyncAction((event) => {
        if (event.modelName === "save") void refetch();
      }),
    [refetch],
  );

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = posts.data ?? [];
    if (!needle) return all;
    return all.filter((post) =>
      `${postTitle(post)} ${getSourceLabel(post.source)}`
        .toLowerCase()
        .includes(needle),
    );
  }, [posts.data, q]);

  return (
    <div className={styles.page}>
      <SearchChrome.Root>
        <SearchChrome.Input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          spellCheck={false}
          placeholder="Search split posts…"
          aria-label="Search Split Posts"
        />
      </SearchChrome.Root>
      <div className={styles.body} data-scroll-fade="vertical">
        {posts.isPending ? (
          <LibraryLoading />
        ) : (posts.data ?? []).length === 0 ? (
          <Empty.Root>
            <Empty.Media>
              <IconImages size={32} />
            </Empty.Media>
            <Empty.Title>Split Posts</Empty.Title>
            <Empty.Description>
              Split a gallery into Saves and its post stays together here.
            </Empty.Description>
          </Empty.Root>
        ) : visible.length === 0 ? (
          <MatchesEmpty
            actionLabel="Clear Search"
            description="Try a different search."
            onReset={() => setQ("")}
          />
        ) : (
          <ul className={styles.grid} style={{ gap }}>
            {visible.map((post) => (
              <PostCard
                key={post.key}
                post={post}
                galleryFit={viewer.galleryFit}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
