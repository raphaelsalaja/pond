import { IconLayers } from "@pond/icons";
import { Button, Empty, EmptyPreview } from "@pond/ui";
import type { SplitPostSummary } from "@shared/split-posts";
import { useEffect, useMemo, useState } from "react";
import { LibraryLoading } from "@/features/library/components/empty";
import { selectLibraryNav } from "@/features/library/components/folder-sidebar/navigation";
import { useLibrarySaveGap } from "@/features/library/components/layouts/save-gap";
import {
  postTitle,
  useSplitPosts,
} from "@/features/library/hooks/use-split-posts";
import { folderCoverUrl } from "@/features/library/lib/folder-cover";
import { Card, getSourceLabel } from "@/features/saves";
import { useSave } from "@/features/saves/pool";
import { MatchesEmpty } from "@/shared/components/matches-empty";
import { SearchChrome } from "@/shared/components/search-chrome";
import { useResolvedTheme } from "@/shared/hooks/use-resolved-theme";
import { formatPlural } from "@/shared/lib/format";
import { usePrefs } from "@/shared/state/prefs";
import { SplitPostsIntro } from "./intro";
import styles from "./styles.module.css";

const ITEMS = { one: "item", other: "items" };

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
        onClick={() => selectLibraryNav({ kind: "post", key: post.key })}
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
                <IconLayers />
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
  const posts = useSplitPosts();
  const { refetch } = posts;

  useEffect(
    () =>
      window.pond.onSyncAction((event) => {
        if (event.modelName === "save") {
          void refetch();
        }
      }),
    [refetch],
  );

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = posts.data ?? [];
    if (!needle) {
      return all;
    }
    return all.filter((post) =>
      `${postTitle(post)} ${getSourceLabel(post.source)}`
        .toLowerCase()
        .includes(needle),
    );
  }, [posts.data, q]);

  if (posts.isSuccess && posts.data.length === 0) {
    return <SplitPostsIntro />;
  }

  return (
    <div className={styles.page}>
      <SearchChrome.Root>
        <SearchChrome.Field
          value={q}
          onChange={(event) => setQ(event.target.value)}
          aria-label="Search Split Posts"
        />
      </SearchChrome.Root>
      <div className={styles.body} data-scroll-fade="vertical">
        {posts.isPending ? (
          <LibraryLoading />
        ) : posts.isError ? (
          <Empty.Root role="alert">
            <Empty.Media>
              <EmptyPreview.Root kind="tile">
                <EmptyPreview.Column>
                  <EmptyPreview.Block>
                    <IconLayers size={12} />
                  </EmptyPreview.Block>
                  <EmptyPreview.Line width={36} />
                  <EmptyPreview.Line width={28} tone="thin" />
                </EmptyPreview.Column>
              </EmptyPreview.Root>
            </Empty.Media>
            <Empty.Title>Couldn&apos;t Load Split Posts</Empty.Title>
            <Empty.Description>Try again in a moment.</Empty.Description>
            <Empty.Action>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void refetch()}
              >
                Try Again
              </Button>
            </Empty.Action>
          </Empty.Root>
        ) : visible.length === 0 ? (
          <MatchesEmpty query={q} onReset={() => setQ("")} />
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
