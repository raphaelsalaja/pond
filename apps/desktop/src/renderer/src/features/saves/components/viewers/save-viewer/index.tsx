import { useHotkey } from "@tanstack/react-hotkeys";
import {
  type RefObject,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { StoredFileContent } from "@/features/saves/components/viewers/file-viewer";
import {
  MediaViewerFrame,
  type ViewerNav,
} from "@/features/saves/components/viewers/media-viewer";
import {
  type MediaSlide,
  Slide,
} from "@/features/saves/components/viewers/media-viewer/slide";
import type { ViewerNavigation } from "@/features/saves/components/viewers/viewer-toolbar-groups";
import { MediaReadyContext } from "@/features/saves/hooks/use-media-ready";
import {
  type ChapterCue,
  chaptersForSave,
} from "@/features/saves/lib/media/chapters-vtt";
import {
  PRELOAD_SETTLE_MS,
  preloadableImageUrl,
  preloadImage,
} from "@/features/saves/lib/media/preload";
import { needsVideoDownload } from "@/features/saves/lib/media/video-download";
import {
  buildViewerItems,
  type ViewerItem,
} from "@/features/saves/lib/media/viewer-item";
import { openSave } from "@/features/saves/lib/save-nav";
import type { Save } from "@/features/saves/types";
import { useResolvedTheme } from "@/shared/hooks/use-resolved-theme";
import { bindingKeys, useShortcutBindings } from "@/shared/lib/shortcuts";
import { type StageEntry, useHeldStage } from "./held-stage";
import styles from "./styles.module.css";
import { VideoDownload } from "./video-download";

interface SaveViewerProps {
  save: Save;
  onNavigate?: (id: string) => void;
  onActiveFileIndexChange?: (fileIndex: number | null) => void;
  navRef?: RefObject<ViewerNav | null>;
  showControls?: boolean;
}

interface StageItem {
  save: Save;
  item: ViewerItem;
  chapters?: ChapterCue[];
}

interface ViewerItemContentProps {
  save: Save;
  item: ViewerItem;
  active: boolean;
  navigation?: ViewerNavigation;
  onNavigate?: (id: string) => void;
  chapters?: ChapterCue[];
}

function mediaSlideFor(save: Save, item: ViewerItem): MediaSlide {
  const file = save.files[item.fileIndex];
  return {
    src: item.url,
    fileIndex: item.fileIndex,
    isVideo: item.capability.surface === "temporal",
    generated:
      item.capability.surface === "raster" &&
      item.capability.source === "generated",
    isAnimation:
      file?.mimeType === "image/gif" || /\.gif$/i.test(file?.path ?? ""),
    posterUrl: item.posterUrl,
    width: file?.width ?? save.width ?? undefined,
    height: file?.height ?? save.height ?? undefined,
  };
}

function isMediaItem(item: ViewerItem): boolean {
  return (
    item.capability.surface === "raster" ||
    item.capability.surface === "temporal"
  );
}

function ViewerItemContent({
  save,
  item,
  active,
  navigation,
  onNavigate,
  chapters,
}: ViewerItemContentProps) {
  const file = save.files[item.fileIndex];
  if (!file) return null;

  if (
    item.capability.surface === "raster" ||
    item.capability.surface === "temporal"
  ) {
    const slide = mediaSlideFor(save, item);
    return (
      <Slide
        slide={slide}
        save={save}
        active={active}
        inView
        onNavigate={onNavigate}
        title={save.title}
        artist={save.author}
        chapters={chapters}
        slideNavigation={navigation}
      />
    );
  }

  return (
    <Suspense fallback={<div role="status">Loading preview</div>}>
      <StoredFileContent
        save={save}
        file={file}
        fileIndex={item.fileIndex}
        url={item.url}
        active={active}
        navigation={navigation}
        viewerKind={item.capability.kind}
      />
    </Suspense>
  );
}

export function SaveViewer({
  save,
  onNavigate = openSave,
  onActiveFileIndexChange,
  navRef,
  showControls = true,
}: SaveViewerProps) {
  const theme = useResolvedTheme();
  const shortcuts = useShortcutBindings();
  const items = useMemo(() => buildViewerItems(save, { theme }), [save, theme]);
  const chapters = useMemo(
    () =>
      items.filter((item) => item.capability.surface === "temporal").length ===
      1
        ? chaptersForSave(save)
        : undefined,
    [items, save],
  );
  const [position, setPosition] = useState({ saveId: save.id, index: 0 });
  const activeIndex = position.saveId === save.id ? position.index : 0;
  const activeIndexRef = useRef(0);
  const boundedIndex = Math.min(activeIndex, Math.max(0, items.length - 1));
  const activeItem = items[boundedIndex];
  const activeFile = activeItem ? save.files[activeItem.fileIndex] : undefined;

  useEffect(() => {
    activeIndexRef.current = boundedIndex;
    if (activeIndex !== boundedIndex)
      setPosition({ saveId: save.id, index: boundedIndex });
  }, [activeIndex, boundedIndex, save.id]);

  const step = useCallback(
    (delta: number): boolean => {
      const current = Math.min(
        activeIndexRef.current,
        Math.max(0, items.length - 1),
      );
      const next = Math.min(items.length - 1, Math.max(0, current + delta));
      if (items.length === 0 || next === current) return false;
      activeIndexRef.current = next;
      setPosition({ saveId: save.id, index: next });
      return true;
    },
    [items.length, save.id],
  );

  const navigation = useMemo<ViewerNavigation | undefined>(
    () =>
      items.length > 1
        ? {
            index: boundedIndex,
            count: items.length,
            onPrevious: () => step(-1),
            onNext: () => step(1),
          }
        : undefined,
    [boundedIndex, items.length, step],
  );

  const slideHotkeysEnabled =
    items.length > 1 &&
    activeItem?.capability.surface !== "temporal" &&
    !(
      activeFile?.mimeType === "image/gif" ||
      /\.gif$/i.test(activeFile?.path ?? "")
    );
  useHotkey(
    bindingKeys(shortcuts, "viewer.prev-slide"),
    (event) => {
      event.preventDefault();
      step(-1);
    },
    {
      preventDefault: false,
      ignoreInputs: true,
      conflictBehavior: "allow",
      enabled: slideHotkeysEnabled,
    },
  );
  useHotkey(
    bindingKeys(shortcuts, "viewer.next-slide"),
    (event) => {
      event.preventDefault();
      step(1);
    },
    {
      preventDefault: false,
      ignoreInputs: true,
      conflictBehavior: "allow",
      enabled: slideHotkeysEnabled,
    },
  );

  useEffect(() => {
    onActiveFileIndexChange?.(activeItem?.fileIndex ?? null);
  }, [activeItem?.fileIndex, onActiveFileIndexChange]);

  useEffect(() => {
    if (!navRef) return;
    navRef.current = { step };
    return () => {
      navRef.current = null;
    };
  }, [navRef, step]);

  const previousUrl = preloadableImageUrl(items[boundedIndex - 1]);
  const nextUrl = preloadableImageUrl(items[boundedIndex + 1]);
  useEffect(() => {
    if (!previousUrl && !nextUrl) return;
    const timer = window.setTimeout(() => {
      if (nextUrl) preloadImage(nextUrl);
      if (previousUrl) preloadImage(previousUrl);
    }, PRELOAD_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [previousUrl, nextUrl]);

  const target = useMemo<StageEntry<StageItem> | null>(
    () =>
      activeItem
        ? {
            key: `${save.id}:${activeItem.key}`,
            holds: isMediaItem(activeItem),
            value: { save, item: activeItem, chapters },
          }
        : null,
    [activeItem, chapters, save],
  );
  const stage = useHeldStage(target);

  const downloadable = needsVideoDownload(save);
  if (!activeItem && !downloadable) return null;

  return (
    <MediaViewerFrame showControls={showControls}>
      <div className={styles.layers}>
        {stage.layers.map(({ entry, role }) => (
          <StageLayer
            key={entry.key}
            entry={entry}
            held={role === "held"}
            pending={role === "pending"}
            navigation={navigation}
            onNavigate={onNavigate}
            onReady={stage.ready}
          />
        ))}
      </div>
      {downloadable ? <VideoDownload key={save.id} save={save} /> : null}
    </MediaViewerFrame>
  );
}

function StageLayer({
  entry,
  held,
  pending,
  navigation,
  onNavigate,
  onReady,
}: {
  entry: StageEntry<StageItem>;
  held: boolean;
  pending: boolean;
  navigation?: ViewerNavigation;
  onNavigate?: (id: string) => void;
  onReady: (key: string) => void;
}) {
  const { key, value } = entry;
  const report = useCallback(() => onReady(key), [key, onReady]);
  return (
    <div
      className={styles.layer}
      data-held={held || undefined}
      data-pending={pending || undefined}
      aria-hidden={held || undefined}
      inert={held}
    >
      <MediaReadyContext value={report}>
        <ViewerItemContent
          save={value.save}
          item={value.item}
          active={!held}
          navigation={held ? undefined : navigation}
          onNavigate={onNavigate}
          chapters={value.chapters}
        />
      </MediaReadyContext>
    </div>
  );
}
